"""Offline, diagnostic adapter for VisionState wheels-v2 (no business writes).

Preprocessing and mechanical decoding adapted from VisionState readers.py.
Copyright 2026 oleost. Licensed under Apache-2.0; see
https://github.com/oleost/VisionState and the retained license in this trial.
Trozy modifications: isolated CPU inference, pinned model verification, bounded
inputs and separate unrounded observations / upstream-rounded display strings.
Neither output is an approved meter reading or a calibrated correctness score.
"""

from __future__ import annotations

import hashlib
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

MODEL_SHA256 = "5644705e1f0e684b30bf3c7a6cb23e7eb1ddda616cd16b5321423f45bf7fd8b6"
SLACK_BINS = 1
MAX_SHIFT_BINS = 2
SHIFT_PENALTY = 0.3
WEAKEST_BINS = 4
TOP_POSITIONS = 3
MAX_PIXELS = 24_000_000


def _digits(digits: int) -> None:
    if type(digits) is not int or not 1 <= digits <= 12:
        raise ValueError("A configured wheel count from 1 to 12 is required")


def validate_frame(frame: Image.Image, box: tuple[int, int, int, int], digits: int) -> None:
    _digits(digits)
    if not isinstance(frame, Image.Image) or frame.width * frame.height > MAX_PIXELS:
        raise ValueError("Expected a decoded image of at most 24 million pixels")
    if len(box) != 4 or any(type(value) is not int for value in box):
        raise ValueError("Expected four integer pixel coordinates")
    x0, y0, x1, y1 = box
    if not (0 <= x0 < x1 <= frame.width and 0 <= y0 < y1 <= frame.height):
        raise ValueError("The entire wheel row must be inside the decoded frame")
    if x1 - x0 < digits:
        raise ValueError("The wheel row has fewer pixels than configured wheels")


def wheel_cells(image: Image.Image, digits: int, width: int = 32, height: int = 48) -> np.ndarray:
    """Upstream cell preprocessing: darkest channel, resize, 1% autocontrast."""
    _digits(digits)
    grey = Image.fromarray(np.asarray(image.convert("RGB")).min(axis=2))
    cell = grey.width / digits
    out = []
    for i in range(digits):
        part = grey.crop((round(i * cell), 0, max(round(i * cell) + 1, round((i + 1) * cell)), grey.height))
        part = ImageOps.autocontrast(part.resize((width, height), Image.Resampling.BILINEAR), cutoff=1)
        out.append(np.asarray(part, dtype=np.float32) / 255.0)
    return np.stack(out)


def wheel_context_cells(
    image: Image.Image,
    box: tuple[int, int, int, int],
    digits: int,
    width: int = 64,
    height: int = 48,
    context: float = 0.5,
) -> np.ndarray:
    """Upstream context preprocessing, retaining half a cell on each side."""
    x0, y0, x1, y1 = box
    cell = (x1 - x0) / digits
    pad = math.ceil(cell * context) + 2
    grey = np.pad(np.asarray(image.convert("RGB")).min(axis=2), ((0, 0), (pad, pad)), mode="edge")
    wide = Image.fromarray(grey)
    out = []
    for i in range(digits):
        a = round(x0 + (i - context) * cell + pad)
        b = max(a + 1, round(x0 + (i + 1 + context) * cell + pad))
        part = wide.crop((a, y0, b, max(y0 + 1, y1)))
        part = ImageOps.autocontrast(part.resize((width, height), Image.Resampling.BILINEAR), cutoff=1)
        out.append(np.asarray(part, dtype=np.float32) / 255.0)
    return np.stack(out)


def wheel_decode(logp: np.ndarray) -> tuple[float, float, list[int]]:
    """Upstream dynamic programming decoder for linked mechanical wheels.

    Values are in units of the last wheel, not kWh/m3. Upper wheels start
    turning only while their right neighbour traverses 9 -> 0.
    """
    if logp.ndim != 2 or logp.shape[1] != 100 or not 1 <= logp.shape[0] <= 12:
        raise ValueError("Expected one row of 100 position scores per configured wheel")
    if not np.isfinite(logp).all():
        raise ValueError("Position scores must be finite")
    wheels, bins = logp.shape
    tenth = bins // 10
    best = logp[-1].copy()
    back = []
    for k in range(wheels - 2, -1, -1):
        rest = int(best[: 9 * tenth + 1].argmax())
        lead = np.concatenate([[best[rest]], best[9 * tenth + 1 :]])
        lead_bin = np.concatenate([[rest], np.arange(9 * tenth + 1, bins)])
        best = (logp[k].reshape(10, tenth) + lead[None, :]).reshape(bins)
        back.append(np.tile(lead_bin, 10))
    b = int(best.argmax())
    score = float(best[b])
    at = [b]
    for arg in reversed(back):
        b = int(arg[b])
        at.append(b)
    value = 0.0
    for a in at[:-1]:
        value = value * 10 + a // tenth
    return value * 10 + at[-1] / tenth, score, at


