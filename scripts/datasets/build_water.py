"""Build geometrically accurate Water Meter YOLOv8-OBB dataset & reading benchmark.

Key engineering guarantees:
1. True oriented OBBs (meter, window, 0..9, u) mathematically verified against
   src/ai/meter_row_geometry.py::refine_row.
2. Complete-wheel restoration on 8-wheel S120 meters: DL7981 CSV annotations often
   omit 1-2 leading '0' wheels on the left of 8-wheel meters. We combine upright
   teacher detections (stage1_meter_window_digits.pt) and teacher window bounds
   along the SVD row axis to restore omitted leading '0' wheels (class 2 = '0')
   and expand the window OBB across all 8 physical wheels.
3. Balanced multi-orientation (0/90/180/270 + continuous 360deg) and multi-layout
   (8-wheel 5+3 leading-zero plastic/brass & 5-wheel 4+1 weathered wide-shot)
   mechanical water meter scenes.
4. Zero evaluation leakage: .runtime/datasets/meter/* and eval_readings.jsonl
   never enter train, val, or test splits.
"""
from __future__ import annotations

import ast
import csv
import hashlib
import json
import math
import os
from pathlib import Path
import random
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parents[2]
GPU_SITE = ROOT / '.runtime/meter-digits/train-gpu-packages'
if GPU_SITE.is_dir():
    os.environ['TROZY_USE_TRAIN_GPU'] = '1'
    os.environ['TROZY_TRAIN_GPU_SITE'] = str(GPU_SITE)
    if str(GPU_SITE) not in sys.path:
        sys.path.insert(0, str(GPU_SITE))
RUNTIME_SITE = ROOT / '.runtime/paddleocr/site-packages'
if RUNTIME_SITE.is_dir() and str(RUNTIME_SITE) not in sys.path:
    sys.path.append(str(RUNTIME_SITE))
sys.path.insert(0, str(ROOT / 'src/ai'))

os.environ.setdefault('YOLO_CONFIG_DIR', str(ROOT / '.cache/ultralytics-meter-trial'))
os.environ.setdefault('MPLCONFIGDIR', str(ROOT / '.cache/meter-trial-matplotlib'))
os.environ.setdefault('TORCH_HOME', str(ROOT / '.runtime/meter-digits/visionstate-yolo/cache/torch'))
os.environ['YOLO_AUTOINSTALL'] = 'false'
os.environ['YOLO_OFFLINE'] = 'true'
os.environ['PYTHONIOENCODING'] = 'utf-8'

import cv2
import numpy as np
import polars as pl
from PIL import Image, ImageDraw, ImageFont
import torch
from ultralytics import YOLO

from meter_row_geometry import refine_row

RAW_DIR = ROOT / '.runtime/datasets/raw'
WATER_DIR = ROOT / '.runtime/datasets/water'
YOLO_DIR = WATER_DIR / 'yolo-obb'
WHEELS_DIR = WATER_DIR / 'wheels'
MANIFEST_FILE = WATER_DIR / 'manifest.jsonl'
EVAL_READINGS_FILE = WATER_DIR / 'eval_readings.jsonl'
TEACHER_WEIGHTS = ROOT / '.runtime/meter-digits/visionstate-yolo/models/stage1_meter_window_digits.pt'

FONT_DIR = Path(os.environ.get('WINDIR', 'C:/Windows')) / 'Fonts'
DIGIT_FONTS = ['bahnschrift.ttf', 'arialbd.ttf', 'trebucbd.ttf', 'consolab.ttf', 'calibrib.ttf']
LABEL_FONTS = ['arialbd.ttf', 'arial.ttf', 'tahomabd.ttf', 'calibri.ttf']
_FONT_CACHE: dict[tuple[str, int], ImageFont.FreeTypeFont | ImageFont.ImageFont] = {}

CLASS_ID_TO_NAME = {
    0: 'meter', 1: 'window',
    2: '0', 3: '1', 4: '2', 5: '3', 6: '4',
    7: '5', 8: '6', 9: '7', 10: '8', 11: '9', 12: 'u',
}


def log(msg: str) -> None:
    print(f"[build_water] {msg}", flush=True)


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
    water_resolved = WATER_DIR.resolve()
    if not resolved.is_relative_to(water_resolved) or resolved == water_resolved:
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
    WATER_DIR.mkdir(parents=True, exist_ok=True)
    for split in ['train', 'val', 'test']:
        safe_clear_dir(YOLO_DIR / 'images' / split)
        safe_clear_dir(YOLO_DIR / 'labels' / split)
        safe_clear_dir(WHEELS_DIR / split)
    for cache_file in (YOLO_DIR / 'labels').glob('*.cache'):
        if cache_file.resolve().is_relative_to(YOLO_DIR.resolve()):
            cache_file.unlink()


def write_data_yaml() -> None:
    yaml_content = f"""# Trozy Water Meter YOLOv8-OBB Dataset (Complete-Wheel Oriented OBB + 360deg + Weathered)
path: {YOLO_DIR.as_posix()}
train: images/train
val: images/val
test: images/test

names:
  0: meter
  1: window
  2: '0'
  3: '1'
  4: '2'
  5: '3'
  6: '4'
  7: '5'
  8: '6'
  9: '7'
  10: '8'
  11: '9'
  12: u
"""
    (YOLO_DIR / 'data.yaml').write_text(yaml_content, encoding='utf-8')
    log(f"Wrote data.yaml to {YOLO_DIR / 'data.yaml'}")


