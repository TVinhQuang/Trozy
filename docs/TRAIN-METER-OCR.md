# Tự chạy train OCR điện và nước trong Trozy

Đối chiếu mã nguồn và môi trường ngày **08/11/2026**. Hướng dẫn này chưa chạy huấn luyện, chưa thay model đang dùng. Các đoạn lệnh bên dưới dành cho PowerShell tại `D:\Trozy`.

## 1. Hiểu đúng hai bộ hiện có

```text
Điện: ảnh → Paddle DET tìm dòng số → Paddle REC đọc chuỗi → kiểm bằng chứng → đề xuất
Nước: ảnh → YOLO OBB tìm cửa sổ/ô → VisionState đọc bánh → giải mã truyền số → đề xuất
```

| Thành phần | Nó học việc gì? | Trong dự án đang train được chưa? |
| --- | --- | --- |
| Paddle DET | Tách vùng chữ/hàng số khỏi kWh, tem và thông số | Có, 5 epoch |
| Paddle REC | Chuyển ảnh cắt của một hàng thành chuỗi, ví dụ `007664` | Có, 10 epoch, nhưng lệnh mặc định bỏ qua nếu đã có REC fine-tune |
| YOLOv8n-OBB | Tìm công tơ, cửa sổ và ô số có góc xoay | Có, recipe hiện tại là v3, 10 epoch |
| VisionState `wheels-v2.onnx` | Nhận trạng thái bánh đang quay, giải mã liên hệ giữa các bánh | Đang dùng trọng số tải sẵn; **chưa có script fine-tune trong dự án** |

Vì vậy, “train nước” hiện chỉ là train **bộ tìm vùng YOLO**, không phải train lại toàn bộ bộ đọc nước. Nhãn chữ số YOLO được dùng khi huấn luyện detector, nhưng production dùng hình học của nó rồi để VisionState đọc số.

Cả hai trainer là **fine-tune từ model gốc**, không phải train từ đầu. Lệnh mặc định cũng không tiếp tục từ model production hiện tại hoặc tự resume `last.pt`.

Model đang dùng trong app được tách theo loại tại `.runtime/paddleocr/models/electric/` và `.runtime/meter-digits/visionstate-yolo/models/water/`. Mở [MODELS-OCR](../MODELS-OCR/README.md) để xem danh mục, đường dẫn tương đối và SHA-256. Model gốc và các run/checkpoint vẫn ở vị trí cũ; các ví dụ lưu lượt thử riêng bên dưới giữ nguyên đường dẫn.

## 2. Máy hiện có gì, cần cài thêm không?

Đã kiểm tra import thư viện và CUDA, chưa thực hiện forward/backward model:

| Hạng mục | Kết quả trên máy hiện tại |
| --- | --- |
| Portable Python | 3.12.10 |
| GPU CUDA nhận được | NVIDIA GeForce RTX 4070 Laptop GPU, 8 GiB |
| PyTorch / torchvision cho train | 2.8.0+cu126 / 0.23.0+cu126 |
| CUDA do Torch sử dụng | 12.6, `cuda_available=True` |
| ONNX / ONNX Runtime | 1.19.1 / 1.23.2 |
| Import khác | NumPy, OpenCV, Pillow, PyYAML, PyClipper, Polars: thành công |
| Model gốc điện/nước và Wheels | Có |
| Checkpoint nước v1/v2 | Có |

**Không cần chạy lại setup hoặc tải dataset/model để bắt đầu với dữ liệu đã có.** Trainer tự nạp GPU packages riêng; app vẫn dùng runtime CPU. Cả hai script hiện yêu cầu CUDA, chưa hỗ trợ train CPU bằng một tham số.

Muốn tự kiểm CUDA trước khi train:

```powershell
Set-Location D:\Trozy
& .\.runtime\meter-digits\visionstate-yolo\python\python.exe -B -c "import sys; sys.path.insert(0, '.runtime/meter-digits/train-gpu-packages'); import torch; print(torch.__version__); print('CUDA:', torch.cuda.is_available()); print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'No CUDA')"
```

Nếu CUDA không nhận, kiểm driver/môi trường trước; không cài đè runtime CPU. `scripts/setup-gpu-train.ps1` là script chuẩn bị lại GPU packages khi thật sự thiếu, không phải bước bắt buộc mỗi lần train.

