"""Fine-tune PP-OCRv6_small_rec and PP-OCRv6_small_det on RTX 4070 & export ONNX.

Uses OnnxTrainableModule for zero-drift ONNX graph fine-tuning with teacher
knowledge-preservation regularization, keeping original official ONNX models
untouched and writing fine-tuned models to:
  .runtime/paddleocr/models/electric/PP-OCRv6_small_det_trozy_onnx_infer/
  .runtime/paddleocr/models/electric/PP-OCRv6_small_rec_trozy_onnx_infer/
"""
from __future__ import annotations

import atexit
import gc
import hashlib
import json
import math
import os
from pathlib import Path
import random
import shutil
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
GPU_SITE = ROOT / '.runtime/meter-digits/train-gpu-packages'
if GPU_SITE.is_dir():
    os.environ['TROZY_USE_TRAIN_GPU'] = '1'
    os.environ['TROZY_TRAIN_GPU_SITE'] = str(GPU_SITE)
    if str(GPU_SITE) not in sys.path:
        sys.path.insert(0, str(GPU_SITE))
PADDLE_SITE = ROOT / '.runtime/paddleocr/site-packages'
if PADDLE_SITE.is_dir() and str(PADDLE_SITE) not in sys.path:
    sys.path.append(str(PADDLE_SITE))
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(ROOT / 'src/ai'))

_INHERITED_TMP = Path(os.environ.get('TEMP', '')).resolve()
if _INHERITED_TMP.is_relative_to(ROOT / '.runtime/tmp') and _INHERITED_TMP.name.startswith('node-') and _INHERITED_TMP.is_dir():
    # run-project.mjs owns and cleans this invocation's temporary directory.
    _TASK_TMP = _INHERITED_TMP
else:
    _TMP_PARENT = (ROOT / 'tmp').resolve()
    if not _TMP_PARENT.is_relative_to(ROOT):
        raise RuntimeError('Training temporary files must stay inside the project.')
    _TMP_PARENT.mkdir(parents=True, exist_ok=True)
    _TASK_TMP = Path(tempfile.mkdtemp(prefix='train-electric-paddle-', dir=_TMP_PARENT)).resolve()

    def _cleanup_task_tmp():
        target = _TASK_TMP.resolve()
        if target != _TASK_TMP or target.parent != _TMP_PARENT or not target.name.startswith('train-electric-paddle-'):
            raise RuntimeError('Refusing to clean an unexpected training temporary directory.')
        if target.exists():
            shutil.rmtree(target)

    atexit.register(_cleanup_task_tmp)
for _key in ('TEMP', 'TMP', 'TMPDIR'):
    os.environ[_key] = str(_TASK_TMP)
tempfile.tempdir = str(_TASK_TMP)
os.environ['PYTHONIOENCODING'] = 'utf-8'
_PDX_HOME = ROOT / '.runtime/paddleocr/cache/home'
_PDX_HOME.mkdir(parents=True, exist_ok=True)
os.environ['HOME'] = str(_PDX_HOME)
os.environ['USERPROFILE'] = str(_PDX_HOME)
os.environ['LOCALAPPDATA'] = str(_PDX_HOME)
os.environ['APPDATA'] = str(_PDX_HOME)
os.environ['PADDLE_PDX_CACHE_HOME'] = str(ROOT / '.cache/paddlex')
os.environ['PADDLEOCR_HOME'] = str(ROOT / '.runtime/paddleocr/cache')
os.environ['PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK'] = 'True'

import cv2
import numpy as np
from PIL import Image, ImageOps
import pyclipper
import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset
import yaml

from onnx_torch_bridge import OnnxTrainableModule

PADDLE_RUNTIME = ROOT / '.runtime/paddleocr'
BASE_DET_DIR = PADDLE_RUNTIME / 'models/PP-OCRv6_small_det_onnx_infer'
BASE_REC_DIR = PADDLE_RUNTIME / 'models/PP-OCRv6_small_rec_onnx_infer'
OUT_DET_DIR = PADDLE_RUNTIME / 'models/electric/PP-OCRv6_small_det_trozy_onnx_infer'
OUT_REC_DIR = PADDLE_RUNTIME / 'models/electric/PP-OCRv6_small_rec_trozy_onnx_infer'

