"""Offline YOLOv8-OBB window detection and geometry for the Trozy feasibility trial.

Uses the installed Ultralytics implementation for preprocessing/inference/NMS;
no handwritten substitute for that model's postprocessing is used here. This
adapter never downloads weights, uploads photos, reads a database, or applies a
meter reading. Input pixels must already be EXIF-normalized RGB.

OBB geometry has no 180-degree reading direction. Rectification's default takes
the long edge pointing towards image-right; ``half_turn=True`` is a separate,
explicit diagnostic, not an answer chosen using an expected number.
"""

from __future__ import annotations

import math
import os
from pathlib import Path
from time import perf_counter
from typing import Any

import cv2
import numpy as np
from PIL import Image


PROJECT_ROOT = Path(__file__).resolve().parents[2]


def _as_rgb(image: Image.Image | np.ndarray) -> np.ndarray:
    if isinstance(image, Image.Image):
        pixels = np.asarray(image.convert("RGB"))
    else:
        pixels = np.asarray(image)
    if pixels.dtype != np.uint8 or pixels.ndim != 3 or pixels.shape[2] != 3:
        raise ValueError("Expected an EXIF-normalized RGB uint8 image")
    if min(pixels.shape[:2]) < 2 or pixels.shape[0] * pixels.shape[1] > 24_000_000:
        raise ValueError("Image dimensions outside the offline trial limit")
    return np.ascontiguousarray(pixels)


def _polygon(points: Any, preserve_order: bool = False) -> np.ndarray:
    result = np.asarray(points, dtype=np.float64)
    if result.shape != (4, 2) or not np.isfinite(result).all():
        raise ValueError("A finite four-corner row polygon is required")
    hull = cv2.convexHull(result.astype(np.float32)).reshape(-1, 2)
    if len(hull) != 4 or cv2.contourArea(hull) < 16:
        raise ValueError("Row polygon is degenerate or not a convex quadrilateral")
    if preserve_order:
        if not cv2.isContourConvex(result.astype(np.float32)):
            raise ValueError("Ordered row polygon must be convex without crossing edges")
        return result
    return hull.astype(np.float64)


def _ordered_corners(points: Any) -> np.ndarray:
    """Order a row TL/TR/BR/BL using geometry alone, preserving a half-turn ambiguity."""
    points = _polygon(points)
    center = points.mean(axis=0)
    order = np.argsort(np.arctan2(points[:, 1] - center[1], points[:, 0] - center[0]))
    cyclic = points[order]
    edges = np.roll(cyclic, -1, axis=0) - cyclic
    along = edges[int(np.linalg.norm(edges, axis=1).argmax())].copy()
    along /= np.linalg.norm(along)
    if along[0] < -1e-8 or (abs(along[0]) <= 1e-8 and along[1] < 0):
        along *= -1
    down = np.array([-along[1], along[0]])
    choices = []
    for sequence in (cyclic, cyclic[::-1]):
        for start in range(4):
            q = np.roll(sequence, -start, axis=0)
            horizontal = (q[1] - q[0]) + (q[2] - q[3])
            vertical = (q[3] - q[0]) + (q[2] - q[1])
            score = float(horizontal @ along + vertical @ down)
            choices.append((score, q))
    return max(choices, key=lambda value: value[0])[1].astype(np.float32)


def _region_corners(region: Any) -> np.ndarray:
    if isinstance(region, dict):
        if "corners" in region:
            return _polygon(region["corners"], preserve_order=True)
        if "polygon" in region:
            return _polygon(region["polygon"], preserve_order=True)
        if "box" in region:
            return _region_corners(region["box"])
        if all(key in region for key in ("left", "top", "right", "bottom")):
            region = [region[key] for key in ("left", "top", "right", "bottom")]
        elif all(key in region for key in ("left", "top", "width", "height")):
            x, y, width, height = [region[key] for key in ("left", "top", "width", "height")]
            region = [x, y, x + width, y + height]
        else:
            raise ValueError("Manual region needs a polygon or pixel LTRB box")
    values = np.asarray(region, dtype=np.float64)
    if values.shape == (4, 2):
        return _polygon(values, preserve_order=True)
    if values.shape != (4,) or not np.isfinite(values).all():
        raise ValueError("Manual region needs a finite polygon or pixel LTRB box")
    left, top, right, bottom = values
    if right <= left or bottom <= top:
        raise ValueError("Manual LTRB box must have positive width and height")
    return _polygon([[left, top], [right, top], [right, bottom], [left, bottom]], preserve_order=True)