## 3. Dữ liệu nào đang được dùng?

| Bộ dữ liệu đã chuẩn hóa | Train | Validation | Test | Đường dẫn |
| --- | ---: | ---: | ---: | --- |
| Nước OBB | 1.290 ảnh | 197 ảnh | 109 ảnh | `.runtime/datasets/water/yolo-obb/` |
| Điện DET | 1.500 ảnh | 180 ảnh | 180 ảnh | `.runtime/datasets/electric/paddle-det/` |
| Điện REC | 4.313 dòng nhãn | 506 dòng nhãn | 526 dòng nhãn | `.runtime/datasets/electric/paddle-rec/` |

Số REC là trước bộ lọc của loader; nhãn thiếu ảnh, ký tự không hỗ trợ hoặc quá dài có thể bị loại. Các số ảnh cũng bao gồm ảnh tổng hợp/tăng cường, không phải từng ấy công tơ thật độc lập.

- **Train:** model cập nhật trọng số từ ảnh và nhãn.
- **Validation:** chọn epoch/checkpoint và cách cấu hình.
- **Test:** đo kết quả cuối; nếu nhìn test để chỉnh liên tục thì tập đó trở thành tập phát triển.
- **Epoch:** một lượt đi qua train set. **Batch:** số mẫu xử lý trong một bước; giảm batch thường giúp khi thiếu VRAM, nhưng thay đổi quá trình học.

Định dạng dữ liệu:

**Nước:** `data.yaml` trỏ tới `images/train`, `images/val`, `images/test`. Mỗi ảnh có file cùng tên trong `labels/…`, mỗi dòng là `class x1 y1 x2 y2 x3 y3 x4 y4`; tọa độ chuẩn hóa 0–1. Có 13 lớp: `meter`, `window`, `0..9`, `u` (không rõ). Không tự đoán hoặc bổ sung nhãn bánh bị khuất.

**Điện REC:** `{train,val,test}_label.txt`, đường dẫn ảnh và chuỗi cách nhau bởi TAB:

```text
images/train/example.jpg<TAB>007664
```

`<TAB>` là ký hiệu minh họa, phải dùng ký tự tab thật. Giữ số 0 đầu. REC đọc chuỗi `007664`; cách diễn giải thành `00766.4` còn cần bố cục/phần lẻ.

**Điện DET:** cùng dạng đường dẫn + TAB, sau đó là JSON các polygon chữ:

```text
images/train/example.jpg<TAB>[{"transcription":"007664","points":[[10,10],[190,10],[190,50],[10,50]]}]
```

Trainer chỉ coi **polygon ở vị trí đầu tiên (index 0)** là bộ đếm khi chính polygon đó chứa chuỗi 4–8 chữ số; nó không tìm polygon số phù hợp ở các vị trí sau. Vì vậy thứ tự nhãn có ý nghĩa. Nhãn vùng kWh/sê-ri phải tách đúng khỏi vùng chỉ số.

**Không chạy `ai:dataset-build` như thao tác nhập ảnh mới.** Builder xóa rồi dựng lại các thư mục ảnh chuẩn hóa và ghi lại nhãn/manifest. Nó có thể làm mất ảnh bạn tự thêm trực tiếp vào những thư mục đó. Dùng dữ liệu hiện có cho lần tìm hiểu đầu tiên.

## 4. Hai lệnh có sẵn thực sự làm gì?

```powershell
npm.cmd run ai:train-electric
npm.cmd run ai:train-water
```

Đây là lệnh thật trong `package.json`, **không phải lệnh thử cô lập**:

| Lệnh | Hành vi hiện tại |
| --- | --- |
| Điện | Đánh giá base → thấy REC fine-tune có sẵn nên tái sử dụng → train DET từ base 5 epoch → xuất đè DET đang dùng → đánh giá và ghi đè report |
| Nước | Đánh giá base → train v3 từ base 10 epoch → trộn trọng số base/v1/v3, sửa bias → chọn ứng viên bằng fixture/một phần test → xuất đè YOLO đang dùng và report |