def decode_probabilities(probs: np.ndarray, digits: int) -> dict:
    """Decode exactly as wheels-v2, preserving the pre-rounding observation."""
    _digits(digits)
    probs = np.asarray(probs, dtype=np.float64)
    if probs.shape != (digits, 100):
        raise ValueError("Model output count must equal the configured wheel count")
    if not np.isfinite(probs).all() or (probs < 0).any() or not np.allclose(probs.sum(axis=1), 1, atol=1e-7):
        raise ValueError("Expected normalized, finite position probabilities")
    near = sum(np.roll(probs, s, axis=1) for s in range(-SLACK_BINS, SLACK_BINS + 1))
    logp = np.log(np.maximum(near, 1e-12))
    best = None
    for shift in range(-MAX_SHIFT_BINS, MAX_SHIFT_BINS + 1):
        value, score, at = wheel_decode(np.roll(logp, -shift, axis=1))
        score -= SHIFT_PENALTY * abs(shift)
        if best is None or score > best[1]:
            best = (value, score, at, shift)
    value, score, at, shift = best
    neighbours = np.arange(-WEAKEST_BINS, WEAKEST_BINS + 1)
    p = [float(probs[k, (b + shift + neighbours) % 100].sum()) for k, b in enumerate(at)]
    number = math.floor(value + 0.5) % 10**digits
    per_wheel = []
    for k, b in enumerate(at):
        order = np.argsort(probs[k])[::-1][:TOP_POSITIONS]
        per_wheel.append({
            "index": k,
            "position": round((b + shift) % 100 / 10, 1),
            "probability": p[k],
            "top": [[round(int(i) / 10, 1), float(probs[k, i])] for i in order],
        })
    return {
        "model": "wheels-v2",
        "configuredDigits": digits,
        "rawValueLastWheelUnits": value,
        "unroundedDigits": f"{math.floor(value):0{digits}d}",
        "upstreamRoundedDigits": f"{number:0{digits}d}",
        "upstreamRoundingWrapped": math.floor(value + 0.5) >= 10**digits,
        "confidence": min(p),
        "confidenceRule": "weakest-wheel-probability-within-4-bins",
        "decodedBins": at,
        "shiftBins": shift,
        "logScore": score,
        "perWheel": per_wheel,
        "positionProbabilities": probs.tolist(),
        "requiresHumanReview": True,
    }


class WheelReader:
    """Small wheels-v2 CPU adapter. It never downloads a missing model."""

    def __init__(self, model_path: str | Path, *, threads: int = 2, verify_hash: bool = True):
        import onnxruntime as ort

        path = Path(model_path)
        if not path.is_file():
            raise FileNotFoundError(f"Prepared wheels-v2 model is missing: {path}")
        if verify_hash and hashlib.sha256(path.read_bytes()).hexdigest() != MODEL_SHA256:
            raise ValueError("wheels-v2 SHA-256 does not match the pinned VisionState registry")
        options = ort.SessionOptions()
        options.intra_op_num_threads = max(1, min(int(threads), 8))
        options.inter_op_num_threads = 1
        self.session = ort.InferenceSession(str(path), sess_options=options, providers=["CPUExecutionProvider"])
        self.input_names = [item.name for item in self.session.get_inputs()]
        self.output_name = self.session.get_outputs()[0].name
        if len(self.input_names) != 2:
            raise ValueError("wheels-v2 requires cell and context inputs")

    def inputs(self, frame: Image.Image, box: tuple[int, int, int, int], digits: int) -> list[np.ndarray]:
        validate_frame(frame, box, digits)
        return [wheel_cells(frame.crop(box), digits), wheel_context_cells(frame, box, digits)]

    def read(self, frame: Image.Image, box: tuple[int, int, int, int], digits: int) -> dict:
        arrays = self.inputs(frame, box, digits)
        feed = {name: x[:, None] for name, x in zip(self.input_names, arrays, strict=True)}
        logits = np.asarray(self.session.run([self.output_name], feed)[0], dtype=np.float64)
        if logits.shape != (digits, 100) or not np.isfinite(logits).all():
            raise ValueError("wheels-v2 returned an invalid position tensor")
        logits -= logits.max(axis=1, keepdims=True)
        probs = np.exp(logits)
        probs /= probs.sum(axis=1, keepdims=True)
        return decode_probabilities(probs, digits)

    def cells_image(self, frame: Image.Image, box: tuple[int, int, int, int], digits: int) -> Image.Image:
        validate_frame(frame, box, digits)
        cells = (wheel_cells(frame.crop(box), digits) * 255).astype(np.uint8)
        gap = 2
        line = Image.new("L", (digits * (32 + gap) - gap, 48), 255)
        for i, cell in enumerate(cells):
            line.paste(Image.fromarray(cell), (i * (32 + gap), 0))
        return line.resize((line.width * 2, 96), Image.Resampling.NEAREST).convert("RGB")