def rectify_manual(
    image: Image.Image | np.ndarray,
    region: Any,
    digits: int,
    half_turn: bool = False,
) -> dict[str, Any]:
    """Rectify a known row and retain actual half-cell context from the original.

    The row box is kept separate from the expanded image. Pass both to the v2
    wheel reader; passing the expanded image as the row changes the cell grid.
    For a manual trapezoid this is four-point perspective rectification. A YOLO
    OBB supplies a rectangle only, so that path corrects in-plane rotation, not
    the unknown perspective distortion of the real printed window.
    """
    pixels = _as_rgb(image)
    if isinstance(digits, bool) or not isinstance(digits, int) or not 1 <= digits <= 16:
        raise ValueError("Configure an explicit wheel count from 1 to 16")
    # A manual quadrilateral is an independent annotation in *reading order*.
    # Keep its direction, including vertical or upside-down rows; do not replace
    # the annotation with an orientation selected by model score or reference text.
    corners = _region_corners(region).astype(np.float32)
    source_height, source_width = pixels.shape[:2]
    if ((corners[:, 0] < 0).any() or (corners[:, 0] > source_width).any()
            or (corners[:, 1] < 0).any() or (corners[:, 1] > source_height).any()):
        raise ValueError("Row polygon extends outside the original image")
    width = max(2, round((np.linalg.norm(corners[1] - corners[0]) + np.linalg.norm(corners[2] - corners[3])) / 2))
    height = max(2, round((np.linalg.norm(corners[3] - corners[0]) + np.linalg.norm(corners[2] - corners[1])) / 2))
    if width / height < 1.2:
        raise ValueError("Selected region does not resemble a horizontal wheel row")
    if width * height > 8_000_000:
        raise ValueError("Rectified row dimensions exceed trial limit")
    context_x = max(1, math.ceil(width / digits / 2))
    context_y = max(2, round(height * 0.1))
    output_width, output_height = width + 2 * context_x, height + 2 * context_y
    destination = np.array([
        [context_x, context_y],
        [context_x + width, context_y],
        [context_x + width, context_y + height],
        [context_x, context_y + height],
    ], dtype=np.float32)
    transform = cv2.getPerspectiveTransform(corners, destination)
    # BORDER_REPLICATE matches the reader's edge policy where context extends
    # outside the camera frame; the condition is recorded rather than hidden.
    warped = cv2.warpPerspective(
        pixels, transform, (output_width, output_height),
        flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE,
    )
    row_box = (context_x, context_y, context_x + width, context_y + height)
    inverse = np.linalg.inv(transform)
    output_edges = np.array([[[0, 0], [output_width, 0], [output_width, output_height], [0, output_height]]], dtype=np.float64)
    context_source = cv2.perspectiveTransform(output_edges, inverse)[0]
    context_clipped = bool(
        (context_source[:, 0] < 0).any() or (context_source[:, 0] > source_width).any()
        or (context_source[:, 1] < 0).any() or (context_source[:, 1] > source_height).any()
    )
    if half_turn:
        warped = np.ascontiguousarray(warped[::-1, ::-1])
        left, top, right, bottom = row_box
        row_box = (output_width - right, output_height - bottom, output_width - left, output_height - top)
        flip = np.array([[-1, 0, output_width - 1], [0, -1, output_height - 1], [0, 0, 1]], dtype=np.float64)
        transform = flip @ transform
    return {
        "image": Image.fromarray(warped, "RGB"),
        "row_box": row_box,
        "geometry": {
            "source_corners": corners.tolist(),
            "source_size": [source_width, source_height],
            "rectified_size": [output_width, output_height],
            "row_box": list(row_box),
            "row_width": width,
            "row_height": height,
            "cell_width": width / digits,
            "context_half_cells": 0.5,
            "context_source_corners": context_source.tolist(),
            "context_crosses_source_boundary": context_clipped,
            "homography_source_to_output": transform.tolist(),
            "half_turn": bool(half_turn),
            "orientation_policy": "manual annotation corners preserved in reading order; half-turn is explicit",
            "orientation_ambiguous_by_half_turn": False,
            "wheel_count_source": "independent configuration, not predicted labels",
        },
    }


def rectify_window(
    image: Image.Image | np.ndarray,
    window: dict[str, Any],
    digits: int,
    half_turn: bool = False,
) -> dict[str, Any]:
    ordered = _ordered_corners(window["corners"])
    result = rectify_manual(image, {"corners": ordered}, digits, half_turn)
    result["geometry"]["source"] = "yolo-obb-window"
    result["geometry"]["perspective_observed"] = False
    result["geometry"]["orientation_policy"] = "long edge towards image-right; half-turn is explicit"
    result["geometry"]["orientation_ambiguous_by_half_turn"] = True
    return result