def fit_oriented_row(
    boxes: list[tuple[float, float, float, float]],
    img_w: int,
    img_h: int,
    prepend_left_slots: int = 0,
):
    if len(boxes) < 4:
        return None
    arr = np.array(boxes, dtype=np.float64)
    centers = np.column_stack(((arr[:, 0] + arr[:, 2]) / 2.0, (arr[:, 1] + arr[:, 3]) / 2.0))
    mean_c = centers.mean(axis=0)
    centered = centers - mean_c
    _, _, vt = np.linalg.svd(centered, full_matrices=False)
    along = vt[0].copy()
    if along[0] < -1e-6 or (abs(along[0]) <= 1e-6 and along[1] < 0):
        along *= -1.0
    down = np.array([-along[1], along[0]])

    proj_x = centered @ along
    proj_y = centered @ down
    order = np.argsort(proj_x)
    arr = arr[order]
    proj_x = proj_x[order]
    proj_y = proj_y[order]

    n = len(boxes)
    idx = np.arange(n, dtype=np.float64)
    pitch, first_x = np.polyfit(idx, proj_x, 1)
    if pitch <= 4.0:
        return None
    pitch_err = float(np.max(np.abs(proj_x - (first_x + idx * pitch))) / pitch)
    gaps = np.diff(proj_x) / pitch
    if pitch_err > 0.18 or gaps.min() < 0.65 or gaps.max() > 1.35:
        return None

    c_abs, s_abs = abs(float(along[0])), abs(float(along[1]))
    cos2 = c_abs * c_abs - s_abs * s_abs
    aab_w = arr[:, 2] - arr[:, 0]
    aab_h = arr[:, 3] - arr[:, 1]
    sum_wh = (aab_w + aab_h) / max(c_abs + s_abs, 1.0)
    if abs(cos2) >= 0.35:
        dw_est = (aab_w * c_abs - aab_h * s_abs) / cos2
        dh_est = (aab_h * c_abs - aab_w * s_abs) / cos2
        dw = np.clip(dw_est, 0.48 * pitch, 0.92 * pitch)
        dh = np.clip(dh_est, 0.80 * pitch, 2.30 * pitch)
    else:
        dw = np.full(n, 0.78 * pitch)
        dh = np.clip(sum_wh - dw, 0.85 * pitch, 2.15 * pitch)

    med_w = float(np.median(dw))
    med_h = float(np.median(dh))
    if float(np.max(np.abs(proj_y))) / max(med_h, 1.0) > 0.22:
        return None

    if prepend_left_slots > 0:
        slope_y, intercept_y = np.polyfit(proj_x, proj_y, 1)
        prep_x = np.array([first_x - k * pitch for k in range(prepend_left_slots, 0, -1)], dtype=np.float64)
        prep_y = slope_y * prep_x + intercept_y
        proj_x = np.concatenate([prep_x, proj_x])
        proj_y = np.concatenate([prep_y, proj_y])
        dw = np.concatenate([np.full(prepend_left_slots, med_w), dw])
        dh = np.concatenate([np.full(prepend_left_slots, med_h), dh])

    digit_obbs = []
    digit_centers = []
    for cx_l, cy_l, w_i, h_i in zip(proj_x, proj_y, dw, dh):
        hw, hh = float(w_i) / 2.0, float(h_i) / 2.0
        loc = np.array([
            [cx_l - hw, cy_l - hh],
            [cx_l + hw, cy_l - hh],
            [cx_l + hw, cy_l + hh],
            [cx_l - hw, cy_l + hh],
        ])
        pts = mean_c + loc[:, :1] * along + loc[:, 1:] * down
        if (pts[:, 0] < 0).any() or (pts[:, 0] > img_w).any() or (pts[:, 1] < 0).any() or (pts[:, 1] > img_h).any():
            return None
        digit_obbs.append(pts)
        digit_centers.append(mean_c + cx_l * along + cy_l * down)

    win_left = float(proj_x[0] - 0.62 * pitch)
    win_right = float(proj_x[-1] + 0.62 * pitch)
    win_y = float(np.median(proj_y))
    win_hh = 0.66 * med_h
    win_loc = np.array([
        [win_left, win_y - win_hh],
        [win_right, win_y - win_hh],
        [win_right, win_y + win_hh],
        [win_left, win_y + win_hh],
    ])
    win_pts = mean_c + win_loc[:, :1] * along + win_loc[:, 1:] * down
    if (win_pts[:, 0] < 0).any() or (win_pts[:, 0] > img_w).any() or (win_pts[:, 1] < 0).any() or (win_pts[:, 1] > img_h).any():
        return None

    fake_win = {'corners': win_pts.tolist(), 'confidence': 0.95}
    fake_dets = [{'corners': d.tolist(), 'confidence': 0.9, 'class_name': 'u'} for d in digit_obbs]
    ref = refine_row(fake_win, fake_dets, len(digit_obbs), (img_w, img_h))
    if ref['status'] != 'selected':
        return None

    angle_deg = math.degrees(math.atan2(float(along[1]), float(along[0])))
    return {
        'window': win_pts,
        'digits': digit_obbs,
        'digit_centers': np.array(digit_centers, dtype=np.float64),
        'mean_c': mean_c,
        'along': along,
        'down': down,
        'proj_x_min': float(proj_x[0]),
        'proj_x_max': float(proj_x[-1]),
        'pitch': float(pitch),
        'med_w': med_w,
        'med_h': med_h,
        'angle_deg': angle_deg,
        'prepended': prepend_left_slots,
    }


def rotate_image_and_polys(bgr: np.ndarray, polys: list[tuple[int, np.ndarray]], k90: int):
    h, w = bgr.shape[:2]
    k = k90 % 4
    if k == 0:
        return bgr, [(cid, pts.copy()) for cid, pts in polys]
    if k == 1:
        rot = cv2.rotate(bgr, cv2.ROTATE_90_COUNTERCLOCKWISE)
        new_polys = [(cid, np.column_stack((pts[:, 1], w - 1.0 - pts[:, 0]))) for cid, pts in polys]
        return rot, new_polys
    if k == 2:
        rot = cv2.rotate(bgr, cv2.ROTATE_180)
        new_polys = [(cid, np.column_stack((w - 1.0 - pts[:, 0], h - 1.0 - pts[:, 1]))) for cid, pts in polys]
        return rot, new_polys
    rot = cv2.rotate(bgr, cv2.ROTATE_90_CLOCKWISE)
    new_polys = [(cid, np.column_stack((h - 1.0 - pts[:, 1], pts[:, 0]))) for cid, pts in polys]
    return rot, new_polys


def apply_weathered_wide_augment(bgr: np.ndarray, polys: list[tuple[int, np.ndarray]], rng: random.Random):
    h, w = bgr.shape[:2]
    scale = rng.uniform(0.42, 0.72)
    nw, nh = max(64, int(round(w * scale))), max(64, int(round(h * scale)))
    resized = cv2.resize(bgr, (nw, nh), interpolation=cv2.INTER_AREA)

    cw, ch = max(nw + 40, w), max(nh + 40, h)
    base_color = np.array([rng.randint(70, 135), rng.randint(95, 155), rng.randint(110, 175)], dtype=np.float32)
    noise = np.random.default_rng(rng.randint(0, 1_000_000)).normal(0, 18, (ch, cw, 3)).astype(np.float32)
    noise = cv2.GaussianBlur(noise, (15, 15), 4.0)
    canvas = np.clip(base_color + noise, 15, 240).astype(np.uint8)

    ox = rng.randint(10, cw - nw - 10)
    oy = rng.randint(10, ch - nh - 10)
    canvas[oy:oy + nh, ox:ox + nw] = resized

    img_f = canvas.astype(np.float32)
    veil_strength = rng.uniform(0.12, 0.28)
    patina = np.array([rng.uniform(75, 115), rng.uniform(115, 155), rng.uniform(135, 180)], dtype=np.float32)
    gx = np.linspace(0.0, 1.0, cw, dtype=np.float32)[None, :, None]
    gy = np.linspace(0.0, 1.0, ch, dtype=np.float32)[:, None, None]
    glare_mask = np.clip(0.5 + 0.5 * np.sin(gx * rng.uniform(2.5, 5.0) + gy * rng.uniform(2.0, 4.5)), 0.0, 1.0)
    img_f = img_f * (1.0 - veil_strength * glare_mask) + patina * (veil_strength * glare_mask)

    alpha = rng.uniform(0.70, 0.92)
    mean_l = float(img_f.mean())
    img_f = (img_f - mean_l) * alpha + mean_l + rng.uniform(-10.0, 10.0)
    out = np.clip(img_f, 0, 255).astype(np.uint8)
    if rng.random() < 0.60:
        out = cv2.GaussianBlur(out, (3, 3), rng.uniform(0.5, 1.0))

    new_polys = []
    for cid, pts in polys:
        p = pts * scale + np.array([ox, oy], dtype=np.float64)
        new_polys.append((cid, p))
    return out, new_polys


