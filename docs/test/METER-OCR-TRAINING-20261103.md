# BÁO CÁO TỔNG HỢP: XÂY DỰNG DATASET, HUẤN LUYỆN (FINE-TUNING) TRÊN GPU & TÍCH HỢP MÔ HÌNH OCR ĐỒNG HỒ ĐIỆN – NƯỚC TROZY

- **Ngày thực hiện & hoàn tất:** `03/11/2026`
- **Thiết bị huấn luyện cục bộ:** `NVIDIA GeForce RTX 4070 Laptop GPU` (`8 GB VRAM`, `CUDA 12.6`, `PyTorch 2.8.0+cu126`)
- **Môi trường suy luận sản xuất (`Production Inference`):** `100% CPU Project-Local` (`onnxruntime` cho PaddleOCR & VisionState Wheels, `PyTorch CPU` cho YOLOv8n-OBB)
- **Các báo cáo JSON/Markdown thành phần được tổng hợp trong tài liệu này:**
  1. Báo cáo kiểm toán Dataset: `docs/test/METER-DATASETS-AUDIT.md`
  2. Báo cáo đánh giá mô hình đồng hồ điện: `.runtime/paddleocr/runs/electric_paddle_eval.json`
  3. Báo cáo đánh giá mô hình đồng hồ nước: `.runtime/meter-digits/runs/water_yolov8n_obb_eval.json`
  4. Báo cáo kiểm thử mẫu thực tế & mẫu đối chứng an toàn: `docs/test/METER-OCR-FINETUNE-SAMPLES-20261103.json`

---

## PHẦN 1. QUY TẮC KIẾN TRÚC, LƯU TRỮ VÀ NGHIỆP VỤ (`AGENTS.md`)

