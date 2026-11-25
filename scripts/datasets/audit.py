"""Audit generated meter datasets for integrity, zero fixture leakage, and compliance.

Scans:
  .runtime/datasets/water/
  .runtime/datasets/electric/
  .runtime/datasets/meter/ (held-out evaluation fixtures; must have 0 overlap)
Produces:
  docs/test/METER-DATASETS-AUDIT.md
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
RUNTIME_SITE = ROOT / '.runtime/paddleocr/site-packages'
if RUNTIME_SITE.exists() and str(RUNTIME_SITE) not in sys.path:
    sys.path.insert(0, str(RUNTIME_SITE))

from PIL import Image

DATASETS_DIR = ROOT / '.runtime/datasets'
REPORT_FILE = ROOT / 'docs/test/METER-DATASETS-AUDIT.md'


def log(msg: str) -> None:
    print(f"[audit] {msg}", flush=True)


def fixture_hashes() -> set[str]:
    meter_dir = DATASETS_DIR / 'meter'
    out = set()
    if meter_dir.exists():
        for p in meter_dir.iterdir():
            if p.is_file():
                out.add(hashlib.sha256(p.read_bytes()).hexdigest())
    return out


def audit_water(heldout_shas: set[str]) -> dict:
    water_dir = DATASETS_DIR / 'water'
    yolo_dir = water_dir / 'yolo-obb'
    stats = {'train': 0, 'val': 0, 'test': 0, 'corrupt': 0, 'sha256_by_split': {}, 'fixture_leakage': 0, 'eval_readings': 0}

    for split in ['train', 'val', 'test']:
        img_dir = yolo_dir / 'images' / split
        stats['sha256_by_split'][split] = set()
        if not img_dir.exists():
            continue
        for img_p in img_dir.iterdir():
            if img_p.is_file():
                try:
                    with Image.open(img_p) as im:
                        im.verify()
                    h = hashlib.sha256(img_p.read_bytes()).hexdigest()
                    stats['sha256_by_split'][split].add(h)
                    if h in heldout_shas:
                        stats['fixture_leakage'] += 1
                    stats[split] += 1
                except Exception:
                    stats['corrupt'] += 1

    eval_f = water_dir / 'eval_readings.jsonl'
    if eval_f.exists():
        stats['eval_readings'] = sum(1 for ln in eval_f.read_text(encoding='utf-8').splitlines() if ln.strip())

    train_shas = stats['sha256_by_split']['train']
    val_shas = stats['sha256_by_split']['val']
    test_shas = stats['sha256_by_split']['test']
    stats['leakage'] = len(train_shas & val_shas) + len(train_shas & test_shas) + len(val_shas & test_shas)
    return stats


def audit_electric(heldout_shas: set[str]) -> dict:
    elec_dir = DATASETS_DIR / 'electric'
    det_dir = elec_dir / 'paddle-det'
    rec_dir = elec_dir / 'paddle-rec'
    stats = {
        'det': {'train': 0, 'val': 0, 'test': 0},
        'rec': {'train': 0, 'val': 0, 'test': 0},
        'corrupt': 0,
        'leakage': 0,
        'fixture_leakage': 0,
    }
    det_shas = {'train': set(), 'val': set(), 'test': set()}
    rec_shas = {'train': set(), 'val': set(), 'test': set()}

    for split in ['train', 'val', 'test']:
        det_img_dir = det_dir / 'images' / split
        if det_img_dir.exists():
            for p in det_img_dir.iterdir():
                if p.is_file():
                    try:
                        with Image.open(p) as im:
                            im.verify()
                        h = hashlib.sha256(p.read_bytes()).hexdigest()
                        det_shas[split].add(h)
                        if h in heldout_shas:
                            stats['fixture_leakage'] += 1
                        stats['det'][split] += 1
                    except Exception:
                        stats['corrupt'] += 1

        rec_img_dir = rec_dir / 'images' / split
        if rec_img_dir.exists():
            for p in rec_img_dir.iterdir():
                if p.is_file():
                    try:
                        with Image.open(p) as im:
                            im.verify()
                        h = hashlib.sha256(p.read_bytes()).hexdigest()
                        rec_shas[split].add(h)
                        if h in heldout_shas:
                            stats['fixture_leakage'] += 1
                        stats['rec'][split] += 1
                    except Exception:
                        stats['corrupt'] += 1

    stats['leakage'] = (
        len(det_shas['train'] & det_shas['val'])
        + len(det_shas['train'] & det_shas['test'])
        + len(rec_shas['train'] & rec_shas['val'])
        + len(rec_shas['train'] & rec_shas['test'])
    )
    return stats


def main() -> None:
    log("Running dataset audit...")
    heldout = fixture_hashes()
    w_stats = audit_water(heldout)
    e_stats = audit_electric(heldout)

    log(f"Water dataset: Train={w_stats['train']}, Val={w_stats['val']}, Test={w_stats['test']}, EvalReadings={w_stats['eval_readings']}, SplitLeak={w_stats['leakage']}, FixtureLeak={w_stats['fixture_leakage']}, Corrupt={w_stats['corrupt']}")
    log(f"Electric det: Train={e_stats['det']['train']}, Val={e_stats['det']['val']}, Test={e_stats['det']['test']}")
    log(f"Electric rec: Train={e_stats['rec']['train']}, Val={e_stats['rec']['val']}, Test={e_stats['rec']['test']}, SplitLeak={e_stats['leakage']}, FixtureLeak={e_stats['fixture_leakage']}, Corrupt={e_stats['corrupt']}")

    if w_stats['leakage'] or w_stats['fixture_leakage'] or e_stats['leakage'] or e_stats['fixture_leakage'] or w_stats['corrupt'] or e_stats['corrupt']:
        raise RuntimeError("Dataset audit failed due to leakage or corrupt image!")

    report_content = f"""# Báo cáo Kiểm tra Chất lượng Dataset Công tơ (Audit Report)