Model production mới có hash mới nhưng trainer **không cập nhật hash ghim trong app**. Chạy thẳng có thể làm nhánh OCR báo chưa sẵn sàng. Dùng cách lưu riêng ở mục 5/6 để học và thử.

Hai script chưa có CLI `--epochs`, `--batch`, `--resume`, `--output`, `--rec-only`, `--det-only` hoặc `--help`. **Không gọi `--help` để thăm dò:** tham số lạ bị bỏ qua và workflow vẫn có thể chạy train. Nước chỉ nhận riêng `--export-only`, nhưng đó vẫn là đánh giá/trộn/xuất đè; thiếu checkpoint có thể rơi về train mặc định.

## 5. Train điện riêng, lưu thành một lượt thử mới

Đoạn này gọi đúng trainer hiện có, chỉ đổi đường dẫn đầu ra trong tiến trình chạy. Không sửa mã ứng dụng, không ghi model production. Thư mục REC mới chưa có trọng số nên lần này **REC thực sự train 10 epoch**, sau đó DET train 5 epoch. Đây vẫn là fine-tune từ base, chưa phải tiếp tục fine-tune từ model Trozy đã triển khai.

Chạy toàn bộ khối trong PowerShell tại dự án:

```powershell
Set-Location D:\Trozy
$ocrRunPath = Join-Path (Get-Location).Path ('.runtime\paddleocr\runs\manual-electric-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $ocrRunPath | Out-Null
$ocrRunnerPath = Join-Path $ocrRunPath 'run.py'
@'
import os
from pathlib import Path
import sys

root = Path.cwd().resolve()
run = Path(__file__).resolve().parent
sys.path.insert(0, str(root / 'scripts/train'))
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
import train_electric_paddle as trainer

trainer.RUNS_DIR = run
trainer.OUT_REC_DIR = run / 'rec_onnx_infer'
trainer.OUT_DET_DIR = run / 'det_onnx_infer'
trainer.REPORT_PATH = run / 'report.json'
if trainer.OUT_REC_DIR.exists() or trainer.OUT_DET_DIR.exists():
    raise RuntimeError('Use a new run directory; do not reuse this run.')
print('Experiment output:', run, flush=True)
trainer.main()
'@ | Set-Content -Encoding utf8 -LiteralPath $ocrRunnerPath
node scripts/run-project.mjs --python $ocrRunnerPath
```

Trong log cần thấy `Rec Epoch 01/10` và sau đó `Det Epoch 01/5`. Nếu chỉ thấy đánh giá baseline lúc đầu, chưa có nghĩa bị treo: script đánh giá trước khi cập nhật trọng số. Lần chạy mới chưa được đo thời gian, không mặc định sẽ xong trong 6 phút như báo cáo lịch sử.

Đầu ra được giữ để đối chiếu:

```text
.runtime/paddleocr/runs/manual-electric-<id>/
  run.py                    # công thức gọi đã dùng
  rec_onnx_infer/            # inference.onnx + cấu hình/bảng ký tự
  det_onnx_infer/
  report.json
```

Thông số **trong code hiện tại**:

| | REC | DET |
| --- | --- | --- |
| Epoch | 10 | 5 |
| Batch | 32 | 6 |
| Input train | `3×48×320` | crop `448×448` |
| Optimizer/LR | AdamW, `8e-5` | AdamW, `1e-4` |
| Chọn epoch | Điểm đúng chuỗi trên validation | IoU mặt nạ vùng chữ trên validation |

Train điện dùng cầu nối ONNX → phép tính PyTorch → cập nhật trọng số trong graph ONNX gốc; không phải gọi lệnh Paddle-native train. Teacher/model gốc giúp hạn chế quên chữ ngoài chữ số. Không phải mọi file ONNX khác đều thay vào được cầu nối này.

Các giá trị nằm trong `train_rec_model()` và `train_det_model()` của [script điện](../scripts/train/train_electric_paddle.py); muốn đổi epoch/batch cần sửa recipe, chưa có cờ CLI. REC chưa lưu optimizer/epoch checkpoint để resume; ngắt giữa chừng sẽ mất phần train chưa xuất. Hai thông số trong báo cáo 03/11 đã lệch code hiện tại, nên dùng bảng này khi đọc code.