class YoloWindowDetector:
    """CPU-only local .pt reference inference; output selection never reads labels."""

    def __init__(
        self,
        model_path: str | Path,
        image_size: int = 640,
        confidence: float = 0.25,
        iou: float = 0.45,
    ) -> None:
        model_path = Path(model_path).resolve()
        if not model_path.is_relative_to(PROJECT_ROOT) or not model_path.is_file():
            raise ValueError("Use an existing project-local model file; no downloads during inference")
        if model_path.suffix.lower() != ".pt":
            raise ValueError("Initial trial uses the reference Ultralytics .pt runtime")
        if image_size < 128 or image_size > 2048 or image_size % 32:
            raise ValueError("YOLO image size must be a multiple of 32 in 128..2048")
        if not 0 < confidence < 1 or not 0 < iou < 1:
            raise ValueError("Confidence and IoU thresholds must be in (0,1)")
        os.environ["YOLO_CONFIG_DIR"] = str(PROJECT_ROOT / ".cache" / "ultralytics-meter-trial")
        os.environ["MPLCONFIGDIR"] = str(PROJECT_ROOT / ".cache" / "meter-trial-matplotlib")
        os.environ["TORCH_HOME"] = str(PROJECT_ROOT / ".runtime" / "meter-digits" / "visionstate-yolo" / "cache" / "torch")
        os.environ["YOLO_AUTOINSTALL"] = "false"
        os.environ["YOLO_OFFLINE"] = "true"
        from ultralytics import YOLO

        self.model = YOLO(str(model_path), task="obb")
        self.image_size = image_size
        self.confidence = confidence
        self.iou = iou
        self.model_path = model_path

    def detect(self, image: Image.Image | np.ndarray) -> dict[str, Any]:
        pixels = _as_rgb(image)
        started = perf_counter()
        # PIL identifies the input as RGB; passing the same numpy image directly
        # would make Ultralytics treat its channels as BGR.
        results = self.model.predict(
            source=Image.fromarray(pixels, "RGB"),
            imgsz=self.image_size,
            conf=self.confidence,
            iou=self.iou,
            device="cpu",
            save=False,
            save_txt=False,
            save_crop=False,
            verbose=False,
            augment=False,
            rect=False,
            max_det=100,
        )
        result = results[0]
        detections = []
        if result.obb is not None:
            corners = result.obb.xyxyxyxy.detach().cpu().numpy()
            xywhr = result.obb.xywhr.detach().cpu().numpy()
            scores = result.obb.conf.detach().cpu().numpy()
            classes = result.obb.cls.detach().cpu().numpy().astype(int)
            for points, parameters, score, class_id in zip(corners, xywhr, scores, classes):
                detections.append({
                    "corners": points.astype(float).tolist(),
                    "xywhr": parameters.astype(float).tolist(),
                    "confidence": float(score),
                    "class_id": int(class_id),
                    "class_name": str(result.names[int(class_id)]),
                })
        windows = [row for row in detections if row["class_name"].lower() == "window"]
        selected = None
        reasons = []
        if not windows:
            status = "no_window"
            reasons.append("No window detection passed the fixed confidence threshold")
        elif len(windows) > 1:
            status = "ambiguous_window"
            reasons.append("Multiple window candidates; no automatic largest-box selection")
        else:
            candidate = windows[0]
            try:
                points = _ordered_corners(candidate["corners"])
                width = float((np.linalg.norm(points[1] - points[0]) + np.linalg.norm(points[2] - points[3])) / 2)
                height = float((np.linalg.norm(points[3] - points[0]) + np.linalg.norm(points[2] - points[1])) / 2)
                if width < 20 or height < 8 or width / height < 1.2:
                    reasons.append("Detected window is too small or has an unsuitable aspect ratio")
                h, w = pixels.shape[:2]
                if (points[:, 0] < -0.5).any() or (points[:, 0] > w + 0.5).any() or (points[:, 1] < -0.5).any() or (points[:, 1] > h + 0.5).any():
                    reasons.append("Detected window extends outside the original image")
                candidate["row_width"] = width
                candidate["row_height"] = height
            except ValueError as error:
                reasons.append(str(error))
            status = "invalid_window" if reasons else "selected"
            if status == "selected":
                selected = candidate
        return {
            "status": status,
            "selected": selected,
            "windows": windows,
            "detections": detections,
            "reasons": reasons,
            "elapsed_ms": round((perf_counter() - started) * 1000, 3),
            "image_size": [int(pixels.shape[1]), int(pixels.shape[0])],
            "parameters": {"imgsz": self.image_size, "confidence": self.confidence, "iou": self.iou, "rect": False, "device": "cpu"},
            "orientation_ambiguous_by_half_turn": True,
        }