ELEC_DIR = ROOT / '.runtime/datasets/electric'
DET_DATA_DIR = ELEC_DIR / 'paddle-det'
REC_DATA_DIR = ELEC_DIR / 'paddle-rec'
RUNS_DIR = PADDLE_RUNTIME / 'runs'
REPORT_PATH = RUNS_DIR / 'electric_paddle_eval.json'
GOLD_REPORT_DIR = ROOT / 'data/meter-gold/runs'


def log(msg: str) -> None:
    print(f"[train_electric_paddle] {msg}", flush=True)


def load_gold_val_score() -> float | None:
    """Read the most recent gold-set val report for electric meters if available."""
    if not GOLD_REPORT_DIR.exists():
        return None
    reports = sorted(GOLD_REPORT_DIR.glob('val-*.json'), reverse=True)
    for rp in reports[:5]:
        try:
            d = json.loads(rp.read_text(encoding='utf-8'))
            elec_agg = d.get('byUtility', {}).get('electric') or d.get('perUtility', {}).get('electric') or d.get('overall') or d.get('aggregate') or {}
            rate = elec_agg.get('correct_rate')
            if isinstance(rate, (int, float)):
                log(f"Gold val report {rp.name}: electric correct_rate={rate:.4f} (n={elec_agg.get('n', '?')})")
                return float(rate)
        except Exception:
            continue
    return None


def load_rec_vocab() -> tuple[list[str], dict[str, int]]:
    cfg = yaml.safe_load((BASE_REC_DIR / 'inference.yml').read_text(encoding='utf-8'))
    char_dict = [str(c) for c in cfg['PostProcess']['character_dict']]
    vocab = ['blank'] + char_dict + [' ']
    char2id = {ch: idx for idx, ch in enumerate(vocab)}
    return vocab, char2id


def preprocess_rec_bgr(bgr: np.ndarray, target_w: int = 320) -> np.ndarray:
    """Exact match to PaddleX OCRReisizeNormImg (3, 48, target_w)."""
    img_h = 48
    h, w = bgr.shape[:2]
    ratio = w / float(max(h, 1))
    resized_w = min(target_w, max(1, int(math.ceil(img_h * ratio))))
    resized = cv2.resize(bgr, (resized_w, img_h)).astype(np.float32)
    resized = resized.transpose((2, 0, 1)) / 255.0
    resized = (resized - 0.5) / 0.5
    pad = np.zeros((3, img_h, target_w), dtype=np.float32)
    pad[:, :, :resized_w] = resized
    return pad


def ctc_greedy_decode(probs_np: np.ndarray, vocab: list[str]) -> list[tuple[str, float]]:
    """Exact match to PaddleX CTCLabelDecode."""
    idxs = probs_np.argmax(axis=-1)
    maxp = probs_np.max(axis=-1)
    out = []
    for b in range(idxs.shape[0]):
        seq = idxs[b]
        sc = maxp[b]
        sel = np.ones(len(seq), dtype=bool)
        sel[1:] = seq[1:] != seq[:-1]
        sel &= seq != 0
        chars = [vocab[int(i)] for i in seq[sel]]
        conf = float(np.mean(sc[sel])) if np.any(sel) else 0.0
        out.append((''.join(chars), conf))
    return out


class RecCropDataset(Dataset):
    def __init__(self, split: str, char2id: dict[str, int], augment: bool = False):
        self.samples: list[tuple[Path, str, list[int], bool]] = []
        self.augment = augment
        lbl_file = REC_DATA_DIR / f"{split}_label.txt"
        for line in lbl_file.read_text(encoding='utf-8').splitlines():
            if '\t' not in line:
                continue
            rel, text = line.split('\t', 1)
            text = text.strip()
            p = REC_DATA_DIR / rel
            if not p.exists() or not text:
                continue
            ids = [char2id[c] for c in text if c in char2id]
            if len(ids) != len(text) or len(ids) > 36:
                continue
            is_digits = text.isdigit()
            self.samples.append((p, text, ids, is_digits))

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int):
        p, text, ids, is_digits = self.samples[idx]
        bgr = cv2.imread(str(p))
        if bgr is None:
            bgr = np.zeros((48, 160, 3), dtype=np.uint8)
        if self.augment:
            rng = np.random.default_rng()
            if rng.random() < 0.5:
                alpha = float(rng.uniform(0.80, 1.22))
                beta = float(rng.uniform(-16.0, 16.0))
                bgr = np.clip(bgr.astype(np.float32) * alpha + beta, 0, 255).astype(np.uint8)
            if rng.random() < 0.3:
                bgr = cv2.GaussianBlur(bgr, (3, 3), float(rng.uniform(0.4, 1.0)))
        tensor_np = preprocess_rec_bgr(bgr, target_w=320)
        return torch.from_numpy(tensor_np), torch.tensor(ids, dtype=torch.long), text, is_digits