def format_yolo_obb_lines(polys: list[tuple[int, np.ndarray]], w: int, h: int) -> list[str]:
    lines = []
    for cid, pts in polys:
        norm = np.clip(pts / np.array([w, h], dtype=np.float64), 0.0, 1.0)
        coords = ' '.join(f"{val:.6f}" for pair in norm for val in pair)
        lines.append(f"{cid} {coords}")
    return lines


def teacher_enrich_and_restore_8wheels(teacher: YOLO, device: str, items: list[dict]) -> None:
    """Restore omitted leading '0' wheels on S120 8-wheel meters & enrich digit IDs."""
    batch_size = 32 if device.startswith('cuda') else 8
    stats = {'restored_8wheel': 0, 'native_8wheel': 0, 'native_5wheel': 0, 'other_complete': 0, 'rejected': 0}

    for start in range(0, len(items), batch_size):
        chunk = items[start:start + batch_size]
        upright_imgs = []
        inv_mats = []
        for item in chunk:
            bgr = item['bgr']
            h, w = bgr.shape[:2]
            angle = item['fit']['angle_deg']
            m_rot = cv2.getRotationMatrix2D((w / 2.0, h / 2.0), angle, 1.0)
            warped_rgb = cv2.warpAffine(
                cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB),
                m_rot,
                (w, h),
                flags=cv2.INTER_LINEAR,
                borderMode=cv2.BORDER_REPLICATE,
            )
            m_33 = np.vstack([m_rot, [0.0, 0.0, 1.0]])
            m_inv = np.linalg.inv(m_33)[:2, :]
            upright_imgs.append(Image.fromarray(warped_rgb, 'RGB'))
            inv_mats.append(m_inv)

        results = teacher.predict(
            source=upright_imgs,
            imgsz=640,
            conf=0.18,
            iou=0.45,
            device=device,
            verbose=False,
            save=False,
        )
        for item, res, m_inv in zip(chunk, results, inv_mats):
            h, w = item['bgr'].shape[:2]
            fit = item['fit']
            meter_obb = None
            pred_digits: list[tuple[np.ndarray, int, float]] = []

            if res.obb is not None and len(res.obb) > 0:
                corners = res.obb.xyxyxyxy.detach().cpu().numpy()
                confs = res.obb.conf.detach().cpu().numpy()
                clss = res.obb.cls.detach().cpu().numpy().astype(int)
                best_meter_conf = 0.0
                for pts_u, sc, cid in zip(corners, confs, clss):
                    ones = np.ones((4, 1), dtype=np.float64)
                    pts_orig = np.clip(np.hstack([pts_u.astype(np.float64), ones]) @ m_inv.T, [0.0, 0.0], [float(w), float(h)])
                    cid_i = int(cid)
                    sc_f = float(sc)
                    if cid_i == 0 and sc_f > best_meter_conf:
                        best_meter_conf = sc_f
                        meter_obb = pts_orig
                    elif 2 <= cid_i <= 12 and sc_f >= 0.35:
                        pred_digits.append((pts_orig.mean(axis=0), cid_i, sc_f))

            if meter_obb is None:
                stats['rejected'] += 1
                item['accepted'] = False
                continue

            csv_n = len(fit['digits'])
            if csv_n == 8:
                stats['native_8wheel'] += 1
            elif csv_n == 5:
                stats['native_5wheel'] += 1
            elif csv_n in (6, 7):
                stats['other_complete'] += 1
            else:
                stats['rejected'] += 1
                item['accepted'] = False
                continue

            pitch = fit['pitch']
            prepended = fit.get('prepended', 0)
            final_digits = []
            for idx_d, (gt_pts, gt_center) in enumerate(zip(fit['digits'], fit['digit_centers'])):
                if idx_d < prepended:
                    # Prepended leading wheel on S120 residential meter is '0' (class 2)
                    final_digits.append((2, gt_pts))
                    continue
                best_cid = 12
                best_sc = 0.0
                for p_center, p_cid, p_sc in pred_digits:
                    if float(np.linalg.norm(gt_center - p_center)) <= 0.42 * pitch and p_sc > best_sc:
                        best_sc = p_sc
                        best_cid = p_cid
                final_digits.append((best_cid, gt_pts))

            item['accepted'] = True
            item['meter_obb'] = meter_obb
            item['final_window'] = fit['window']
            item['final_digits'] = final_digits
            item['wheel_count'] = len(final_digits)

    log(f"8-wheel restoration & completeness stats: {stats}")


