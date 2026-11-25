"""Build high-realism Mechanical Electric Meter dataset for PaddleOCR Det & Rec.

Addresses real failure modes of generic PP-OCRv6 on mechanical roller kWh meters:
1. Detector merging the dark roller window with adjacent 'kWh' or '10000..1/10',
   or clipping the red-framed 1/10 fractional wheel (both on full faceplates and
   on Pass-2 rectify_manual half-cell context crops).
2. Recognizer misreading the red-framed 1/10 wheel as '回' or dropping it while
   preserving 'kWh' and general Vietnamese/technical faceplate text recognition.

Strictly excludes .runtime/datasets/meter/* evaluation fixtures (zero leakage).
"""
from __future__ import annotations

import hashlib
import io
import json
import math
import os
from pathlib import Path
import random
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parents[2]
RUNTIME_SITE = ROOT / '.runtime/paddleocr/site-packages'
if RUNTIME_SITE.exists() and str(RUNTIME_SITE) not in sys.path:
    sys.path.insert(0, str(RUNTIME_SITE))

import cv2
import numpy as np
import polars as pl
from PIL import Image, ImageDraw, ImageFont

RAW_DIR = ROOT / '.runtime/datasets/raw'
ELECTRIC_DIR = ROOT / '.runtime/datasets/electric'
DET_DIR = ELECTRIC_DIR / 'paddle-det'
REC_DIR = ELECTRIC_DIR / 'paddle-rec'
MANIFEST_FILE = ELECTRIC_DIR / 'manifest.jsonl'

FONT_DIR = Path('C:/Windows/Fonts')
WHEEL_FONT_FILES = ['bahnschrift.ttf', 'arialbd.ttf', 'trebucbd.ttf', 'tahomabd.ttf', 'consolab.ttf', 'calibrib.ttf']
PLATE_FONT_FILES = ['arial.ttf', 'arialbd.ttf', 'tahomabd.ttf', 'calibrib.ttf', 'verdanab.ttf']
_FONT_CACHE: dict[tuple[str, int], ImageFont.FreeTypeFont | ImageFont.ImageFont] = {}


def log(msg: str) -> None:
    print(f"[build_electric] {msg}", flush=True)


def get_font(names: list[str], size: int, rng: random.Random):
    choice = rng.choice(names)
    key = (choice, size)
    if key not in _FONT_CACHE:
        p = FONT_DIR / choice
        if p.exists():
            _FONT_CACHE[key] = ImageFont.truetype(str(p), size)
        else:
            _FONT_CACHE[key] = ImageFont.load_default()
    return _FONT_CACHE[key]


def safe_clear_dir(target: Path) -> None:
    resolved = target.resolve()
    elec_resolved = ELECTRIC_DIR.resolve()
    if not resolved.is_relative_to(elec_resolved) or resolved == elec_resolved:
        raise RuntimeError(f"Refusing to clear unexpected directory: {resolved}")
    if resolved.exists():
        if resolved.is_symlink():
            raise RuntimeError(f"Refusing to delete symlink: {resolved}")
        for item in resolved.rglob('*'):
            if item.is_symlink():
                raise RuntimeError(f"Refusing to delete nested symlink: {item}")
        shutil.rmtree(resolved)
    resolved.mkdir(parents=True, exist_ok=True)


def init_dirs() -> None:
    ELECTRIC_DIR.mkdir(parents=True, exist_ok=True)
    for split in ['train', 'val', 'test']:
        safe_clear_dir(DET_DIR / 'images' / split)
        safe_clear_dir(REC_DIR / 'images' / split)