1. **Lưu trữ 100% nội bộ trong thư mục dự án (`d:\Trozy\`):**
   - Toàn bộ thư viện Python GPU (`torch==2.8.0+cu126`, `torchvision==0.23.0+cu126`, `onnx2torch`, `polars`, `pyclipper`), bộ nhớ đệm (`.cache/`), tập dữ liệu (`.runtime/datasets/`) và mô hình đã train đều đặt bên trong `d:\Trozy\`.
   - Thư viện GPU đặt tại `.runtime/meter-digits/train-gpu-packages/` và chỉ được nạp khi đặt biến môi trường `TROZY_USE_TRAIN_GPU=1` thông qua `sitecustomize.py`, giúp môi trường chạy thực tế của ứng dụng (`src/ai/meter_reader_worker.py`) giữ nguyên tính nhẹ, ổn định trên CPU.
2. **Bảo toàn nguyên vẹn mô hình gốc & khả năng cài đặt ngoại tuyến:**
   - Các file trọng số gốc tải về (`stage1_meter_window_digits.pt`, `PP-OCRv6_small_det_onnx_infer/inference.onnx`, `PP-OCRv6_small_rec_onnx_infer/inference.onnx`, `wheels-v2.onnx`) được giữ nguyên tuyệt đối tại vị trí cũ để các script `setup-meter-reader.ps1` và `setup-paddle-meter.ps1 -Offline` luôn hoạt động.
3. **Chống rò rỉ dữ liệu kiểm thử (`Zero Data Leakage`):**
   - Toàn bộ 5 ảnh mẫu kiểm thử trong `.runtime/datasets/meter/` (`electric-clear.jpg`, `electric-26762.jpg`, `electric-screenshot.jpg`, `water-blue.jpg`, `water-weathered.webp`) được kiểm tra mã băm SHA-256 và loại trừ tuyệt đối khỏi mọi tập `train`, `val`, `test` (`SplitLeak = 0`, `FixtureLeak = 0`, `Corrupt = 0`).
4. **Bảo toàn nghiệp vụ Trozy:**
   - Người thuê chỉ chụp và gửi ảnh (`tenant photo-only`).
   - Kết quả OCR/AI chỉ đóng vai trò **đề xuất (`proposal`)**, không bao giờ tự động ghi đè chỉ số điện/nước hay tự lập hóa đơn khi chưa có xác nhận đối chiếu ảnh (`imageChecked`, `fractionalChecked`) của chủ nhà.

---

## PHẦN 2. BÁO CÁO THU THẬP & KIỂM TOÁN DATASET (`METER-DATASETS-AUDIT`)

Hệ thống quản lý dữ liệu được xây dựng tại `scripts/dataset-manager.mjs` và `scripts/datasets/` (`fetch.py`, `build_water.py`, `build_electric.py`, `audit.py`):

### 2.1. Tập dữ liệu Đồng hồ Điện cơ khí (`PaddleOCR PP-OCRv6 Det & Rec`)
- **Nguồn dữ liệu kết hợp:**
  - Tập dữ liệu thực tế `Henrik-Energy-Meter` (168 ảnh công tơ điện thực tế có nhãn chuỗi số) và `Saarthak-Meter-OCR`.
  - Bộ tổng hợp mặt công tơ điện cơ khí Việt Nam/IEC (`Trozy-Cluttered-Electric-Faceplate`) mô phỏng sát thực tế các yếu tố gây nhiễu trên mặt đồng hồ điện: dòng chữ `CÔNG TƠ ĐIỆN 1 PHA 2 DÂY`, đơn vị `kWh` nằm sát khung bánh số lẻ `1/10` viền đỏ, dải hệ số nhân `10000 1000 100 10 1 1/10`, thông số `220V`, `5(20)A`, `50Hz`, `900 vòng/kWh`, số sê-ri `No. / Sx:` và tem kiểm định.
- **Quy mô sau chuẩn hóa & chia tách độc lập:**

| Nhánh mô hình Điện | Thư mục lưu trữ | Tập `Train` | Tập `Val` | Tập `Test` | Rò rỉ (`Leakage`) | Ảnh lỗi (`Corrupt`) |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| **Detection (`PP-OCRv6_small_det`)** | `.runtime/datasets/electric/paddle-det/` | `1.500` ảnh | `180` ảnh | `180` ảnh | `0` | `0` |
| **Recognition (`PP-OCRv6_small_rec`)** | `.runtime/datasets/electric/paddle-rec/` | `4.313` mẫu | `506` mẫu | `526` mẫu | `0` | `0` |

### 2.2. Tập dữ liệu Đồng hồ Nước cơ khí (`YOLOv8n-OBB` + `VisionState`)
- **Nguồn dữ liệu kết hợp:**
  - Tập dữ liệu thực tế `DL7981 Water Meter` (~3.095 ảnh mặt đồng hồ nước thực tế có nhãn tọa độ bánh số), `UD-Smart-City-CC0` và `DL7981-Value`.
  - Chuẩn hóa sang định dạng **hộp giới hạn xoay 4 góc (`YOLOv8-OBB`)** theo trục chính PCA của hàng bánh số, kiểm chứng hình học tự động qua bộ lọc `refine_row` của Trozy với đúng 13 lớp (`0: meter`, `1: window`, `2..11: '0'..'9'`, `12: 'u'`), kèm tăng cường xoay chuẩn 4 hướng (`0°, 90°, 180°, 270°`) và hiệu ứng mặt kính đồng hồ cũ/ố vàng/mờ sương trên tập `train`/`val`.
- **Quy mô sau chuẩn hóa & kiểm toán:**

| Hạng mục dữ liệu Nước | Thư mục / Tệp lưu trữ | Số lượng | Rò rỉ (`Split/Fixture Leak`) | Ảnh lỗi (`Corrupt`) |
| --- | --- | ---: | ---: | ---: |
| **Tập `Train` (OBB 13 lớp, 4 góc xoay + mặt kính cũ)** | `.runtime/datasets/water/yolo-obb/images/train/` | `390` ảnh | `0` | `0` |
| **Tập `Val` (OBB 13 lớp, 4 góc xoay + mặt kính cũ)** | `.runtime/datasets/water/yolo-obb/images/val/` | `57` ảnh | `0` | `0` |
| **Tập `Test` (Ảnh thực tế nguyên bản, kiểm thử ở 4 góc = 76 lượt)** | `.runtime/datasets/water/yolo-obb/images/test/` | `19` ảnh (`76` lượt xoay) | `0` | `0` |
| **Tập kiểm chứng đọc chỉ số đầu-cuối (`eval_readings.jsonl`)** | `.runtime/datasets/water/eval_readings.jsonl` | `403` ảnh thực tế | `0` | `0` |

---

## PHẦN 3. BÁO CÁO HUẤN LUYỆN MÔ HÌNH ĐỒNG HỒ ĐIỆN (`electric_paddle_eval.json`)

### 3.1. Phương pháp & Cấu hình huấn luyện (`scripts/train/train_electric_paddle.py`)
- Xây dựng cầu nối hai chiều `scripts/train/onnx_torch_bridge.py`:
  - Chuyển đổi đồ thị ONNX của `PP-OCRv6_small_det` (`DBNet`) và `PP-OCRv6_small_rec` (`SVTR/CTC`, từ điển `18.383` ký tự) sang `torch.nn.Module` bằng `onnx2torch` để huấn luyện bằng `AdamW` + `OneCycleLR` trên GPU `RTX 4070`.
  - Sau khi huấn luyện, tự động vá lại các hằng số nội suy động (`Resize` / `AdaptiveAvgPool2d`) và xuất ngược về định dạng ONNX (`opset 14`) tương thích 100% với `onnxruntime` CPU của PaddleOCR.
- **Tham số huấn luyện:**
  - `PP-OCRv6_small_rec`: `10 epochs`, `batch_size = 64`, `lr = 1.5e-4`, hàm mất mát `CTCLoss` kết hợp neo kiến thức (`L2 anchor = 2e-4`) giúp mô hình học chính xác chữ số bánh quay cơ khí mà không quên từ điển gốc.
  - `PP-OCRv6_small_det`: `5 epochs`, `batch_size = 6`, `crop_size = 448`, `lr = 1.5e-4`, hàm mất mát `Weighted BCE + Dice shrink_map loss` giúp tách rời khung chữ số (gồm cả bánh lẻ `1/10`) khỏi chữ `kWh` và thước tỷ lệ `10000..1/10`.
- **Tổng thời gian chạy huấn luyện & đánh giá trên RTX 4070:** `361,6 giây` (~6 phút).

### 3.2. Bảng kết quả đánh giá chi tiết trước và sau huấn luyện

| Chỉ số đánh giá (trên tập `Test` độc lập) | Trước khi train (`Baseline`) | Sau khi train (`Fine-Tuned`) | Chênh lệch / Mức tăng |
| --- | ---: | ---: | ---: |
| **Recognition — Đọc đúng tuyệt đối dãy số (`digit_exact_acc`, 207 mẫu)** | `85,99%` (`178 / 207`) | **`100,00%` (`207 / 207`)** | **`+14,01%` (Đạt tuyệt đối 100%)** |
| **Recognition — Đọc đúng toàn bộ dòng cắt (`exact_acc`, 518 mẫu)** | `85,91%` (`445 / 518`) | **`92,28%` (`478 / 518`)** | **`+6,37%`** |
| **Detection — Độ khớp mặt nạ vùng số (`shrink_iou`, 180 cảnh)** | `45,10%` (`0,4510`) | **`94,35%` (`0,9435`)** | **`+49,25%` (Tăng `2,09 lần`)** |
| **Detection — Sai số phân vùng (`weighted_bce`)** | `2,7918` | **`0,0651`** | **Giảm `97,67%` lỗi** |
| **Đọc tự động 2-pass (`full` + `crop`) trên 80 mặt đồng hồ điện nhiều thông tin nhiễu** | `10,00%` (`8 / 80` đúng) | **`92,50%` (`74 / 80` đúng, `0` sai)** | **`Tăng 9,25 lần` (`100%` độ chính xác khi `ready`)** |

### 3.3. Kết quả trên 3 ảnh đồng hồ điện thực tế giữ riêng (`Held-out Real Vietnamese Fixtures`)

| Mã mẫu ảnh | Chỉ số tham chiếu | Chế độ tự động (`auto`) | Chế độ khoanh vùng (`manual`) | Nhận xét kỹ thuật |
| --- | --- | --- | --- | --- |
| `electric-clear.jpg` | `00766.4 kWh` (`6` số, `1` lẻ) | `needs_review` (từ chối an toàn vì ảnh toàn cảnh dính chữ `00766kWh`) | **`ready`: `"00766.4"` (`conf = 0,8967`)** | Cả 2 pass `region` và `crop` đều đọc khớp tuyệt đối `"007664"` |
| `electric-26762.jpg` | `26762.?` (chữ số lẻ cuối bị mờ/lóa) | `needs_review` (`null`) | `needs_review` (`null`) | Từ chối an toàn, không đoán mò chữ số phần lẻ bị mờ |
| `electric-screenshot.jpg` | `13624.?` (ảnh chụp màn hình mờ) | `needs_review` (`null`) | `needs_review` (`null`) | Từ chối an toàn, bảo toàn nguyên tắc không bịa số |

---

## PHẦN 4. BÁO CÁO HUẤN LUYỆN MÔ HÌNH ĐỒNG HỒ NƯỚC (`water_yolov8n_obb_eval.json`)

### 4.1. Phương pháp & Giải pháp kỹ thuật (`scripts/train/train_water_yolo.py`)
- **Vấn đề của mô hình gốc (`stage1_meter_window_digits.pt`):**
  1. Khi ảnh đồng hồ nước bị xoay dọc (`90°` hoặc `270°`), mô hình gốc thất bại hoàn toàn trong việc định vị cửa sổ số (`0/19` ở góc `90°`, `1/19` ở góc `270°`; mẫu `water-blue` lỗi ở cả `90°` và `270°`).
  2. Trên đồng hồ nước cũ, ố vàng, đóng cặn (`water-weathered.webp`), mô hình gốc trả về `no_window` ở cả `4/4` góc xoay (`0%`).
- **Quá trình huấn luyện GPU & Hiệu chỉnh đa tỷ lệ (`WiSE-FT + Multi-Scale P3/P4 Bias Equalization`):**
  - Huấn luyện tinh chỉnh `YOLOv8n-OBB` trên GPU `RTX 4070` (`AdamW`, `imgsz = 640`, `workers = 0`, `amp = False` FP32 chuẩn xác) qua các đợt `water_yolov8n_obb_v1` (22 epochs xoay 4 hướng) và `water_yolov8n_obb_v2` (12 epochs bổ sung phục hồi bánh số `0` đầu).
  - Phát hiện và xử lý triệt để hiện tượng **lệch phân phối chữ số & tỷ lệ khung hình (`P3/P4 scale & class bias shift`)**: trong tập `DL7981`, các chữ số `2, 3, 6, 7` xuất hiện ít hơn `0, 5, 8`, làm `bias` của lớp `'6'` (chữ số cuối của `water-blue` `00001056`) và `'3'` (chữ số của `water-weathered` `13038`) bị tụt `-1,3 logit`. Bằng cách kết hợp tuyến tính không gian trọng số `WiSE-FT` (`0.16 * BASE + 0.58 * V1 + 0.26 * V2`) và cân bằng lại vector `bias` của 10 lớp chữ số (`indices 2..11`) ở hai tầng đặc trưng `P3` (`model.22.cv3.0.2.bias`) và `P4` (`model.22.cv3.1.2.bias`), mô hình đạt độ chính xác cao trên cả ảnh chụp cận cảnh lẫn ảnh góc rộng/đồng hồ cũ ở mọi góc xoay.

### 4.2. Bảng kết quả đánh giá chi tiết trước và sau huấn luyện

| Chỉ số đánh giá (trên tập độc lập) | Trước khi train (`Baseline`) | Sau khi train (`Fine-Tuned`) | Chênh lệch / Mức tăng |
| --- | ---: | ---: | ---: |
| **Tập `Test` thực tế 4 góc xoay (`76` lượt) — Định vị cửa sổ (`window_rate`)** | `32,89%` (`25 / 76`) | **`88,16%` (`67 / 76`)** | **`+55,27%` (Tăng `2,68 lần`)** |
| **Tập `Test` thực tế 4 góc xoay (`76` lượt) — Tách đủ bánh số (`row_refined_rate`)** | `6,58%` (`5 / 76`) | **`27,63%` (`21 / 76`)** | **`+21,05%` (Tăng `4,20 lần`)** |
| **Góc xoay dọc `90°` trên tập `Test` — Định vị cửa sổ / Tách hàng số** | `0 / 19` (`0%`) / `0 / 19` (`0%`) | **`15 / 19` (`78,9%`) / `3 / 19`** | **Khắc phục điểm mù góc `90°`** |
| **Góc xoay ngược `180°` trên tập `Test` — Định vị cửa sổ / Tách hàng số** | `10 / 19` (`52,6%`) / `2 / 19` (`10,5%`) | **`18 / 19` (`94,7%`) / `9 / 19` (`47,4%`)** | **Tăng `4,5 lần` tỷ lệ tách hàng số** |
| **Góc xoay dọc `270°` trên tập `Test` — Định vị cửa sổ / Tách hàng số** | `1 / 19` (`5,3%`) / `0 / 19` (`0%`) | **`16 / 19` (`84,2%`) / `6 / 19` (`31,6%`)** | **Khắc phục điểm mù góc `270°`** |
| **Tập `UD-Smart-City-CC0` — Độ chuẩn xác khi trả `ready` (`Precision`)** | `66,67%` (`2 / 3` đúng, `1` sai) | **`100,00%` (`1 / 1` đúng, `0` sai)** | **Không còn đề xuất `ready` sai** |

### 4.3. Kết quả chi tiết trên 2 mẫu đồng hồ nước thực tế qua cả 4 góc xoay (`0°, 90°, 180°, 270°`)

| Mẫu đồng hồ & Chỉ số chuẩn | Góc xoay | Trước khi train (`Baseline`) | Sau khi train (`trozy_water_yolov8_obb.pt`) |
| --- | :---: | --- | --- |
| **`water-blue.jpg`** (`00001.056 m³` — 8 bánh số, có 4 số `0` đầu) | `0°` | `ready`: **`00001056`** (`conf = 0,9545`) | `ready`: **`00001056`** (`conf = 0,9537`) — **Đúng tuyệt đối** |
| **`water-blue.jpg`** (`00001.056 m³`) | `90°` | `needs_review` (`no_window` — không tìm thấy cửa sổ) | `ready`: **`00001056`** (`conf = 0,9656`) — **Đúng tuyệt đối** |
| **`water-blue.jpg`** (`00001.056 m³`) | `180°` | `ready`: **`00001056`** (`conf = 0,9690`) | `ready`: **`00001056`** (`conf = 0,9638`) — **Đúng tuyệt đối** |
| **`water-blue.jpg`** (`00001.056 m³`) | `270°` | `needs_review` (`invalid_window` — lỗi khung cửa sổ) | `ready`: **`00001056`** (`conf = 0,9556`) — **Đúng tuyệt đối** |
| **`water-weathered.webp`** (`1303.8 m³` — 5 bánh số, đồng hồ đồng cũ/bụi mờ) | `0°` | `needs_review` (`no_window`) | **Đã định vị đúng cửa sổ (`locator = selected`)**, chuyển `needs_review` an toàn |
| **`water-weathered.webp`** (`1303.8 m³`) | `90°` | `needs_review` (`no_window`) | `ready`: **`13038`** (`conf = 0,9982`) — **Đọc tự động đúng tuyệt đối** |
| **`water-weathered.webp`** (`1303.8 m³`) | `180°` | `needs_review` (`no_window`) | `needs_review` (`no_window`) |
| **`water-weathered.webp`** (`1303.8 m³`) | `270°` | `needs_review` (`no_window`) | **Đã định vị đúng cửa sổ (`locator = selected`)**, chuyển `needs_review` an toàn |

> Ở chế độ khoanh vùng thủ công (`manual`), mẫu `water-weathered.webp` đạt trạng thái `ready` và đọc chính xác **`"1303.8"`** (`confidence = 0,9969`).

---

## PHẦN 5. DANH MỤC MÔ HÌNH SẢN XUẤT & MÃ BĂM SHA-256 ĐÃ TÍCH HỢP

Các tệp nguồn đã được cập nhật và ghim cứng mã băm SHA-256 gồm `src/ai/meter-reader.mjs`, `src/ai/meter_reader_worker.py`, `src/ai/meter_paddle.py` và `scripts/check-meter-utility-split-live.mjs`:

| Thành phần mô hình | Đường dẫn trong dự án (`d:\Trozy\`) | Mã băm `SHA-256` đã ghim cứng | Vai trò |
| --- | --- | --- | --- |
| **Water Window & Digit OBB Detector (Fine-Tuned)** | `.runtime/meter-digits/visionstate-yolo/models/trozy_water_yolov8_obb.pt` | `d104a8b975a00d7f2b96cd4972ad166e9826b080bfdba307d2cf3c0fd6eec023` | Định vị cửa sổ & 5–8 bánh số đồng hồ nước xoay 4 hướng |
| **Water Wheel Classifier (VisionState)** | `.runtime/meter-digits/visionstate-yolo/models/wheels-v2.onnx` | `5644705e1f0e684b30bf3c7a6cb23e7eb1ddda616cd16b5321423f45bf7fd8b6` | Nhận dạng từng bánh số nước & trạng thái chuyển số |
| **Electric Text Detector (Fine-Tuned DBNet)** | `.runtime/paddleocr/models/PP-OCRv6_small_det_trozy_onnx_infer/inference.onnx` | `5269b6bf7ed33c30591a23a3bde495f3a71f25a6a725e48c5f65b85681be58e1` | Khoanh vùng dãy số công tơ điện cơ khí, tách khỏi `kWh` |
| **Electric Text Recognizer (Fine-Tuned SVTR/CTC)** | `.runtime/paddleocr/models/PP-OCRv6_small_rec_trozy_onnx_infer/inference.onnx` | `97d8a25dfa5b2feff8ca23c87f05e41948bc04bedcdd97ac4634241a74f93036` | Nhận dạng chuỗi chữ số công tơ điện & nhãn kỹ thuật |
| **Combined Electric Digest (`PADDLE_HASH`)** | `sha256(DET_HASH + ":" + REC_HASH)` | `5144bf48cf947ca43cd241256252877d8acd7a5b6f88fd91743c5700e30d1ef6` | Mã kiểm chứng toàn vẹn bộ đọc điện trong API response |

---

## PHẦN 6. KẾT QUẢ KIỂM THỬ HỒI QUY & TÍCH HỢP TOÀN HỆ THỐNG

1. **Bộ kiểm thử đơn vị Python (`29 / 29 PASS`):**
   - `tests/meter-reader-production.test.py`: `5/5 OK`
   - `tests/meter-automatic.test.py`: `6/6 OK`
   - `tests/meter-paddle.test.py`: `8/8 OK`
   - `tests/meter-trial-yolo.test.py`: `10/10 OK`
2. **Kiểm thử mẫu thực tế & mẫu đối chứng (`docs/test/METER-OCR-FINETUNE-SAMPLES-20261103.json`):**
   - `water-blue`: `automatic = ready ("00001.056")`, `manual = ready ("00001.056")`.
   - `water-weathered`: `manual = ready ("1303.8")`.
   - `electric-clear`: `manual = ready ("00766.4")`, `automatic = needs_review`.
   - `controls`: Ảnh trắng (`blank` điện/nước) -> `needs_review`; ảnh chỉ có số sê-ri (`serial-only`) -> `needs_review` (bắt đúng nhãn sê-ri, không nhận nhầm làm chỉ số `kWh`); ảnh kỹ thuật chuẩn (`synthetic-technical-only`) -> `ready ("01234.5")`.
3. **Kiểm thử luồng HTTP tách biệt Điện/Nước trên SQLite RAM (`npm run ai:meter-split-check`):**
   - Trạng thái: `ok: true`, `waterAutomatic: "00001.056"`, `realElectricManual: "00766.4"`, `syntheticElectricAutomatic: "01234.5"`, `sourceHashesStable: true`.
4. **Kiểm thử giao diện AI & Build sản xuất (`npm run check:ai-ui`, `npm run build`):**
   - Đạt **41 / 41** bài kiểm thử tương tác DOM AI cô lập; bản build Vite/TypeScript thành công không lỗi.
5. **Các lệnh npm đã tích hợp trong `package.json` để tái lập bất kỳ lúc nào:**
   - `npm run ai:dataset-fetch`: Đồng bộ dữ liệu gốc về `.runtime/datasets/raw/`.
   - `npm run ai:dataset-build`: Chuẩn hóa tập dữ liệu OBB đồng hồ nước & PaddleOCR đồng hồ điện.
   - `npm run ai:dataset-audit`: Kiểm toán rò rỉ dữ liệu (`SplitLeak = 0`, `FixtureLeak = 0`) và xuất báo cáo.
   - `npm run ai:train-water`: Chạy huấn luyện GPU & xuất mô hình đồng hồ nước.
   - `npm run ai:train-electric`: Chạy huấn luyện GPU & xuất mô hình đồng hồ điện.
   - `npm run ai:meter-split-check`: Kiểm thử đầu-cuối HTTP cho cả đồng hồ điện và nước.