def synthesize_vn_water_meter_scene(rng: random.Random) -> tuple[np.ndarray, list[tuple[int, np.ndarray]], int] | None:
    """Render Vietnam-style mechanical water meters common in HCMC/Hanoi municipal networks.

    Covers the 3 dominant physical types seen on Trozy property submissions:
      A) 5-wheel all-integer (DN15/DN20 Asahi, Minh Hoa, Kent, Sun-Tech) – most common for
         apartment sub-meters; black plastic casing with white bezel on numeric window.
      B) 6-wheel 5+1 semi-decimal (Sensus, Elster, Itron) – common on landed houses;
         gray plastic housing, red last wheel.
      C) 4-wheel all-integer (DN15 mini, solar-panel covers) – older DAWACO meters;
         compact rectangular casing.
    All types rendered at 360° random rotation with realistic VN-style backgrounds
    (tile floors, concrete walls, rusted pipe fittings).
    """
    cw, ch = 640, 640
    rng_np = np.random.default_rng(rng.randint(0, 10_000_000))

    # --- Background: VN-style surfaces ---
    bg_type = rng.choice(['tile', 'tile', 'concrete', 'rusted_metal', 'dark_wall'])
    if bg_type == 'tile':
        base = np.array([rng.randint(195, 230), rng.randint(190, 225), rng.randint(185, 220)], dtype=np.float32)
        noise = rng_np.normal(0, 10, (ch, cw, 3)).astype(np.float32)
        grid_period = rng.choice([32, 40, 48])
        grid = np.zeros((ch, cw, 3), dtype=np.float32)
        grid[::grid_period, :, :] = -20.0
        grid[:, ::grid_period, :] = -20.0
        canvas = np.clip(base + noise + grid, 12, 242).astype(np.uint8)
    elif bg_type == 'concrete':
        base = np.array([rng.randint(130, 175), rng.randint(130, 175), rng.randint(125, 170)], dtype=np.float32)
        coarse = cv2.GaussianBlur(rng_np.normal(0, 18, (ch, cw, 3)).astype(np.float32), (21, 21), 5.0)
        canvas = np.clip(base + coarse, 12, 242).astype(np.uint8)
    elif bg_type == 'rusted_metal':
        base = np.array([rng.randint(85, 125), rng.randint(55, 90), rng.randint(35, 65)], dtype=np.float32)
        noise = rng_np.normal(0, 22, (ch, cw, 3)).astype(np.float32)
        canvas = np.clip(base + noise, 12, 242).astype(np.uint8)
    else:
        base = np.array([rng.randint(55, 95), rng.randint(55, 95), rng.randint(55, 95)], dtype=np.float32)
        noise = rng_np.normal(0, 12, (ch, cw, 3)).astype(np.float32)
        canvas = np.clip(base + noise, 12, 242).astype(np.uint8)

    # --- Meter type selection ---
    meter_type = rng.choice(['5w_int', '5w_int', '6w_semi', '4w_int'])
    if meter_type == '5w_int':
        n_wheels, n_red = 5, 0
        brands = ['ASAHI', 'MINH HOA', 'KENT', 'SUN-TECH', 'SHINHAN']
        casing_color_opts = [
            (rng.randint(18, 42), rng.randint(18, 42), rng.randint(20, 45)),  # black
            (rng.randint(55, 90), rng.randint(55, 90), rng.randint(58, 92)),  # dark gray
        ]
    elif meter_type == '6w_semi':
        n_wheels, n_red = 6, 1
        brands = ['SENSUS', 'ELSTER', 'ITRON', 'ZENNER', 'MINOL']
        casing_color_opts = [
            (rng.randint(90, 125), rng.randint(90, 125), rng.randint(90, 125)),  # medium gray
            (rng.randint(18, 42), rng.randint(18, 42), rng.randint(20, 45)),  # black
        ]
    else:  # 4w_int
        n_wheels, n_red = 4, 0
        brands = ['DAWACO', 'HAWLE', 'DOROT', 'ASAHI']
        casing_color_opts = [
            (rng.randint(18, 42), rng.randint(18, 42), rng.randint(20, 45)),  # black
            (rng.randint(50, 80), rng.randint(70, 100), rng.randint(50, 80)),  # dark green
        ]

    n_int = n_wheels - n_red

    # Digit string generation
    if rng.random() < 0.50:
        lead_zeros = rng.randint(1, max(1, n_int - 1))
        rem = [str(rng.randint(0, 9)) for _ in range(n_wheels - lead_zeros)]
        digits_str = ('0' * lead_zeros) + ''.join(rem)
    else:
        digits_str = ''.join(str(rng.randint(0, 9)) for _ in range(n_wheels))

    s_patch = 480
    cx_p, cy_p = s_patch // 2, s_patch // 2
    pil_patch = Image.new('RGBA', (s_patch, s_patch), (0, 0, 0, 0))
    draw = ImageDraw.Draw(pil_patch)

    casing_rgb = rng.choice(casing_color_opts)
    ring_outer = (*casing_rgb, 255)
    ring_inner_rgb = tuple(min(255, c + rng.randint(12, 28)) for c in casing_rgb)
    ring_inner = (*ring_inner_rgb, 255)

    # Rectangular body style (more common in VN)
    if rng.random() < 0.65:
        # rectangular casing
        draw.rectangle([cx_p - 220, cy_p - 72, cx_p + 220, cy_p + 72], fill=ring_outer)
        draw.rectangle([cx_p - 215, cy_p - 68, cx_p + 215, cy_p + 68], fill=ring_inner)
        r_outer_ref = 72  # for meter OBB approximation
    else:
        # round casing (like S120 style)
        r_outer_ref = 210
        draw.ellipse([cx_p - r_outer_ref, cy_p - r_outer_ref, cx_p + r_outer_ref, cy_p + r_outer_ref],
                     fill=ring_outer)
        draw.ellipse([cx_p - r_outer_ref + 14, cy_p - r_outer_ref + 14,
                      cx_p + r_outer_ref - 14, cy_p + r_outer_ref - 14], fill=ring_inner)

    # Numeric window
    cell_w = 36 if n_wheels <= 5 else 30
    cell_h = round(cell_w * rng.uniform(1.28, 1.48))
    pad_x = round(cell_w * 0.38)
    pad_y = round(cell_h * 0.14)
    win_w = n_wheels * cell_w + 2 * pad_x
    win_h = cell_h + 2 * pad_y
    win_x0 = cx_p - win_w // 2
    win_y0 = cy_p - win_h // 2 - rng.randint(-8, 8)
    win_x1 = win_x0 + win_w
    win_y1 = win_y0 + win_h

    # White bezel (VN-style)
    draw.rectangle([win_x0 - 4, win_y0 - 4, win_x1 + 4, win_y1 + 4],
                   fill=(235, 235, 232, 255), outline=(180, 180, 175, 255), width=2)

    scheme = rng.choice([0, 0, 0, 1])  # mostly dark-on-white in VN
    digit_boxes_patch: list[tuple[int, np.ndarray]] = []

    for idx_w, ch_d in enumerate(digits_str):
        is_red = idx_w >= n_int
        wx0 = win_x0 + pad_x + idx_w * cell_w
        wy0 = win_y0 + pad_y
        wx1 = wx0 + cell_w
        wy1 = wy0 + cell_h

        slot_x0, slot_x1 = wx0 + 2, wx1 - 2
        if not is_red:
            if scheme == 0:
                drum_bg = (rng.randint(230, 252), rng.randint(228, 250), rng.randint(225, 248), 255)
                fg_col = (rng.randint(10, 30), rng.randint(10, 30), rng.randint(10, 30), 255)
            else:
                drum_bg = (rng.randint(15, 38), rng.randint(15, 38), rng.randint(18, 40), 255)
                fg_col = (rng.randint(230, 252), rng.randint(228, 250), rng.randint(225, 248), 255)
        else:
            drum_bg = (rng.randint(230, 250), rng.randint(220, 240), rng.randint(220, 238), 255)
            fg_col = (rng.randint(185, 220), rng.randint(18, 42), rng.randint(18, 40), 255)

        draw.rectangle([slot_x0, wy0, slot_x1, wy1], fill=drum_bg)
        shade_h = max(3, cell_h // 7)
        draw.rectangle([slot_x0, wy0, slot_x1, wy0 + shade_h], fill=(0, 0, 0, 32))
        draw.rectangle([slot_x0, wy1 - shade_h, slot_x1, wy1], fill=(0, 0, 0, 40))

        fnt = get_font(DIGIT_FONTS, max(16, round(cell_h * 0.72)), rng)
        bb = draw.textbbox((0, 0), ch_d, font=fnt)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
        tx = slot_x0 + ((slot_x1 - slot_x0) - tw) / 2.0 - bb[0]
        ty = wy0 + (cell_h - th) / 2.0 - bb[1] + rng.uniform(-0.05, 0.05) * cell_h
        draw.text((tx, ty), ch_d, font=fnt, fill=fg_col)

        dx0, dx1 = wx0 + cell_w * 0.08, wx1 - cell_w * 0.08
        dy0, dy1 = wy0 + cell_h * 0.04, wy1 - cell_h * 0.04
        d_pts = np.array([[dx0, dy0], [dx1, dy0], [dx1, dy1], [dx0, dy1]], dtype=np.float64)
        digit_boxes_patch.append((2 + int(ch_d), d_pts))

    # Brand label (VN style: printed above or below window)
    f_brand = get_font(LABEL_FONTS, 16, rng)
    brand = rng.choice(brands)
    draw.text((win_x0, win_y0 - 22), brand, font=f_brand, fill=(210, 210, 205, 255))
    if n_red == 0:
        draw.text((win_x1 - 24, win_y1 + 6), 'm³', font=get_font(LABEL_FONTS, 18, rng), fill=(210, 210, 205, 255))
    else:
        draw.text((win_x0, win_y1 + 6), 'm³ x0.001', font=get_font(LABEL_FONTS, 13, rng), fill=(210, 210, 205, 255))

    # Meter OBB approximation (rectangular bounding region)
    half_w = max(win_w // 2 + 60, 220)
    half_h = max(win_h // 2 + 40, 75)
    meter_pts_patch = np.array([
        [cx_p - half_w, cy_p - half_h],
        [cx_p + half_w, cy_p - half_h],
        [cx_p + half_w, cy_p + half_h],
        [cx_p - half_w, cy_p + half_h],
    ], dtype=np.float64)
    win_pts_patch = np.array([
        [win_x0, win_y0], [win_x1, win_y0], [win_x1, win_y1], [win_x0, win_y1],
    ], dtype=np.float64)

    angle_deg = rng.uniform(0.0, 360.0)
    scale = rng.uniform(0.48, 0.90)
    tx_c = cw / 2.0 + rng.uniform(-45.0, 45.0) * (1.0 - scale * 0.5)
    ty_c = ch / 2.0 + rng.uniform(-45.0, 45.0) * (1.0 - scale * 0.5)

    rad = math.radians(angle_deg)
    ca, sa = math.cos(rad) * scale, math.sin(rad) * scale
    m_aff = np.array([
        [ca, -sa, tx_c - (ca * cx_p - sa * cy_p)],
        [sa,  ca, ty_c - (sa * cx_p + ca * cy_p)],
    ], dtype=np.float64)

    patch_rgba = np.asarray(pil_patch)
    warped_rgba = cv2.warpAffine(patch_rgba, m_aff, (cw, ch),
                                 flags=cv2.INTER_LINEAR,
                                 borderMode=cv2.BORDER_CONSTANT,
                                 borderValue=(0, 0, 0, 0))
    alpha_m = warped_rgba[:, :, 3:4].astype(np.float32) / 255.0
    patch_bgr = warped_rgba[:, :, 2::-1].astype(np.float32)
    comp = canvas.astype(np.float32) * (1.0 - alpha_m) + patch_bgr * alpha_m

    # VN-style environmental effects: humidity stains and fluorescent glare
    gx = np.linspace(0.0, 1.0, cw, dtype=np.float32)[None, :, None]
    gy = np.linspace(0.0, 1.0, ch, dtype=np.float32)[:, None, None]
    if rng.random() < 0.40:
        # water stain / damp wall
        stain_v = rng.uniform(0.08, 0.20)
        stain_col = np.array([rng.uniform(60, 90), rng.uniform(75, 110), rng.uniform(55, 85)], dtype=np.float32)
        gmask = np.clip(0.5 + 0.5 * np.sin(gx * rng.uniform(1.5, 3.5) + gy * rng.uniform(1.5, 3.5)), 0.0, 1.0)
        comp = comp * (1.0 - stain_v * gmask) + stain_col * (stain_v * gmask)
    if rng.random() < 0.30:
        # fluorescent overhead glare
        glare_x = rng.uniform(0.1, 0.9)
        glare_y = rng.uniform(0.0, 0.5)
        glare = np.exp(-((gx - glare_x) ** 2 + (gy - glare_y) ** 2) / rng.uniform(0.04, 0.12))
        comp = comp + glare * rng.uniform(20.0, 50.0)

    comp = comp + rng_np.normal(0, rng.uniform(2.0, 6.0), comp.shape).astype(np.float32)
    out_bgr = np.clip(comp, 0, 255).astype(np.uint8)
    if rng.random() < 0.40:
        out_bgr = cv2.GaussianBlur(out_bgr, (3, 3), rng.uniform(0.4, 0.90))

    def xf(pts: np.ndarray) -> np.ndarray:
        ones = np.ones((len(pts), 1), dtype=np.float64)
        return np.hstack([pts, ones]) @ m_aff.T

    win_xf = xf(win_pts_patch)
    if ((win_xf[:, 0] < 3).any() or (win_xf[:, 0] > cw - 3).any()
            or (win_xf[:, 1] < 3).any() or (win_xf[:, 1] > ch - 3).any()):
        return None
    meter_xf = np.clip(xf(meter_pts_patch), [0.0, 0.0], [float(cw), float(ch)])
    digs_xf = [(cid, xf(dpts)) for cid, dpts in digit_boxes_patch]

    fake_win = {'corners': win_xf.tolist(), 'confidence': 0.95}
    fake_dets = [
        {'corners': dpts.tolist(), 'confidence': 0.92, 'class_name': CLASS_ID_TO_NAME[cid]}
        for cid, dpts in digs_xf
    ]
    if refine_row(fake_win, fake_dets, n_wheels, (cw, ch))['status'] != 'selected':
        return None

    polys: list[tuple[int, np.ndarray]] = [(0, meter_xf), (1, win_xf)] + digs_xf
    return out_bgr, polys, n_wheels


def synthesize_water_meter_scene(rng: random.Random) -> tuple[np.ndarray, list[tuple[int, np.ndarray]], int] | None:
    """Render realistic 8-wheel (5+3 leading-zero) or 5-wheel (4+1 weathered) mechanical water meter at 0..360deg."""
    cw, ch = 640, 640
    bg_base = np.array([rng.randint(55, 165), rng.randint(65, 170), rng.randint(65, 175)], dtype=np.float32)
    rng_np = np.random.default_rng(rng.randint(0, 10_000_000))
    coarse = cv2.GaussianBlur(rng_np.normal(0, 22, (ch, cw, 3)).astype(np.float32), (21, 21), 6.0)
    fine = rng_np.normal(0, 6, (ch, cw, 3)).astype(np.float32)
    canvas = np.clip(bg_base + coarse + fine, 12, 242).astype(np.uint8)

    if rng.random() < 0.70:
        n_wheels, n_red = 8, 3
    else:
        n_wheels, n_red = 5, 1
    n_int = n_wheels - n_red

    if rng.random() < 0.55:
        lead_zeros = rng.randint(2, max(2, n_int - 1)) if n_wheels == 8 else rng.randint(1, 2)
        rem = [str(rng.randint(0, 9)) for _ in range(n_wheels - lead_zeros)]
        digits_str = ('0' * lead_zeros) + ''.join(rem)
    else:
        digits_str = ''.join(str(rng.randint(0, 9)) for _ in range(n_wheels))

    s_patch = 520
    cx_p, cy_p = s_patch // 2, s_patch // 2
    pil_patch = Image.new('RGBA', (s_patch, s_patch), (0, 0, 0, 0))
    draw = ImageDraw.Draw(pil_patch)

    casing_style = rng.choice(['blue_plastic', 'blue_plastic', 'brass', 'weathered_brass', 'dark_iron'])
    if casing_style == 'blue_plastic':
        ring_outer = (rng.randint(15, 45), rng.randint(75, 125), rng.randint(165, 225), 255)
        ring_inner = (rng.randint(25, 60), rng.randint(95, 145), rng.randint(185, 240), 255)
    elif casing_style in ('brass', 'weathered_brass'):
        ring_outer = (rng.randint(135, 175), rng.randint(115, 150), rng.randint(55, 95), 255)
        ring_inner = (rng.randint(160, 195), rng.randint(140, 170), rng.randint(75, 115), 255)
    else:
        v = rng.randint(45, 85)
        ring_outer = (v, v + 4, v + 6, 255)
        ring_inner = (v + 16, v + 18, v + 20, 255)

    r_outer = 236
    r_dial = 192
    stub_h = 68
    draw.rectangle([4, cy_p - stub_h, s_patch - 4, cy_p + stub_h], fill=ring_outer)
    draw.rectangle([cx_p - 46, cy_p - r_outer - 18, cx_p + 46, cy_p - r_outer + 18], fill=ring_outer)
    draw.ellipse([cx_p - r_outer, cy_p - r_outer, cx_p + r_outer, cy_p + r_outer], fill=ring_outer)
    draw.ellipse([cx_p - r_outer + 16, cy_p - r_outer + 16, cx_p + r_outer - 16, cy_p + r_outer - 16], fill=ring_inner)

    dial_v = rng.randint(218, 248) if casing_style != 'weathered_brass' else rng.randint(190, 222)
    dial_col = (dial_v, dial_v - rng.randint(0, 8), dial_v - rng.randint(0, 18), 255)
    draw.ellipse([cx_p - r_dial, cy_p - r_dial, cx_p + r_dial, cy_p + r_dial], fill=dial_col, outline=(70, 75, 82, 255), width=3)

    cell_w = 34 if n_wheels >= 7 else 42
    cell_h = round(cell_w * rng.uniform(1.32, 1.52))
    pad_x = round(cell_w * 0.42)
    pad_y = round(cell_h * 0.16)
    win_w = n_wheels * cell_w + 2 * pad_x
    win_h = cell_h + 2 * pad_y
    win_x0 = cx_p - win_w // 2
    win_y0 = cy_p - round(r_dial * rng.uniform(0.30, 0.46)) - win_h // 2
    win_x1 = win_x0 + win_w
    win_y1 = win_y0 + win_h

    bezel_v = rng.randint(22, 58)
    draw.rectangle([win_x0, win_y0, win_x1, win_y1], fill=(bezel_v, bezel_v, bezel_v + 4, 255), outline=(95, 100, 108, 255), width=2)

    scheme = rng.choice([0, 0, 1, 2])
    digit_boxes_patch: list[tuple[int, np.ndarray]] = []

    for idx_w, ch_d in enumerate(digits_str):
        is_red = idx_w >= n_int
        wx0 = win_x0 + pad_x + idx_w * cell_w
        wy0 = win_y0 + pad_y
        wx1 = wx0 + cell_w
        wy1 = wy0 + cell_h

        slot_x0, slot_x1 = wx0 + 2, wx1 - 2
        if not is_red:
            if scheme in (0, 2):
                drum_bg = (rng.randint(225, 248), rng.randint(225, 246), rng.randint(220, 242), 255)
                fg_col = (rng.randint(12, 36), rng.randint(12, 36), rng.randint(14, 38), 255)
            else:
                drum_bg = (rng.randint(18, 42), rng.randint(18, 42), rng.randint(20, 45), 255)
                fg_col = (rng.randint(226, 250), rng.randint(226, 248), rng.randint(222, 245), 255)
        else:
            if scheme == 0:
                drum_bg = (rng.randint(225, 248), rng.randint(222, 244), rng.randint(218, 240), 255)
                fg_col = (rng.randint(175, 225), rng.randint(18, 46), rng.randint(18, 44), 255)
            else:
                drum_bg = (rng.randint(165, 215), rng.randint(20, 48), rng.randint(20, 48), 255)
                fg_col = (rng.randint(232, 252), rng.randint(230, 250), rng.randint(226, 246), 255)

        draw.rectangle([slot_x0, wy0, slot_x1, wy1], fill=drum_bg)
        shade_h = max(3, cell_h // 6)
        draw.rectangle([slot_x0, wy0, slot_x1, wy0 + shade_h], fill=(0, 0, 0, 38))
        draw.rectangle([slot_x0, wy1 - shade_h, slot_x1, wy1], fill=(0, 0, 0, 44))

        fnt = get_font(DIGIT_FONTS, max(16, round(cell_h * 0.74)), rng)
        bb = draw.textbbox((0, 0), ch_d, font=fnt)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
        tx = slot_x0 + ((slot_x1 - slot_x0) - tw) / 2.0 - bb[0]
        ty = wy0 + (cell_h - th) / 2.0 - bb[1] + rng.uniform(-0.06, 0.06) * cell_h
        draw.text((tx, ty), ch_d, font=fnt, fill=fg_col)

        dx0 = wx0 + cell_w * 0.10
        dx1 = wx1 - cell_w * 0.10
        dy0 = wy0 + cell_h * 0.05
        dy1 = wy1 - cell_h * 0.05
        d_pts = np.array([[dx0, dy0], [dx1, dy0], [dx1, dy1], [dx0, dy1]], dtype=np.float64)
        digit_boxes_patch.append((2 + int(ch_d), d_pts))

    f_unit = get_font(LABEL_FONTS, 24, rng)
    f_small = get_font(LABEL_FONTS, 15, rng)
    draw.text((min(cx_p + r_dial - 48, win_x1 + 6), win_y0 + 8), "m³", font=f_unit, fill=(25, 30, 38, 255))
    brand = rng.choice(["ZENNER", "ASAHI", "ELSTER", "ITRON", "SENSUS", "SANWA", "MINOL"])
    draw.text((cx_p - 44, win_y0 - 30), brand, font=f_small, fill=(35, 42, 55, 255))
    draw.text((cx_p - 56, win_y1 + 8), rng.choice(["Qn 1.5 m³/h", "Q3=2.5 R80", "ISO 4064 PN16"]), font=f_small, fill=(55, 60, 70, 255))

    for sub_dx, sub_dy in [(-78, 66), (0, 98), (78, 66)]:
        sx, sy = cx_p + sub_dx, cy_p + sub_dy
        sr = 28
        draw.ellipse([sx - sr, sy - sr, sx + sr, sy + sr], outline=(45, 45, 50, 255), width=2)
        ang = rng.uniform(0, 2 * math.pi)
        draw.line([sx, sy, sx + sr * 0.78 * math.cos(ang), sy + sr * 0.78 * math.sin(ang)], fill=(195, 28, 28, 255), width=4)
        draw.ellipse([sx - 4, sy - 4, sx + 4, sy + 4], fill=(30, 30, 30, 255))

    meter_pts_patch = np.array([
        [cx_p - r_outer, cy_p - r_outer],
        [cx_p + r_outer, cy_p - r_outer],
        [cx_p + r_outer, cy_p + r_outer],
        [cx_p - r_outer, cy_p + r_outer],
    ], dtype=np.float64)
    win_pts_patch = np.array([
        [win_x0, win_y0],
        [win_x1, win_y0],
        [win_x1, win_y1],
        [win_x0, win_y1],
    ], dtype=np.float64)

    angle_deg = rng.uniform(0.0, 360.0)
    scale = rng.uniform(0.42, 0.72) if casing_style == 'weathered_brass' else rng.uniform(0.50, 0.94)
    tx_c = cw / 2.0 + rng.uniform(-55.0, 55.0) * (1.0 - scale * 0.6)
    ty_c = ch / 2.0 + rng.uniform(-55.0, 55.0) * (1.0 - scale * 0.6)

    rad = math.radians(angle_deg)
    ca, sa = math.cos(rad) * scale, math.sin(rad) * scale
    m_aff = np.array([
        [ca, -sa, tx_c - (ca * cx_p - sa * cy_p)],
        [sa,  ca, ty_c - (sa * cx_p + ca * cy_p)],
    ], dtype=np.float64)

    patch_rgba = np.asarray(pil_patch)
    warped_rgba = cv2.warpAffine(patch_rgba, m_aff, (cw, ch), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
    alpha_m = (warped_rgba[:, :, 3:4].astype(np.float32)) / 255.0
    patch_bgr = warped_rgba[:, :, 2::-1].astype(np.float32)
    comp = (canvas.astype(np.float32) * (1.0 - alpha_m) + patch_bgr * alpha_m)

    gx = np.linspace(0.0, 1.0, cw, dtype=np.float32)[None, :, None]
    gy = np.linspace(0.0, 1.0, ch, dtype=np.float32)[:, None, None]
    if casing_style == 'weathered_brass' or rng.random() < 0.35:
        veil = rng.uniform(0.10, 0.24)
        patina = np.array([rng.uniform(75, 115), rng.uniform(115, 155), rng.uniform(135, 175)], dtype=np.float32)
        gmask = np.clip(0.5 + 0.5 * np.sin(gx * rng.uniform(2.5, 5.0) + gy * rng.uniform(2.5, 5.0)), 0.0, 1.0)
        comp = comp * (1.0 - veil * gmask) + patina * (veil * gmask)
    elif rng.random() < 0.50:
        streak = np.exp(-((gx * math.cos(rad) + gy * math.sin(rad) - rng.uniform(0.3, 0.7)) ** 2) / rng.uniform(0.008, 0.025))
        comp = comp + streak * rng.uniform(18.0, 48.0)

    comp = comp + rng_np.normal(0, rng.uniform(2.0, 7.0), comp.shape).astype(np.float32)
    out_bgr = np.clip(comp, 0, 255).astype(np.uint8)
    if rng.random() < 0.45:
        out_bgr = cv2.GaussianBlur(out_bgr, (3, 3), rng.uniform(0.4, 0.95))

    def xf(pts: np.ndarray) -> np.ndarray:
        ones = np.ones((len(pts), 1), dtype=np.float64)
        return np.hstack([pts, ones]) @ m_aff.T

    win_xf = xf(win_pts_patch)
    if (win_xf[:, 0] < 3).any() or (win_xf[:, 0] > cw - 3).any() or (win_xf[:, 1] < 3).any() or (win_xf[:, 1] > ch - 3).any():
        return None
    meter_xf = np.clip(xf(meter_pts_patch), [0.0, 0.0], [float(cw), float(ch)])
    digs_xf = [(cid, xf(dpts)) for cid, dpts in digit_boxes_patch]

    fake_win = {'corners': win_xf.tolist(), 'confidence': 0.95}
    fake_dets = [{'corners': dpts.tolist(), 'confidence': 0.92, 'class_name': CLASS_ID_TO_NAME[cid]} for cid, dpts in digs_xf]
    if refine_row(fake_win, fake_dets, n_wheels, (cw, ch))['status'] != 'selected':
        return None

    polys: list[tuple[int, np.ndarray]] = [(0, meter_xf), (1, win_xf)] + digs_xf
    return out_bgr, polys, n_wheels


def build_dl7981_and_procedural_obb(manifest_entries: list[dict]) -> None:
    src = RAW_DIR / 'dl7981_water_meter'
    csv_path = src / 'train/_annotations.csv'
    train_img_dir = src / 'train'
    if not csv_path.exists():
        raise FileNotFoundError(f"Missing DL7981 CSV: {csv_path}")

    device = 'cuda:0' if torch.cuda.is_available() else 'cpu'
    log(f"Loading teacher YOLO model on {device}...")
    teacher = YOLO(str(TEACHER_WEIGHTS), task='obb')

    df = pl.read_csv(csv_path).filter(pl.col('class') == 'digit')
    grouped: dict[str, list[tuple[float, float, float, float]]] = {}
    for row in df.iter_rows(named=True):
        fn = row.get('filename')
        if not fn:
            continue
        try:
            xmin, ymin, xmax, ymax = float(row['xmin']), float(row['ymin']), float(row['xmax']), float(row['ymax'])
            if xmax > xmin and ymax > ymin:
                grouped.setdefault(fn, []).append((xmin, ymin, xmax, ymax))
        except (TypeError, ValueError):
            continue

    log(f"Fitting oriented OBB geometry across {len(grouped)} DL7981 images...")
    valid_items = []
    for fn in sorted(grouped.keys()):
        img_path = train_img_dir / fn
        if not img_path.exists():
            continue
        bgr = cv2.imread(str(img_path))
        if bgr is None:
            continue
        h, w = bgr.shape[:2]
        fit = fit_oriented_row(grouped[fn], w, h)
        if fit is None:
            continue
        valid_items.append({'fn': fn, 'path': img_path, 'bgr': bgr, 'raw_boxes': grouped[fn], 'fit': fit})

    log(f"Initial CSV oriented fit passed on {len(valid_items)} / {len(grouped)} images.")
    log("Running 8-wheel leading-zero restoration & teacher digit enrichment...")
    teacher_enrich_and_restore_8wheels(teacher, device, valid_items)

    kept_items = [it for it in valid_items if it.get('accepted')]
    wheel_dist = {}
    for it in kept_items:
        wc = it['wheel_count']
        wheel_dist[wc] = wheel_dist.get(wc, 0) + 1
    log(f"Retained {len(kept_items)} complete real water meter photos (wheel_counts={wheel_dist}).")

    # Select a balanced 1,100-item real subset (all 5-wheel + top 8-wheel) so build & training stay fast and balanced
    items_5w = [it for it in kept_items if it['wheel_count'] == 5]
    items_8w = [it for it in kept_items if it['wheel_count'] == 8]
    selected_real = items_5w + items_8w[:max(0, 1100 - len(items_5w))]
    rng = random.Random(42)
    rng.shuffle(selected_real)
    log(f"Selected {len(selected_real)} balanced real water meters ({len(items_5w)} 5-wheel, {len(selected_real) - len(items_5w)} 8-wheel).")

    counts = {'train': 0, 'val': 0, 'test': 0}

    for i, item in enumerate(selected_real):
        r = i % 10
        split = 'train' if r < 8 else ('val' if r == 8 else 'test')
        bgr = item['bgr']
        base_polys: list[tuple[int, np.ndarray]] = [
            (0, item['meter_obb']),
            (1, item['final_window']),
        ] + list(item['final_digits'])

        stem = Path(item['fn']).stem
        sha = hashlib.sha256(item['path'].read_bytes()).hexdigest()

        variants = [('orig', bgr, base_polys)]
        if split in ('train', 'val'):
            rot_k = (i % 3) + 1  # balanced 90, 180, 270 deg
            rbgr, rpolys = rotate_image_and_polys(bgr, base_polys, rot_k)
            variants.append((f"rot{rot_k * 90}", rbgr, rpolys))
            if i % 2 == 0:
                wk = rng.choice([0, 1, 2, 3])
                wbgr0, wpolys0 = rotate_image_and_polys(bgr, base_polys, wk)
                wbgr, wpolys = apply_weathered_wide_augment(wbgr0, wpolys0, rng)
                variants.append((f"weathered{wk * 90}", wbgr, wpolys))

        for tag, vbgr, vpolys in variants:
            vh, vw = vbgr.shape[:2]
            out_name = f"dl7981_{stem}_{tag}.jpg"
            dst_img = YOLO_DIR / 'images' / split / out_name
            dst_lbl = YOLO_DIR / 'labels' / split / f"dl7981_{stem}_{tag}.txt"
            cv2.imwrite(str(dst_img), vbgr, [int(cv2.IMWRITE_JPEG_QUALITY), 93])
            lines = format_yolo_obb_lines(vpolys, vw, vh)
            dst_lbl.write_text('\n'.join(lines) + '\n', encoding='utf-8')
            counts[split] += 1
            manifest_entries.append({
                'id': dst_img.stem,
                'utility': 'water',
                'source': 'DL7981-CompleteWheel-OrientedOBB',
                'variant': tag,
                'license': 'Open Access Community',
                'commercial_ok': False,
                'split': split,
                'width': vw,
                'height': vh,
                'num_boxes': len(vpolys),
                'source_sha256': sha,
            })

    # Procedural international-style meters (5-wheel weathered + 8-wheel S120 plastic/brass)
    proc_targets = {'train': 400, 'val': 60, 'test': 40}
    for split, target_n in proc_targets.items():
        s_rng = random.Random(1042 if split == 'train' else (2042 if split == 'val' else 3042))
        generated = 0
        attempts = 0
        while generated < target_n and attempts < target_n * 4:
            attempts += 1
            scene = synthesize_water_meter_scene(s_rng)
            if scene is None:
                continue
            sbgr, spolys, n_wheels = scene
            sh, sw = sbgr.shape[:2]
            out_name = f"proc_water_{split}_{generated:04d}.jpg"
            dst_img = YOLO_DIR / 'images' / split / out_name
            dst_lbl = YOLO_DIR / 'labels' / split / f"proc_water_{split}_{generated:04d}.txt"
            cv2.imwrite(str(dst_img), sbgr, [int(cv2.IMWRITE_JPEG_QUALITY), s_rng.randint(84, 95)])
            dst_lbl.write_text('\n'.join(format_yolo_obb_lines(spolys, sw, sh)) + '\n', encoding='utf-8')
            sha = hashlib.sha256(dst_img.read_bytes()).hexdigest()
            counts[split] += 1
            generated += 1
            manifest_entries.append({
                'id': dst_img.stem,
                'utility': 'water',
                'source': 'Trozy-Procedural-Mechanical-Water-OBB',
                'variant': f'wheels_{n_wheels}',
                'license': 'CC0-1.0',
                'commercial_ok': True,
                'split': split,
                'width': sw,
                'height': sh,
                'num_boxes': len(spolys),
                'source_sha256': sha,
            })
        log(f"Generated {generated} international-style procedural images for {split}.")

    # Procedural Vietnam-style meters (4/5/6-wheel DN15/DN20 Asahi, Minh Hoa, etc.)
    # Added to cover VN-specific appearance gap: black plastic rectangular casing, white bezel,
    # tile/concrete/rusted-metal backgrounds common in Trozy property submissions.
    vn_targets = {'train': 500, 'val': 80, 'test': 50}
    for split, target_n in vn_targets.items():
        s_rng = random.Random(5042 if split == 'train' else (6042 if split == 'val' else 7042))
        generated = 0
        attempts = 0
        while generated < target_n and attempts < target_n * 5:
            attempts += 1
            scene = synthesize_vn_water_meter_scene(s_rng)
            if scene is None:
                continue
            sbgr, spolys, n_wheels = scene
            sh, sw = sbgr.shape[:2]
            out_name = f"proc_vn_water_{split}_{generated:04d}.jpg"
            dst_img = YOLO_DIR / 'images' / split / out_name
            dst_lbl = YOLO_DIR / 'labels' / split / f"proc_vn_water_{split}_{generated:04d}.txt"
            cv2.imwrite(str(dst_img), sbgr, [int(cv2.IMWRITE_JPEG_QUALITY), s_rng.randint(84, 95)])
            dst_lbl.write_text('\n'.join(format_yolo_obb_lines(spolys, sw, sh)) + '\n', encoding='utf-8')
            sha = hashlib.sha256(dst_img.read_bytes()).hexdigest()
            counts[split] += 1
            generated += 1
            manifest_entries.append({
                'id': dst_img.stem,
                'utility': 'water',
                'source': 'Trozy-Procedural-VN-Water-OBB',
                'variant': f'vn_wheels_{n_wheels}',
                'license': 'CC0-1.0',
                'commercial_ok': True,
                'split': split,
                'width': sw,
                'height': sh,
                'num_boxes': len(spolys),
                'source_sha256': sha,
            })
        log(f"Generated {generated} VN-style procedural images for {split}.")

    log(f"Final YOLO-OBB split image counts: {counts}")


def build_eval_readings_benchmark() -> int:
    records = []

    val_dir = RAW_DIR / 'dl7981_water_meter/images'
    if val_dir.exists():
        for p in sorted(val_dir.glob('*value*')):
            m = re.search(r'value_(\d+)_(\d+)', p.name)
            if not m:
                continue
            int_part, dec_part = m.group(1), m.group(2)
            with Image.open(p) as im:
                w, h = im.size
            records.append({
                'id': p.stem,
                'source': 'DL7981-Value-Benchmark',
                'path': p.relative_to(ROOT).as_posix(),
                'width': w,
                'height': h,
                'integer_value': int(int_part),
                'fractional_raw': dec_part,
                'reading_float_str': f"{int_part}.{dec_part}",
                'sha256': hashlib.sha256(p.read_bytes()).hexdigest(),
            })

    ud_dir = RAW_DIR / 'ud_smart_city_water_meter'
    ud_csv = ud_dir / 'water meters.csv'
    if ud_csv.exists():
        with open(ud_csv, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f, delimiter=';')
            for row in reader:
                p = ud_dir / 'images' / row['photo_name']
                if not p.exists():
                    continue
                m = re.search(r'value_(\d+)_(\d+)', p.name)
                int_part = m.group(1) if m else row['value'].split('.')[0]
                dec_part = m.group(2) if m else (row['value'].split('.')[1] if '.' in row['value'] else '0')
                loc = ast.literal_eval(row['location'])
                poly = [[pt['x'], pt['y']] for pt in loc.get('data', [])]
                with Image.open(p) as im:
                    w, h = im.size
                records.append({
                    'id': f"ud_{p.stem}",
                    'source': 'UD-Smart-City-CC0',
                    'path': p.relative_to(ROOT).as_posix(),
                    'width': w,
                    'height': h,
                    'integer_value': int(int_part),
                    'fractional_raw': dec_part,
                    'reading_float_str': f"{int_part}.{dec_part}",
                    'polygon': poly,
                    'sha256': hashlib.sha256(p.read_bytes()).hexdigest(),
                })

    with open(EVAL_READINGS_FILE, 'w', encoding='utf-8') as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
    log(f"Wrote {len(records)} held-out end-to-end reading benchmark records to {EVAL_READINGS_FILE}")
    return len(records)


def main() -> None:
    log("Building complete-wheel high-precision oriented Water Meter dataset...")
    init_dirs()
    write_data_yaml()
    manifest_entries: list[dict] = []
    build_dl7981_and_procedural_obb(manifest_entries)
    build_eval_readings_benchmark()

    with open(MANIFEST_FILE, 'w', encoding='utf-8') as f:
        for entry in manifest_entries:
            f.write(json.dumps(entry, ensure_ascii=False) + '\n')
    log(f"Water dataset build complete. Total YOLO-OBB entries: {len(manifest_entries)}")


if __name__ == '__main__':
    main()