def render_mechanical_register(digits_str: str, decimals: int, cell_w: int, cell_h: int, rng: random.Random) -> np.ndarray:
    """Render a realistic mechanical drum counter window (RGB uint8) of size (H, W, 3)."""
    n = len(digits_str)
    pad_x = max(2, round(cell_w * rng.uniform(0.08, 0.16)))
    pad_y = max(2, round(cell_h * rng.uniform(0.08, 0.16)))
    reg_w = n * cell_w + 2 * pad_x
    reg_h = cell_h + 2 * pad_y

    housing_val = rng.randint(16, 46)
    housing = np.full((reg_h, reg_w, 3), housing_val, dtype=np.uint8)
    # Recessed metallic inner border
    cv2.rectangle(housing, (0, 0), (reg_w - 1, reg_h - 1), (housing_val + 25, housing_val + 25, housing_val + 25), 1)

    font_size = max(14, round(cell_h * rng.uniform(0.68, 0.84)))
    wheel_font = get_font(WHEEL_FONT_FILES, font_size, rng)

    frac_style = rng.choice(['red_frame', 'red_frame', 'red_solid', 'red_double_frame'])
    red_rgb = (rng.randint(175, 238), rng.randint(22, 62), rng.randint(22, 62))
    drum_base = rng.randint(20, 56)
    digit_val = rng.randint(212, 252)
    digit_rgb = (digit_val, digit_val - rng.randint(0, 10), digit_val - rng.randint(0, 18))

    for idx, ch in enumerate(digits_str):
        is_frac = decimals > 0 and idx >= n - decimals
        x0 = pad_x + idx * cell_w
        y0 = pad_y
        slot_margin = max(1, round(cell_w * rng.uniform(0.04, 0.09)))
        wx0, wx1 = x0 + slot_margin, x0 + cell_w - slot_margin
        wy0, wy1 = y0 + 1, y0 + cell_h - 1
        ww, wh = max(4, wx1 - wx0), max(6, wy1 - wy0)

        # Create individual cylindrical drum wheel
        wheel_pil = Image.new('RGB', (ww, wh), red_rgb if (is_frac and frac_style == 'red_solid') else (drum_base, drum_base, drum_base + 2))
        draw = ImageDraw.Draw(wheel_pil)

        # Slight realistic mechanical wheel vertical offset (never ambiguous 50/50 mid-roll)
        y_shift = rng.uniform(-0.13, 0.13) * wh
        bbox = draw.textbbox((0, 0), ch, font=wheel_font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        tx = (ww - tw) / 2.0 - bbox[0] + rng.uniform(-0.6, 0.6)
        ty = (wh - th) / 2.0 - bbox[1] + y_shift
        draw.text((tx, ty), ch, fill=digit_rgb, font=wheel_font)

        # Neighbor digit edge peek when wheel is slightly shifted
        if abs(y_shift) > 0.07 * wh:
            neighbor = str((int(ch) + (1 if y_shift < 0 else -1)) % 10)
            nty = ty + (wh * 0.92 if y_shift < 0 else -wh * 0.92)
            draw.text((tx, nty), neighbor, fill=digit_rgb, font=wheel_font)

        wheel_np = np.asarray(wheel_pil, dtype=np.float32)
        # Cylindrical vertical drum shading (curved shadow at top & bottom + mid sheen)
        v_coord = np.linspace(-1.0, 1.0, wh, dtype=np.float32)[:, None, None]
        shade = 1.0 - 0.36 * (v_coord ** 2)
        if rng.random() < 0.6:
            sheen_pos = rng.uniform(-0.45, 0.15)
            shade += rng.uniform(0.05, 0.16) * np.exp(-((v_coord - sheen_pos) ** 2) / 0.04)
        wheel_np = np.clip(wheel_np * shade, 0, 255).astype(np.uint8)
        housing[wy0:wy1, wx0:wx1] = wheel_np

        # Metallic divider line between wheels
        if idx > 0:
            div_c = rng.randint(55, 115)
            cv2.line(housing, (x0, y0), (x0, y0 + cell_h - 1), (div_c, div_c, div_c), 1)

        # Red rectangular bezel around fractional wheel(s) (GELEX EMIC CV140 style!)
        if is_frac and frac_style in ('red_frame', 'red_double_frame'):
            thk = max(2, round(min(cell_w, cell_h) * rng.uniform(0.08, 0.14)))
            cv2.rectangle(housing, (x0, max(0, y0 - 1)), (min(reg_w - 1, x0 + cell_w - 1), min(reg_h - 1, y0 + cell_h)), red_rgb, thk)
            if frac_style == 'red_double_frame' and cell_w >= 20:
                cv2.rectangle(housing, (x0 + thk, y0 + thk - 1), (x0 + cell_w - 1 - thk, y0 + cell_h - thk), (215, 215, 215), 1)

    return housing


def draw_tracked_text(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, font, fill, boxes: list[dict], transcript: str | None = None):
    bbox = draw.textbbox(xy, text, font=font)
    x0, y0, x1, y1 = bbox[0] - 1, bbox[1] - 1, bbox[2] + 1, bbox[3] + 1
    if x1 - x0 >= 6 and y1 - y0 >= 5:
        draw.text(xy, text, fill=fill, font=font)
        boxes.append({
            'transcription': transcript if transcript is not None else text,
            'points': [[float(x0), float(y0)], [float(x1), float(y0)], [float(x1), float(y1)], [float(x0), float(y1)]],
        })


def warp_scene_and_boxes(rgb: np.ndarray, boxes: list[dict], rng: random.Random, max_deg: float = 9.0):
    h, w = rgb.shape[:2]
    angle = rng.uniform(-max_deg, max_deg)
    scale = rng.uniform(0.92, 1.04)
    m_aff = cv2.getRotationMatrix2D((w / 2.0, h / 2.0), angle, scale)
    m_persp = np.vstack([m_aff, [rng.uniform(-1.2e-4, 1.2e-4), rng.uniform(-1.2e-4, 1.2e-4), 1.0]])

    warped = cv2.warpPerspective(rgb, m_persp, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)

    # Glass glare / directional lighting gradient
    wf = warped.astype(np.float32)
    gx = np.linspace(0.0, 1.0, w, dtype=np.float32)[None, :, None]
    gy = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None, None]
    grad = 1.0 + rng.uniform(-0.18, 0.18) * (gx - 0.5) + rng.uniform(-0.18, 0.18) * (gy - 0.5)
    wf *= grad
    if rng.random() < 0.55:
        # Diagonal glass reflection band
        ang_g = rng.uniform(0.3, 1.2)
        pos_g = rng.uniform(0.25, 0.85)
        width_g = rng.uniform(0.04, 0.14)
        band = np.exp(-(((gx * math.cos(ang_g) + gy * math.sin(ang_g)) - pos_g) ** 2) / (2 * width_g * width_g))
        wf += rng.uniform(18.0, 58.0) * band

    # Sensor noise
    np_rng = np.random.default_rng(rng.randint(0, 10_000_000))
    if rng.random() < 0.7:
        wf += np_rng.normal(0.0, rng.uniform(2.0, 7.5), wf.shape).astype(np.float32)
    out = np.clip(wf, 0, 255).astype(np.uint8)
    if rng.random() < 0.55:
        k = rng.choice([3, 3, 5])
        out = cv2.GaussianBlur(out, (k, k), rng.uniform(0.45, 1.15))

    # Transform and clip boxes
    out_boxes = []
    for b in boxes:
        pts = np.array(b['points'], dtype=np.float64)[None, :, :]
        tpts = cv2.perspectiveTransform(pts, m_persp)[0]
        if (tpts[:, 0] < 1).any() or (tpts[:, 0] > w - 2).any() or (tpts[:, 1] < 1).any() or (tpts[:, 1] > h - 2).any():
            # Keep counter box check strict; skip clipped peripheral boxes
            if b.get('is_counter'):
                return None, None
            continue
        out_boxes.append({
            'transcription': b['transcription'],
            'points': [[round(float(x), 1), round(float(y), 1)] for x, y in tpts],
            'is_counter': bool(b.get('is_counter', False)),
        })
    return out, out_boxes