def rec_collate(batch):
    imgs = torch.stack([b[0] for b in batch], dim=0)
    targets = torch.cat([b[1] for b in batch], dim=0)
    lengths = torch.tensor([len(b[1]) for b in batch], dtype=torch.long)
    texts = [b[2] for b in batch]
    is_digits = torch.tensor([b[3] for b in batch], dtype=torch.bool)
    return imgs, targets, lengths, texts, is_digits


@torch.no_grad()
def evaluate_rec(model: OnnxTrainableModule, loader: DataLoader, vocab: list[str], device: torch.device) -> dict:
    model.eval()
    total = 0
    exact = 0
    digit_total = 0
    digit_exact = 0
    for imgs, _, _, texts, is_digits in loader:
        imgs = imgs.to(device)
        probs = model(imgs, return_logits=False).detach().cpu().numpy()
        decoded = ctc_greedy_decode(probs, vocab)
        for (pred_txt, _), gt_txt, is_d in zip(decoded, texts, is_digits.tolist()):
            total += 1
            match = (pred_txt == gt_txt)
            if match:
                exact += 1
            if is_d:
                digit_total += 1
                if match:
                    digit_exact += 1
    return {
        'total': total,
        'exact_acc': round(exact / max(total, 1), 4),
        'digit_total': digit_total,
        'digit_exact_acc': round(digit_exact / max(digit_total, 1), 4),
    }