## 6. Train nước riêng, giữ YOLO production nguyên vẹn

Đoạn này giữ công thức hiện tại có trộn checkpoint v1: chép **bản v1** vào thư mục run mới để trainer đọc, rồi train v3 và xuất ứng viên vào run đó. Không thay `wheels-v2.onnx` hay YOLO production.

```powershell
Set-Location D:\Trozy
$ocrRunPath = Join-Path (Get-Location).Path ('.runtime\meter-digits\runs\manual-water-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $ocrRunPath | Out-Null
$ocrRunnerPath = Join-Path $ocrRunPath 'run.py'
@'
import os
from pathlib import Path
import shutil
import sys

root = Path.cwd().resolve()
run = Path(__file__).resolve().parent
sys.path.insert(0, str(root / 'scripts/train'))
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
import train_water_yolo as trainer

source_v1 = root / '.runtime/meter-digits/runs/water_yolov8n_obb_v1/weights/best.pt'
if not source_v1.is_file():
    raise FileNotFoundError('Missing v1 checkpoint required by this recipe.')
target_v1 = run / 'water_yolov8n_obb_v1/weights/best.pt'
if (run / 'water_yolov8n_obb_v3').exists() or target_v1.exists():
    raise RuntimeError('Use a new run directory; do not reuse this run.')
target_v1.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(source_v1, target_v1)
trainer.RUNS_DIR = run
trainer.OUT_WEIGHTS = run / 'candidate_water.pt'
trainer.METRICS_OUT = run / 'report.json'
print('Experiment output:', run, flush=True)
trainer.main()
'@ | Set-Content -Encoding utf8 -LiteralPath $ocrRunnerPath
node scripts/run-project.mjs --python $ocrRunnerPath
```

Đầu ra:

```text
.runtime/meter-digits/runs/manual-water-<id>/
  run.py
  water_yolov8n_obb_v1/weights/best.pt   # bản chép để trộn, không train lại v1
  water_yolov8n_obb_v3/
    results.csv
    args.yaml
    weights/best.pt                    # checkpoint v3
    weights/last.pt
  candidate_water.pt                   # ứng viên sau trộn/bias, khác best.pt
  report.json
```

Thông số hiện tại: **10 epoch, batch 16, ảnh 640, AdamW, LR `0.0004`, freeze 6, FP32**, GPU số 0. `freeze=6` giữ cố định một số lớp đầu. Muốn đổi epoch/batch phải sửa khối `model.train()` trong [script nước](../scripts/train/train_water_yolo.py), chưa có cờ CLI. Có file `last.pt` không đồng nghĩa lệnh này tự resume.

Không chạy điện và nước cùng lúc trong lần đầu trên GPU 8 GiB. Khi hết VRAM, thử giảm batch (nước 16 → 8, REC 32 → 16, DET 6 → 3) trong recipe cho một run mới. Việc đổi batch có thể thay đổi kết quả, cần ghi lại.

Hai khối hướng dẫn đã được kiểm cú pháp và đối chiếu đường dẫn trong code; **chưa chạy `trainer.main()` để kiểm nghiệm một lượt train mới**. Các thư mục run là artifact cần giữ, không phải rác tạm. Launcher cấp thư mục tạm riêng trong dự án và dọn sau tiến trình.

## 7. Đọc kết quả như thế nào?

```powershell
# $ocrRunPath vẫn trỏ tới lượt vừa chạy trong cùng cửa sổ PowerShell
Get-Content -Encoding utf8 -LiteralPath (Join-Path $ocrRunPath 'report.json')
```

| Trong report | Nên hiểu |
| --- | --- |
| Điện `rec.fineTuned.exact_acc` | Đúng nguyên chuỗi trên crop test sau lọc nhãn |
| Điện `digit_exact_acc` | Chỉ tập chuỗi chữ số; tập 207 mẫu đang có đều là tổng hợp |
| Điện `det.fineTuned.shrink_iou` | Khớp mặt nạ vùng chữ, chưa phải tỷ lệ đúng chỉ số |
| Điện `endToEnd.fineTuned.testFaceplates` | Tối đa 80 mặt tổng hợp được cấp số ô; phần lẻ bị giả định là 1 khi chuỗi có ít nhất 5 số; `auto_exact` chỉ so chuỗi chữ số, chưa kiểm phần lẻ. Không phải benchmark ảnh thật zero-setup |
| Nước `fineTuned.testSplit4Angles.window_rate` | Tỷ lệ helper chọn được cửa sổ; chưa kiểm đúng toàn chuỗi |
| Nước `row_refined_rate` | Tỷ lệ helper tách hàng khi đã biết số bánh chuẩn |
| Nước `udSmartCityEndToEnd` | 20 ảnh; chỉ số đang đo phần nguyên, mẫu rất nhỏ |