def generate_full_faceplate(rng: random.Random):
    """Synthesize a cluttered mechanical kWh meter faceplate + exact polygon boxes."""
    landscape = rng.random() < 0.42
    w = rng.randint(520, 820) if landscape else rng.randint(410, 620)
    h = rng.randint(420, 600) if landscape else rng.randint(580, 780)

    # Outer meter wall / casing background
    wall_c = rng.randint(35, 165)
    canvas = np.full((h, w, 3), (wall_c, max(20, wall_c - rng.randint(0, 15)), max(20, wall_c - rng.randint(0, 20))), dtype=np.uint8)

    # Metallic faceplate rectangle
    px0 = rng.randint(int(w * 0.08), int(w * 0.24))
    px1 = w - rng.randint(int(w * 0.06), int(w * 0.16))
    py0 = rng.randint(int(h * 0.12), int(h * 0.24))
    py1 = h - rng.randint(int(h * 0.14), int(h * 0.26))
    pw, ph = px1 - px0, py1 - py0
    if pw < 240 or ph < 220:
        px0, py0, px1, py1 = 40, 60, w - 40, h - 60
        pw, ph = px1 - px0, py1 - py0

    plate_base = rng.randint(182, 238)
    plate_rgb = (plate_base, plate_base - rng.randint(0, 8), plate_base - rng.randint(0, 16))
    cv2.rectangle(canvas, (px0, py0), (px1, py1), plate_rgb, -1)
    cv2.rectangle(canvas, (px0, py0), (px1, py1), (90, 90, 95), rng.randint(2, 4))

    # Choose wheel layout (predominantly 6 wheels = 5+1, plus 5 wheels = 4+1 and 7 wheels = 6+1)
    digits_len, decimals = rng.choices([(6, 1), (5, 1), (6, 0), (7, 1)], weights=[0.62, 0.20, 0.10, 0.08])[0]
    if rng.random() < 0.45:
        lead_zeros = rng.randint(1, max(1, digits_len - 2))
        rem = ''.join(str(rng.randint(0, 9)) for _ in range(digits_len - lead_zeros))
        digits_str = ('0' * lead_zeros) + rem
    else:
        digits_str = ''.join(str(rng.randint(0, 9)) for _ in range(digits_len))

    cell_w = rng.randint(max(19, int(pw * 0.058)), max(23, int(pw * 0.088)))
    cell_h = round(cell_w * rng.uniform(1.22, 1.52))
    reg_img = render_mechanical_register(digits_str, decimals, cell_w, cell_h, rng)
    rh, rw = reg_img.shape[:2]

    rx0 = px0 + rng.randint(max(14, int(pw * 0.10)), max(20, int(pw - rw - 65)))
    ry0 = py0 + rng.randint(int(ph * 0.18), int(ph * 0.34))
    if rx0 + rw + 48 > px1:
        rx0 = max(px0 + 10, px1 - rw - 52)
    canvas[ry0:ry0 + rh, rx0:rx0 + rw] = reg_img

    boxes: list[dict] = [{
        'transcription': digits_str,
        'points': [[float(rx0), float(ry0)], [float(rx0 + rw), float(ry0)], [float(rx0 + rw), float(ry0 + rh)], [float(rx0), float(ry0 + rh)]],
        'is_counter': True,
    }]

    pil = Image.fromarray(canvas, 'RGB')
    draw = ImageDraw.Draw(pil)
    ink = (rng.randint(18, 55), rng.randint(18, 55), rng.randint(22, 60))

    # Top title above register
    f_title = get_font(PLATE_FONT_FILES, max(12, round(cell_h * 0.44)), rng)
    title = rng.choice([
        'CONG TO DIEN 1 PHA 2 DAY',
        'CÔNG TƠ ĐIỆN 1 PHA 2 DÂY',
        'SINGLE PHASE WATTHOUR METER',
        'CONG TO DIEN XOAY CHIEU 1 PHA',
    ])
    draw_tracked_text(draw, (px0 + 16, max(py0 + 10, ry0 - round(cell_h * 0.72))), title, f_title, ink, boxes)

    # Adjacent kWh unit label (separate polygon!) or blue VN sticker covering kWh + 900 vòng/kWh below
    sticker_occludes_kwh = rng.random() < 0.22
    f_kwh = get_font(PLATE_FONT_FILES, max(14, round(cell_h * rng.uniform(0.50, 0.68))), rng)
    kwh_gap = rng.randint(5, 22)
    kx = rx0 + rw + kwh_gap
    ky = ry0 + round((rh - cell_h * 0.55) / 2)
    if not sticker_occludes_kwh and kx + 42 < px1:
        draw_tracked_text(draw, (kx, ky), 'kWh', f_kwh, ink, boxes, transcript='kWh')
    elif kx + 38 < px1:
        # Blue inspection sticker like VN / N52
        sx1, sy1 = min(px1 - 4, kx + 42), min(py1 - 4, ry0 + rh + 6)
        draw.rectangle([kx, ry0 + 2, sx1, sy1], fill=(45, 95, 165))
        f_sm = get_font(PLATE_FONT_FILES, max(10, round(cell_h * 0.34)), rng)
        draw_tracked_text(draw, (kx + 5, ry0 + 4), 'VN', f_sm, (235, 240, 250), boxes)

    # Place-weight scale bar right underneath register (10000 1000 100 10 1 1/10)
    if rng.random() < 0.85:
        f_scale = get_font(PLATE_FONT_FILES, max(9, round(cell_h * 0.30)), rng)
        weights = ['10000', '1000', '100', '10', '1', '1/10'][-digits_len:]
        scale_txt = ' '.join(weights)
        draw_tracked_text(draw, (rx0 + 2, ry0 + rh + rng.randint(2, 7)), scale_txt, f_scale, ink, boxes)

    # Brand, serial number (6-8 digits distractor!), voltage/current/frequency, rev/kWh
    f_mid = get_font(PLATE_FONT_FILES, max(12, round(cell_h * 0.45)), rng)
    f_sub = get_font(PLATE_FONT_FILES, max(11, round(cell_h * 0.38)), rng)
    brand = rng.choice(['GELEX EMIC', 'EMIC', 'VIHEM', 'LANDIS+GYR', 'HUU HONG'])
    y_brand = ry0 + rh + round(cell_h * rng.uniform(0.75, 1.15))
    if y_brand + 75 < py1:
        draw_tracked_text(draw, (px0 + 18, y_brand), brand, f_mid, ink, boxes)
        serial_digits = ''.join(str(rng.randint(0, 9)) for _ in range(rng.choice([6, 8, 8])))
        serial_prefix = rng.choice(['So SX:', 'SSX:', 'No.', 'SER:'])
        y_ser = y_brand + round(cell_h * 0.85)
        col2 = px0 + max(108, int(pw * 0.32))
        col3 = px0 + max(218, int(pw * 0.66))
        draw_tracked_text(draw, (px0 + 20, y_ser), rng.choice(['CV140', 'CE-14', 'MV3E4', 'DD862']), f_sub, ink, boxes)
        draw_tracked_text(draw, (col2, y_ser), f"{serial_prefix}{serial_digits}", f_sub, ink, boxes)

        y_spec = y_ser + round(cell_h * 0.68)
        if y_spec + 45 < py1:
            draw_tracked_text(draw, (px0 + 20, y_spec), '220 V', f_sub, ink, boxes)
            draw_tracked_text(draw, (col2, y_spec), rng.choice(['5(20) A', '10(40) A', '5(30) A']), f_sub, ink, boxes)
            if col3 + 48 < px1:
                draw_tracked_text(draw, (col3, y_spec), '50 Hz', f_sub, ink, boxes)

            y_rev = y_spec + round(cell_h * 0.65)
            if y_rev + 22 < py1:
                rev_txt = rng.choice(['900 vòng/kWh', '900 vong/kWh', '450 rev/kWh', '600 imp/kWh'])
                if sticker_occludes_kwh:
                    rev_txt = '900 vong/kWh'
                draw_tracked_text(draw, (px0 + 18, y_rev), rev_txt, f_sub, ink, boxes)
                if col3 + 44 < px1:
                    draw_tracked_text(draw, (col3, y_rev), str(rng.randint(2011, 2026)), f_sub, ink, boxes)

    rgb = np.asarray(pil, dtype=np.uint8)
    return warp_scene_and_boxes(rgb, boxes, rng, max_deg=9.5)