def train_rec_model(device: torch.device) -> tuple[dict, dict, str]:
    vocab, char2id = load_rec_vocab()
    log(f"Loaded PP-OCRv6_small_rec vocabulary ({len(vocab)} tokens).")

    train_ds = RecCropDataset('train', char2id, augment=True)
    val_ds = RecCropDataset('val', char2id, augment=False)
    test_ds = RecCropDataset('test', char2id, augment=False)
    train_loader = DataLoader(train_ds, batch_size=32, shuffle=True, num_workers=0, collate_fn=rec_collate)
    val_loader = DataLoader(val_ds, batch_size=32, shuffle=False, num_workers=0, collate_fn=rec_collate)
    test_loader = DataLoader(test_ds, batch_size=32, shuffle=False, num_workers=0, collate_fn=rec_collate)
    log(f"Rec datasets: train={len(train_ds)}, val={len(val_ds)}, test={len(test_ds)}")

    student = OnnxTrainableModule(BASE_REC_DIR / 'inference.onnx').to(device)
    base_test_metrics = evaluate_rec(student, test_loader, vocab, device)
    log(f"Baseline Rec test metrics: {base_test_metrics}")

    existing_rec = OUT_REC_DIR / 'inference.onnx'
    if existing_rec.is_file() and '--force-rec' not in sys.argv:
        del student
        gc.collect()
        torch.cuda.empty_cache()
        ft_mod = OnnxTrainableModule(existing_rec).to(device)
        ft_test_metrics = evaluate_rec(ft_mod, test_loader, vocab, device)
        sha = hashlib.sha256(existing_rec.read_bytes()).hexdigest()
        log(f"Reusing already fine-tuned Rec ONNX at {existing_rec} (sha256={sha}): test={ft_test_metrics}")
        del ft_mod
        gc.collect()
        torch.cuda.empty_cache()
        return base_test_metrics, ft_test_metrics, sha

    teacher = OnnxTrainableModule(BASE_REC_DIR / 'inference.onnx').to(device)
    teacher.eval()
    for p in teacher.parameters():
        p.requires_grad_(False)
    anchor_params = [(p, p.detach().clone()) for p in student.parameters() if p.requires_grad]

    optimizer = torch.optim.AdamW([p for p, _ in anchor_params], lr=8e-5, weight_decay=1e-4)
    epochs = 10
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs * len(train_loader), eta_min=8e-6)

    best_val_acc = -1.0
    best_state = {k: v.detach().cpu().clone() for k, v in student.state_dict().items()}

    for epoch in range(1, epochs + 1):
        student.train()
        running_loss = 0.0
        steps = 0
        t0 = time.monotonic()
        for imgs, targets, target_lengths, _, is_digits in train_loader:
            imgs = imgs.to(device)
            targets = targets.to(device)
            target_lengths = target_lengths.to(device)

            _, logits = student(imgs, return_logits=True)
            log_probs = F.log_softmax(logits, dim=-1)
            bsz, t_steps, _ = log_probs.shape
            input_lengths = torch.full((bsz,), t_steps, dtype=torch.long, device=device)

            ctc_loss = F.ctc_loss(
                log_probs.permute(1, 0, 2),
                targets,
                input_lengths,
                target_lengths,
                blank=0,
                zero_infinity=True,
            )

            # Knowledge distillation on non-digit replay samples + mild global KL to prevent dictionary drift
            with torch.no_grad():
                t_probs = teacher(imgs, return_logits=False)
            kd_all = F.kl_div(log_probs, t_probs, reduction='batchmean')
            non_digit_mask = (~is_digits).to(device)
            if non_digit_mask.any():
                kd_replay = F.kl_div(log_probs[non_digit_mask], t_probs[non_digit_mask], reduction='batchmean')
            else:
                kd_replay = torch.tensor(0.0, device=device)

            l2_anchor = sum((p - p0).pow(2).sum() for p, p0 in anchor_params)
            loss = ctc_loss + 0.06 * kd_all + 0.35 * kd_replay + 2e-4 * l2_anchor

            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_([p for p, _ in anchor_params], 2.0)
            optimizer.step()
            scheduler.step()

            running_loss += float(loss.item())
            steps += 1

        val_m = evaluate_rec(student, val_loader, vocab, device)
        dt = round(time.monotonic() - t0, 1)
        score = 0.65 * val_m['digit_exact_acc'] + 0.35 * val_m['exact_acc']
        log(f"Rec Epoch {epoch:02d}/{epochs} ({dt}s): loss={running_loss / max(steps, 1):.4f} val={val_m}")
        if score >= best_val_acc:
            best_val_acc = score
            best_state = {k: v.detach().cpu().clone() for k, v in student.state_dict().items()}

    student.load_state_dict(best_state)
    ft_test_metrics = evaluate_rec(student, test_loader, vocab, device)
    log(f"Fine-tuned Rec test metrics: {ft_test_metrics}")

    OUT_REC_DIR.mkdir(parents=True, exist_ok=True)
    for fname in ('inference.yml', 'inference.json', 'README.md'):
        src_f = BASE_REC_DIR / fname
        if src_f.exists():
            shutil.copy2(src_f, OUT_REC_DIR / fname)
    out_onnx = student.export_onnx(OUT_REC_DIR / 'inference.onnx')
    sha = hashlib.sha256(out_onnx.read_bytes()).hexdigest()
    log(f"Exported fine-tuned Rec ONNX to {out_onnx} (sha256={sha})")
    return base_test_metrics, ft_test_metrics, sha


def exact_shrink_distance(poly: np.ndarray, unclip_ratio: float = 1.4) -> float:
    """Solve inverse DBPostProcess unclip quadratic so expanded contour matches poly."""
    area = float(cv2.contourArea(poly.astype(np.float32)))
    peri = float(cv2.arcLength(poly.astype(np.float32), True))
    if area <= 4.0 or peri <= 4.0:
        return 0.0
    # For rectangle A = w*h, L = 2*(w+h) => w+h = L/2: 13.6 d^2 - 2.4 L d + 1.4 A = 0
    a_coef = 8.0 + 4.0 * unclip_ratio  # 13.6
    b_coef = (2.0 + unclip_ratio) * peri * 0.5 * 2.0  # (2 + r)*(w+h)*2 -> wait: 2*(1+r)*(w+h) = (1+r)*L = 2.4 * L
    b_coef = (1.0 + unclip_ratio) * peri
    c_coef = unclip_ratio * area
    disc = b_coef * b_coef - 4.0 * a_coef * c_coef
    if disc >= 0.0:
        d = (b_coef - math.sqrt(disc)) / (2.0 * a_coef)
        if d > 0.5:
            return d
    return 0.55 * area / max(peri, 1.0)