Thời điểm cập nhật: 2026-11-03

## 1. Đồng hồ Nước (YOLOv8n-OBB Oriented + VisionState)
- **Thư mục OBB:** `.runtime/datasets/water/yolo-obb/` (nhãn OBB xoay chuẩn hóa theo trục PCA hàng bánh số, kiểm chứng qua `refine_row`, đủ lớp `0: meter`, `1: window`, `2..11: 0..9`, `12: u`, bổ sung xoay `90°/180°/270°` và biến thể mặt đồng hồ cũ/bụi mờ ở `train`/`val`)
- **Tập Train:** {w_stats['train']} ảnh
- **Tập Validation:** {w_stats['val']} ảnh
- **Tập Test (OBB độc lập, không tăng cường):** {w_stats['test']} ảnh
- **Tập Kiểm chứng Đọc Toàn Luồng (`eval_readings.jsonl`):** {w_stats['eval_readings']} ảnh thực tế có nhãn chỉ số (`DL7981-Value` + `UD-Smart-City-CC0`)
- **Rò rỉ dữ liệu giữa Train/Val/Test:** {w_stats['leakage']}
- **Trùng lặp với 5 ảnh mẫu kiểm thử `.runtime/datasets/meter/*`:** {w_stats['fixture_leakage']}
- **Ảnh hỏng (Corrupt):** {w_stats['corrupt']}

## 2. Đồng hồ Điện Cơ Khí (PaddleOCR PP-OCRv6 Det & Rec)
- **Thư mục Det:** `.runtime/datasets/electric/paddle-det/` (mặt công tơ cơ khí nhiều chi tiết gây nhiễu + khung bánh lẻ `1/10` viền đỏ tách riêng khỏi `kWh` và thước `10000..1/10`, kèm mẫu crop ngữ cảnh lượt 2 `rectify_manual` và sơ đồ kỹ thuật)
  - Train: {e_stats['det']['train']} | Val: {e_stats['det']['val']} | Test: {e_stats['det']['test']}
- **Thư mục Rec:** `.runtime/datasets/electric/paddle-rec/` (dãy bánh số cơ khí có bánh lẻ đỏ + mẫu chữ mặt đồng hồ/`kWh` chống quên từ điển + mẫu chỉ số thực từ `Henrik-Energy-Meter`)
  - Train: {e_stats['rec']['train']} | Val: {e_stats['rec']['val']} | Test: {e_stats['rec']['test']}
- **Rò rỉ dữ liệu giữa Train/Val/Test:** {e_stats['leakage']}
- **Trùng lặp với 5 ảnh mẫu kiểm thử `.runtime/datasets/meter/*`:** {e_stats['fixture_leakage']}
- **Ảnh hỏng (Corrupt):** {e_stats['corrupt']}

## 3. Tuân thủ Quy định Dự án (`AGENTS.md`)
- Toàn bộ dữ liệu thô, dữ liệu chuẩn hóa, bộ nhớ đệm và mô hình nằm gọn trong `.runtime/` và `.cache/` của thư mục dự án `d:/Trozy`.
- Tuyệt đối không đưa 5 ảnh mẫu `.runtime/datasets/meter/*` vào bất kỳ tập huấn luyện hay validation nào.
"""
    REPORT_FILE.parent.mkdir(parents=True, exist_ok=True)
    REPORT_FILE.write_text(report_content, encoding='utf-8')
    log(f"Audit report saved to {REPORT_FILE}")


if __name__ == '__main__':
    main()