def generate_pass2_context_crop(rng: random.Random):
    """Synthesize a Pass-2 rectify_manual half-cell context crop for Det & Rec."""
    digits_len, decimals = rng.choices([(6, 1), (5, 1), (6, 0), (7, 1)], weights=[0.65, 0.20, 0.08, 0.07])[0]
    digits_str = ''.join(str(rng.randint(0, 9)) for _ in range(digits_len))
    cell_w = rng.randint(20, 44)
    cell_h = round(cell_w * rng.uniform(1.25, 1.55))
    reg_img = render_mechanical_register(digits_str, decimals, cell_w, cell_h, rng)
    rh, rw = reg_img.shape[:2]

    ctx_x = max(4, math.ceil(rw / digits_len / 2))
    ctx_y = max(3, round(rh * 0.12))
    ow, oh = rw + 2 * ctx_x, rh + 2 * ctx_y

    plate_base = rng.randint(175, 238)
    canvas = np.full((oh, ow, 3), (plate_base, plate_base - 4, plate_base - 8), dtype=np.uint8)
    canvas[ctx_y:ctx_y + rh, ctx_x:ctx_x + rw] = reg_img

    pil = Image.fromarray(canvas, 'RGB')
    draw = ImageDraw.Draw(pil)
    # Often a sliver of 'k' from adjacent 'kWh' or '10000' scale peeks into the context margin!
    if rng.random() < 0.65:
        f_k = get_font(PLATE_FONT_FILES, max(12, round(cell_h * 0.58)), rng)
        kx = ctx_x + rw + rng.randint(3, max(4, ctx_x - 2))
        draw.text((kx, ctx_y + round(rh * 0.2)), 'kWh', fill=(30, 30, 35), font=f_k)

    rgb = np.asarray(pil, dtype=np.uint8)
    if rng.random() < 0.5:
        rgb = cv2.GaussianBlur(rgb, (3, 3), rng.uniform(0.4, 0.95))
    boxes = [{
        'transcription': digits_str,
        'points': [[float(ctx_x), float(ctx_y)], [float(ctx_x + rw), float(ctx_y)], [float(ctx_x + rw), float(ctx_y + rh)], [float(ctx_x), float(ctx_y + rh)]],
        'is_counter': True,
    }]
    return rgb, boxes, digits_str