def det_resize_min736(bgr: np.ndarray) -> tuple[np.ndarray, float, float]:
    """Exact match to PaddleX DetResizeForTest(limit_side_len=736, limit_type='min')."""
    h, w = bgr.shape[:2]
    limit = 736.0
    if min(h, w) < limit:
        ratio = limit / float(min(h, w))
    else:
        ratio = 1.0
    rh = int(h * ratio)
    rw = int(w * ratio)
    if max(rh, rw) > 4000:
        r2 = 4000.0 / float(max(rh, rw))
        rh, rw = int(rh * r2), int(rw * r2)
    rh = max(int(round(rh / 32.0) * 32), 32)
    rw = max(int(round(rw / 32.0) * 32), 32)
    if rh == h and rw == w:
        return bgr, 1.0, 1.0
    resized = cv2.resize(bgr, (rw, rh))
    return resized, rh / float(h), rw / float(w)


def normalize_det_bgr(bgr: np.ndarray) -> np.ndarray:
    x = bgr.astype(np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)[None, None, :]
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)[None, None, :]
    x = (x - mean) / std
    return x.transpose((2, 0, 1))


class DetSceneDataset(Dataset):
    def __init__(self, split: str, crop_size: int = 512, augment: bool = False):
        self.items: list[tuple[Path, list[dict]]] = []
        self.crop_size = crop_size
        self.augment = augment
        self._cache: dict[int, tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]] = {}
        lbl_file = DET_DATA_DIR / f"{split}_label.txt"
        for line in lbl_file.read_text(encoding='utf-8').splitlines():
            if '\t' not in line:
                continue
            rel, raw_json = line.split('\t', 1)
            p = DET_DATA_DIR / rel
            if p.exists():
                self.items.append((p, json.loads(raw_json)))

    def __len__(self) -> int:
        return len(self.items)

    def _build_item(self, idx: int) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        p, boxes = self.items[idx]
        bgr = cv2.imread(str(p))
        if bgr is None:
            bgr = np.zeros((512, 512, 3), dtype=np.uint8)

        resized, ry, rx = det_resize_min736(bgr)
        rh, rw = resized.shape[:2]
        cs = self.crop_size

        scaled_polys = []
        counter_center = (rw // 2, rh // 2)
        for i_b, b in enumerate(boxes):
            pts = np.array(b['points'], dtype=np.float64) * np.array([rx, ry], dtype=np.float64)
            txt = str(b.get('transcription', ''))
            is_cnt = (i_b == 0 and txt.isdigit() and 4 <= len(txt) <= 8)
            if is_cnt:
                c = pts.mean(axis=0)
                counter_center = (int(round(c[0])), int(round(c[1])))
            scaled_polys.append((pts, is_cnt))

        pad_h = max(0, cs - rh)
        pad_w = max(0, cs - rw)
        if pad_h > 0 or pad_w > 0:
            resized = cv2.copyMakeBorder(resized, 0, pad_h, 0, pad_w, cv2.BORDER_CONSTANT, value=(128, 128, 128))
            rh, rw = resized.shape[:2]

        cx, cy = counter_center
        if self.augment:
            rng_j = random.Random(10000 + idx)
            jitter = rng_j.randint(-64, 64)
            jitter_y = rng_j.randint(-64, 64)
        else:
            jitter, jitter_y = 0, 0
        x0 = min(max(0, cx - cs // 2 + jitter), rw - cs)
        y0 = min(max(0, cy - cs // 2 + jitter_y), rh - cs)
        crop_bgr = resized[y0:y0 + cs, x0:x0 + cs].copy()

        target_mask = np.zeros((cs, cs), dtype=np.float32)
        weight_mask = np.ones((cs, cs), dtype=np.float32)
        focus_mask = np.zeros((cs, cs), dtype=np.float32)

        for pts, is_cnt in scaled_polys:
            local_pts = pts - np.array([x0, y0], dtype=np.float64)
            if local_pts[:, 0].max() < 2 or local_pts[:, 0].min() > cs - 2 or local_pts[:, 1].max() < 2 or local_pts[:, 1].min() > cs - 2:
                continue
            d_shrink = exact_shrink_distance(local_pts, unclip_ratio=1.4)
            pco = pyclipper.PyclipperOffset()
            pco.AddPath(local_pts.astype(np.int64).tolist(), pyclipper.JT_ROUND, pyclipper.ET_CLOSEDPOLYGON)
            shrunk = pco.Execute(-d_shrink)

            full_poly_i32 = [local_pts.astype(np.int32)]
            poly_fill = np.zeros((cs, cs), dtype=np.uint8)
            cv2.fillPoly(poly_fill, full_poly_i32, 1)

            shrunk_fill = np.zeros((cs, cs), dtype=np.uint8)
            if shrunk:
                for sp in shrunk:
                    arr_sp = np.array(sp, dtype=np.int32)
                    if len(arr_sp) >= 3:
                        cv2.fillPoly(shrunk_fill, [arr_sp], 1)
            else:
                shrunk_fill = poly_fill

            target_mask = np.maximum(target_mask, shrunk_fill.astype(np.float32))
            border_band = (poly_fill > 0) & (shrunk_fill == 0)
            weight_mask[border_band] = np.maximum(weight_mask[border_band], 2.2 if is_cnt else 1.2)
            if is_cnt:
                weight_mask[shrunk_fill > 0] = 3.5
                dil = cv2.dilate(poly_fill, np.ones((27, 27), dtype=np.uint8), iterations=1)
                focus_mask = np.maximum(focus_mask, dil.astype(np.float32))
                gap_ring = (dil > 0) & (poly_fill == 0)
                weight_mask[gap_ring] = 4.5

        return crop_bgr, target_mask[None, :, :], weight_mask[None, :, :], focus_mask[None, :, :]

    def __getitem__(self, idx: int):
        if idx not in self._cache:
            self._cache[idx] = self._build_item(idx)
        crop_bgr, target_mask, weight_mask, focus_mask = self._cache[idx]
        if self.augment:
            rng = np.random.default_rng()
            if rng.random() < 0.50:
                crop_bgr = np.clip(crop_bgr.astype(np.float32) * float(rng.uniform(0.84, 1.18)) + float(rng.uniform(-12, 12)), 0, 255).astype(np.uint8)
        inp = normalize_det_bgr(crop_bgr)
        return (
            torch.from_numpy(inp),
            torch.from_numpy(target_mask),
            torch.from_numpy(weight_mask),
            torch.from_numpy(focus_mask),
        )


@torch.no_grad()
def evaluate_det(model: OnnxTrainableModule, loader: DataLoader, device: torch.device) -> dict:
    model.eval()
    inter_sum = 0.0
    union_sum = 0.0
    bce_sum = 0.0
    steps = 0
    for inp, target, weight, _ in loader:
        inp = inp.to(device)
        target = target.to(device)
        weight = weight.to(device)
        probs, logits = model(inp, return_logits=True)
        bce = (F.binary_cross_entropy_with_logits(logits, target, reduction='none') * weight).mean()
        bce_sum += float(bce.item())
        pred_bin = (probs >= 0.30).float()
        gt_bin = (target >= 0.5).float()
        inter_sum += float((pred_bin * gt_bin).sum().item())
        union_sum += float(((pred_bin + gt_bin) > 0).float().sum().item())
        steps += 1
    return {
        'weighted_bce': round(bce_sum / max(steps, 1), 4),
        'shrink_iou': round(inter_sum / max(union_sum, 1.0), 4),
    }


def train_det_model(device: torch.device) -> tuple[dict, dict, str]:
    gc.collect()
    torch.cuda.empty_cache()
    train_ds = DetSceneDataset('train', crop_size=448, augment=True)
    val_ds = DetSceneDataset('val', crop_size=448, augment=False)
    test_ds = DetSceneDataset('test', crop_size=448, augment=False)
    train_loader = DataLoader(train_ds, batch_size=6, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_ds, batch_size=6, shuffle=False, num_workers=0)
    test_loader = DataLoader(test_ds, batch_size=6, shuffle=False, num_workers=0)
    log(f"Det datasets: train={len(train_ds)}, val={len(val_ds)}, test={len(test_ds)}")

    student = OnnxTrainableModule(BASE_DET_DIR / 'inference.onnx').to(device)
    teacher = OnnxTrainableModule(BASE_DET_DIR / 'inference.onnx').to(device)
    teacher.eval()
    for p in teacher.parameters():
        p.requires_grad_(False)
    anchor_params = [(p, p.detach().clone()) for p in student.parameters() if p.requires_grad]

    base_test = evaluate_det(student, test_loader, device)
    log(f"Baseline Det test metrics: {base_test}")

    optimizer = torch.optim.AdamW([p for p, _ in anchor_params], lr=1.0e-4, weight_decay=1e-4)
    epochs = 5
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs * len(train_loader), eta_min=1e-5)

    best_iou = -1.0
    best_state = {k: v.detach().cpu().clone() for k, v in student.state_dict().items()}

    for epoch in range(1, epochs + 1):
        student.train()
        running_loss = 0.0
        steps = 0
        t0 = time.monotonic()
        for inp, target, weight, focus in train_loader:
            inp = inp.to(device)
            target = target.to(device)
            weight = weight.to(device)
            focus = focus.to(device)

            probs, logits = student(inp, return_logits=True)
            bce = (F.binary_cross_entropy_with_logits(logits, target, reduction='none') * weight).mean()

            # Soft Dice loss on shrink map
            inter = (probs * target * weight).sum(dim=(1, 2, 3))
            denom = ((probs + target) * weight).sum(dim=(1, 2, 3)) + 1.0
            dice_loss = (1.0 - (2.0 * inter + 1.0) / denom).mean()

            # Teacher preservation outside the counter focus mask
            with torch.no_grad():
                t_probs = teacher(inp, return_logits=False)
            bg_mask = 1.0 - focus
            kd_bg = (((probs - t_probs) ** 2) * bg_mask).sum() / (bg_mask.sum() + 1.0)
            l2_anchor = sum((p - p0).pow(2).sum() for p, p0 in anchor_params)

            loss = bce + 0.5 * dice_loss + 0.35 * kd_bg + 1.5e-4 * l2_anchor

            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_([p for p, _ in anchor_params], 2.0)
            optimizer.step()
            scheduler.step()

            running_loss += float(loss.item())
            steps += 1

        val_m = evaluate_det(student, val_loader, device)
        dt = round(time.monotonic() - t0, 1)
        log(f"Det Epoch {epoch:02d}/{epochs} ({dt}s): loss={running_loss / max(steps, 1):.4f} val={val_m}")
        if val_m['shrink_iou'] >= best_iou:
            best_iou = val_m['shrink_iou']
            best_state = {k: v.detach().cpu().clone() for k, v in student.state_dict().items()}

    student.load_state_dict(best_state)
    ft_test = evaluate_det(student, test_loader, device)
    log(f"Fine-tuned Det test metrics: {ft_test}")

    OUT_DET_DIR.mkdir(parents=True, exist_ok=True)
    for fname in ('inference.yml', 'inference.json', 'README.md'):
        src_f = BASE_DET_DIR / fname
        if src_f.exists():
            shutil.copy2(src_f, OUT_DET_DIR / fname)
    out_onnx = student.export_onnx(OUT_DET_DIR / 'inference.onnx')
    sha = hashlib.sha256(out_onnx.read_bytes()).hexdigest()
    log(f"Exported fine-tuned Det ONNX to {out_onnx} (sha256={sha})")
    return base_test, ft_test, sha


def make_onnx_ocr(det_dir: Path, rec_dir: Path):
    from paddleocr import PaddleOCR
    return PaddleOCR(
        text_detection_model_name='PP-OCRv6_small_det',
        text_detection_model_dir=str(det_dir),
        text_recognition_model_name='PP-OCRv6_small_rec',
        text_recognition_model_dir=str(rec_dir),
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        device='cpu',
        engine='onnxruntime',
        engine_config={'providers': ['CPUExecutionProvider'], 'intra_op_num_threads': 4, 'inter_op_num_threads': 1},
    )


def evaluate_end_to_end_pipeline(det_dir: Path, rec_dir: Path, max_test_scenes: int = 80) -> dict:
    """Run exact meter_paddle.py two-pass pipeline via ONNXRuntime CPU."""
    import meter_paddle as mp
    from unittest.mock import patch

    ocr = make_onnx_ocr(det_dir, rec_dir)
    # 1. Held-out synthetic faceplate scenes (auto 2-pass exact match)
    lbl_lines = (DET_DATA_DIR / 'test_label.txt').read_text(encoding='utf-8').splitlines()
    faceplate_scenes = []
    for ln in lbl_lines:
        if '\t' not in ln:
            continue
        rel, js = ln.split('\t', 1)
        if 'elec_faceplate_' in rel:
            boxes = json.loads(js)
            if boxes and boxes[0]['transcription'].isdigit():
                faceplate_scenes.append((DET_DATA_DIR / rel, boxes[0]['transcription']))
    faceplate_scenes = faceplate_scenes[:max_test_scenes]

    auto_ready = 0
    auto_exact = 0
    auto_wrong = 0
    with patch.object(mp, 'create_ocr', return_value=ocr):
        for img_p, gt_digits in faceplate_scenes:
            frame = Image.open(img_p).convert('RGB')
            dec = 1 if len(gt_digits) >= 5 else 0
            req = {'mode': 'auto', 'utility': 'electric', 'profile': {'digits': len(gt_digits), 'decimals': dec}}
            res = mp.electric_request(req, frame)
            if res['status'] == 'ready' and res['reading']:
                auto_ready += 1
                if res['reading']['digits'] == gt_digits:
                    auto_exact += 1
                else:
                    auto_wrong += 1

        # 2. Held-out real Vietnamese GELEX EMIC photos (zero training exposure!)
        manifest = json.loads((ROOT / 'docs/test/fixtures/visionstate-yolo-samples.json').read_text(encoding='utf-8'))
        real_fixtures = {}
        for sample in manifest['samples']:
            if sample['utility'] != 'electric':
                continue
            p = ROOT / sample['file']
            if not p.exists():
                continue
            frame = ImageOps.exif_transpose(Image.open(p)).convert('RGB')
            auto_res = mp.electric_request(
                {'mode': 'auto', 'utility': 'electric', 'profile': {'digits': sample['digits'], 'decimals': sample['decimals']}},
                frame,
            )
            corners = [[x / sample['sourceSize']['width'], y / sample['sourceSize']['height']] for x, y in sample['manualRegion']['corners']]
            man_res = mp.electric_request(
                {'mode': 'read', 'utility': 'electric', 'digits': sample['digits'], 'decimals': sample['decimals'], 'corners': corners},
                frame,
            )
            real_fixtures[sample['id']] = {
                'reference': sample['reference']['visibleDigits'],
                'auto_status': auto_res['status'],
                'auto_reading': auto_res['reading']['displayText'] if auto_res['reading'] else None,
                'auto_conf': round(auto_res['confidence'], 4),
                'manual_status': man_res['status'],
                'manual_reading': man_res['reading']['displayText'] if man_res['reading'] else None,
                'manual_conf': round(man_res['confidence'], 4),
            }

    return {
        'testFaceplates': {
            'total': len(faceplate_scenes),
            'auto_ready': auto_ready,
            'auto_exact': auto_exact,
            'auto_wrong': auto_wrong,
            'auto_exact_rate': round(auto_exact / max(len(faceplate_scenes), 1), 4),
        },
        'heldOutRealElectric': real_fixtures,
    }


def main() -> None:
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA GPU required for training.")
    device = torch.device('cuda:0')
    log(f"GPU active: {torch.cuda.get_device_name(0)} (CUDA {torch.version.cuda})")
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    t_start = time.monotonic()

    log("=== STEP 1/3: Evaluating BASELINE PaddleOCR End-to-End ===")
    base_e2e = evaluate_end_to_end_pipeline(BASE_DET_DIR, BASE_REC_DIR)
    log(f"Baseline E2E: {json.dumps(base_e2e)}")

    log("=== STEP 2/3: Fine-tuning PP-OCRv6_small_rec on RTX 4070 ===")
    rec_base, rec_ft, rec_sha = train_rec_model(device)

    log("=== STEP 3/3: Fine-tuning PP-OCRv6_small_det on RTX 4070 ===")
    det_base, det_ft, det_sha = train_det_model(device)

    log("=== Evaluating FINE-TUNED PaddleOCR End-to-End via ONNXRuntime CPU ===")
    ft_e2e = evaluate_end_to_end_pipeline(OUT_DET_DIR, OUT_REC_DIR)
    log(f"Fine-tuned E2E: {json.dumps(ft_e2e)}")

    report = {
        'createdAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'gpu': torch.cuda.get_device_name(0),
        'totalSeconds': round(time.monotonic() - t_start, 1),
        'goldValRate': load_gold_val_score(),
        'det': {'base': det_base, 'fineTuned': det_ft, 'sha256': det_sha, 'dir': OUT_DET_DIR.relative_to(ROOT).as_posix()},
        'rec': {'base': rec_base, 'fineTuned': rec_ft, 'sha256': rec_sha, 'dir': OUT_REC_DIR.relative_to(ROOT).as_posix()},
        'endToEnd': {'baseline': base_e2e, 'fineTuned': ft_e2e},
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    log(f"Saved electric training report to {REPORT_PATH}")


if __name__ == '__main__':
    main()