Loss giảm chỉ cho biết model đang khớp mục tiêu train hơn; phải xem validation, ảnh thật và lỗi còn lại. Trainer nước dùng fixture/một phần test để chọn blend, nên kết quả đó là dữ liệu phát triển. Những con số cao trong report chưa chứng minh đọc ổn định công tơ Việt Nam.

Hai run riêng trên lưu ứng viên mới, **không tự đưa vào app**. Muốn dùng model mới phải chấm ảnh thật, kiểm tương thích graph/config, cập nhật artifact cùng các hash liên quan rồi kiểm tra tích hợp. Đừng chỉ chép đè file hoặc bỏ kiểm hash để model chạy.

## 8. Đang thiếu gì để train có ích hơn?

| Đã có | Còn thiếu / việc tiếp theo |
| --- | --- |
| GPU, model gốc, Python/thư viện, dữ liệu chuẩn hóa và hai trainer | Tập ảnh thật đúng các kiểu công tơ đang dùng, nhãn do người kiểm tra và tách theo công tơ vật lý |
| Model điện đã fine-tune | Dữ liệu thật cho bánh đỏ, 0 đầu, lóa và chuyển số; nhiều epoch trên cùng ảnh tổng hợp chưa chắc giúp |
| YOLO nước đã fine-tune, có reader bánh quay | Chưa có quy trình fine-tune VisionState; train YOLO không sửa trực tiếp model nhận sai một bánh trên crop chuẩn |
| Công cụ gold import/label/evaluate | Chưa có `data/meter-gold/`; gold chưa được chuyển tự động thành dữ liệu train DET/REC/OBB |
| Báo cáo trước/sau | Bài đo toàn chuỗi + phần lẻ + zero-setup và khả năng từ chối ảnh không đọc được, trên test thật độc lập |
| Recipe chạy được | CLI điều chỉnh, resume, log theo lượt, seed điện và quy trình chấp nhận model mới còn cần hoàn thiện |

Đưa ảnh vào gold hoặc nhập nhãn trên web **chưa tự làm model học thêm**. Hiện builder/train không đọc gold để tạo training samples; gold hook chỉ đọc report đã có, còn lệch đường dẫn/shape với evaluator. Cần một bước chuyển đổi nhãn phù hợp: REC cần crop + text; DET cần polygon; nước cần OBB/ô bánh. Quyền sử dụng dữ liệu public cũng phải kiểm theo nguồn, không coi “Open Access” là quyền thương mại mặc định.

Nếu bắt đầu gom ảnh thật, giữ ảnh nguồn trong dự án, mỗi thư mục con là **một công tơ vật lý**. Ví dụ đã có ảnh ở `data/ocr-photos/electric/`:

```powershell
npm.cmd run ai:gold-import -- data/ocr-photos/electric --utility electric --group-by-folder
node scripts/run-project.mjs scripts/meter-gold.mjs label
```

Đây là nhập/gán nhãn, không phải train. Không dùng gợi ý AI làm nhãn test. Người thuê tiếp tục chỉ gửi ảnh; kết quả model mới vẫn là đề xuất để chủ nhà đối chiếu, chưa tự đổi chỉ số hoặc hóa đơn.

**Thứ tự học và làm nên chọn:** chạy một lượt điện lưu riêng → xem REC/DET và ảnh sai → chạy một lượt nước lưu riêng → xem lỗi tìm vùng hay đọc bánh → bổ sung ảnh/nhãn đúng nhóm lỗi → train lại và so trên tập độc lập. Chạy lại nhiều lần trên cùng dữ liệu không thay thế được bước bổ sung bằng chứng thật.