def generate_technical_control(rng: random.Random):
    """Synthesize clean white-card technical meter diagram so SVG controls never regress."""
    w, h = rng.randint(760, 1040), rng.randint(400, 540)
    pil = Image.new('RGB', (w, h), (255, 255, 255))
    draw = ImageDraw.Draw(pil)
    digits_str = ''.join(str(rng.randint(0, 9)) for _ in range(6))
    bx0, by0 = rng.randint(70, 130), rng.randint(70, 120)
    bw, bh = rng.randint(460, 560), rng.randint(120, 155)
    dark = rng.randint(24, 48)
    draw.rounded_rectangle([bx0, by0, bx0 + bw, by0 + bh], radius=10, fill=(dark, dark + 4, dark + 10))
    f_num = get_font(PLATE_FONT_FILES, rng.randint(84, 108), rng)
    boxes: list[dict] = []
    draw_tracked_text(draw, (bx0 + 34, by0 + 16), digits_str, f_num, (250, 250, 250), boxes, transcript=digits_str)
    boxes[-1]['is_counter'] = True
    f_unit = get_font(PLATE_FONT_FILES, rng.randint(44, 62), rng)
    draw_tracked_text(draw, (bx0 + 18, by0 + bh + rng.randint(32, 65)), 'kWh', f_unit, (18, 22, 28), boxes, transcript='kWh')
    return np.asarray(pil, dtype=np.uint8), boxes


def save_jpg_or_png(rgb: np.ndarray, dst: Path, rng: random.Random) -> bytes:
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    if dst.suffix.lower() in ('.jpg', '.jpeg'):
        qual = rng.randint(60, 94)
        ok, buf = cv2.imencode('.jpg', bgr, [int(cv2.IMWRITE_JPEG_QUALITY), qual])
    else:
        ok, buf = cv2.imencode('.png', bgr)
    if not ok:
        raise RuntimeError(f"Failed to encode image: {dst}")
    raw_bytes = buf.tobytes()
    dst.write_bytes(raw_bytes)
    return raw_bytes


def build_procedural_electric(manifest_entries: list[dict], det_labels: dict[str, list[str]], rec_labels: dict[str, list[str]]) -> None:
    rng = random.Random(20261103)
    split_targets = {'train': 1500, 'val': 180, 'test': 180}

    for split, total in split_targets.items():
        log(f"Synthesizing {total} mechanical electric scenes & crops for {split}...")
        made = 0
        attempts = 0
        while made < total and attempts < total * 3:
            attempts += 1
            u = rng.random()
            if u < 0.68:
                rgb, boxes = generate_full_faceplate(rng)
                kind = 'faceplate'
            elif u < 0.90:
                rgb, boxes, _ = generate_pass2_context_crop(rng)
                kind = 'pass2_crop'
            else:
                rgb, boxes = generate_technical_control(rng)
                kind = 'technical_card'

            if rgb is None or not boxes:
                continue

            ext = '.jpg' if (kind != 'technical_card' and rng.random() < 0.8) else '.png'
            det_name = f"elec_{kind}_{split}_{made:04d}{ext}"
            det_path = DET_DIR / 'images' / split / det_name
            raw_bytes = save_jpg_or_png(rgb, det_path, rng)
            sha = hashlib.sha256(raw_bytes).hexdigest()

            clean_boxes = [{'transcription': b['transcription'], 'points': b['points']} for b in boxes]
            det_labels[split].append(f"images/{split}/{det_name}\t{json.dumps(clean_boxes, ensure_ascii=False)}")

            # Extract crops for Recognition training (counter + unit/faceplate replay)
            h, w = rgb.shape[:2]
            for b_idx, b in enumerate(boxes):
                is_cnt = bool(b.get('is_counter', False))
                if not is_cnt and rng.random() > 0.28:
                    continue
                pts = np.array(b['points'], dtype=np.float32)
                cw = max(8, round(float(np.linalg.norm(pts[1] - pts[0]))))
                ch = max(8, round(float(np.linalg.norm(pts[3] - pts[0]))))
                if cw < 14 or ch < 10:
                    continue
                # Slight natural detector crop jitter on counter boxes
                jx0 = rng.uniform(-2.5, 2.0) if is_cnt else 0.0
                jy0 = rng.uniform(-2.0, 2.0) if is_cnt else 0.0
                jx1 = rng.uniform(-1.5, 3.0) if is_cnt else 0.0
                jy1 = rng.uniform(-2.0, 2.0) if is_cnt else 0.0
                dst_rect = np.array([[0, 0], [cw, 0], [cw, ch], [0, ch]], dtype=np.float32)
                src_rect = pts + np.array([[jx0, jy0], [jx1, jy0], [jx1, jy1], [jx0, jy1]], dtype=np.float32)
                src_rect[:, 0] = np.clip(src_rect[:, 0], 0, w - 1)
                src_rect[:, 1] = np.clip(src_rect[:, 1], 0, h - 1)
                m_crop = cv2.getPerspectiveTransform(src_rect, dst_rect)
                crop_rgb = cv2.warpPerspective(rgb, m_crop, (cw, ch), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
                rec_name = f"rec_{kind}_{split}_{made:04d}_{b_idx}.jpg"
                rec_path = REC_DIR / 'images' / split / rec_name
                save_jpg_or_png(crop_rgb, rec_path, rng)
                rec_labels[split].append(f"images/{split}/{rec_name}\t{b['transcription']}")

            manifest_entries.append({
                'id': det_name,
                'utility': 'electric',
                'source': f'Trozy-Mechanical-Synth-{kind}',
                'license': 'Project-local Procedural',
                'commercial_ok': True,
                'split': split,
                'width': int(rgb.shape[1]),
                'height': int(rgb.shape[0]),
                'num_boxes': len(clean_boxes),
                'sha256': sha,
            })
            made += 1


def process_henrik_rec_only(manifest_entries: list[dict], rec_labels: dict[str, list[str]]) -> None:
    """Use Henrik register crops strictly for Recognition (never full-image Detection boxes)."""
    src = RAW_DIR / 'henrik_energy_meter/data'
    if not src.exists():
        return
    seen_shas: set[str] = set()
    for raw_split, parquet_path in [('train', src / 'train-00000-of-00001.parquet'), ('test', src / 'test-00000-of-00001.parquet')]:
        if not parquet_path.exists():
            continue
        df = pl.read_parquet(parquet_path)
        for idx, row in enumerate(df.iter_rows(named=True)):
            img_data = row.get('image')
            label = str(row.get('label') or '').strip()
            if not img_data or not re.fullmatch(r'[0-9.]+', label):
                continue
            img_bytes = img_data.get('bytes') if isinstance(img_data, dict) else img_data
            if not isinstance(img_bytes, (bytes, bytearray)):
                continue
            im = Image.open(io.BytesIO(img_bytes)).convert('RGB')
            w, h = im.size
            buf = io.BytesIO()
            im.save(buf, format='PNG')
            png_bytes = buf.getvalue()
            sha = hashlib.sha256(png_bytes).hexdigest()
            if sha in seen_shas:
                continue
            seen_shas.add(sha)
            split = ('val' if idx % 6 == 0 else 'train') if raw_split == 'train' else 'test'
            fn = f"henrik_{split}_{idx:04d}_{sha[:8]}.png"
            rec_path = REC_DIR / 'images' / split / fn
            rec_path.write_bytes(png_bytes)
            rec_labels[split].append(f"images/{split}/{fn}\t{label}")
            manifest_entries.append({
                'id': fn,
                'utility': 'electric',
                'source': 'Henrik-Energy-Meter-RecOnly',
                'license': 'Open Access',
                'commercial_ok': False,
                'split': split,
                'width': w,
                'height': h,
                'reading': label,
                'sha256': sha,
            })


def main() -> None:
    log("Building Mechanical Electric Meter dataset (Det + Rec, zero fixture leakage)...")
    init_dirs()
    manifest_entries: list[dict] = []
    det_labels: dict[str, list[str]] = {'train': [], 'val': [], 'test': []}
    rec_labels: dict[str, list[str]] = {'train': [], 'val': [], 'test': []}

    build_procedural_electric(manifest_entries, det_labels, rec_labels)
    process_henrik_rec_only(manifest_entries, rec_labels)

    for split in ['train', 'val', 'test']:
        p_det = DET_DIR / f"{split}_label.txt"
        p_det.write_text('\n'.join(det_labels[split]) + ('\n' if det_labels[split] else ''), encoding='utf-8')
        p_rec = REC_DIR / f"{split}_label.txt"
        p_rec.write_text('\n'.join(rec_labels[split]) + ('\n' if rec_labels[split] else ''), encoding='utf-8')
        log(f"Split {split}: det={len(det_labels[split])} scenes, rec={len(rec_labels[split])} crops")

    with open(MANIFEST_FILE, 'w', encoding='utf-8') as f:
        for entry in manifest_entries:
            f.write(json.dumps(entry, ensure_ascii=False) + '\n')
    log(f"Electric dataset build complete. Total manifest records: {len(manifest_entries)}")


if __name__ == '__main__':
    main()
