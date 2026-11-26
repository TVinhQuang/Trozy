# Model OCR điện và nước của Trozy

Danh mục ngày 12/11/2026 ghi bốn model đang dùng. Đường dẫn bên dưới tính từ thư mục gốc Trozy. [Danh mục và SHA-256](models.json) · [Biên bản kiểm tra ngày 12/11](verification.json)

| Nhánh | Model đang dùng | Công việc | Dung lượng trọng số |
| --- | --- | --- | ---: |
| Điện | `PP-OCRv6_small_det_trozy_onnx_infer/inference.onnx` | Tìm vùng chữ/hàng số; đã fine-tune Trozy | 9,88 MB |
| Điện | `PP-OCRv6_small_rec_trozy_onnx_infer/inference.onnx` | Đọc chuỗi; đã fine-tune Trozy | 21,16 MB |
| Nước | `trozy_water_yolov8_obb.pt` | Tìm cửa sổ và ô bánh số; đã fine-tune Trozy | 12,70 MB |
| Nước | `wheels-v2.onnx` | Đọc trạng thái bánh quay; trọng số gốc VisionState | 6,10 MB |

**Thư mục thật của điện:**

```text
.runtime\paddleocr\models\electric\
  PP-OCRv6_small_det_trozy_onnx_infer\
    inference.onnx
    inference.yml
    inference.json
    README.md
  PP-OCRv6_small_rec_trozy_onnx_infer\
    inference.onnx
    inference.yml
    inference.json
    README.md
```

Giữ mỗi bộ Paddle nguyên thư mục: app cần cả trọng số, cấu hình và bảng ký tự. README của tác giả được giữ kèm model.

**Thư mục thật của nước:**

```text
.runtime\meter-digits\visionstate-yolo\models\water\
  trozy_water_yolov8_obb.pt
  wheels-v2.onnx
```

Trên máy lập biên bản, đường dẫn cũ `models/wheels-v2.onnx` là hard link phục vụ script thử nghiệm. Ứng dụng đọc model nước ở thư mục `models/water/`.

## Model gốc và checkpoint để đối chiếu

Các mục này được giữ nguyên vị trí, **không phải bộ trọng số đang được app chọn**:

| Loại | Vị trí tương đối trong dự án |
| --- | --- |
| Paddle DET gốc | `.runtime/paddleocr/models/PP-OCRv6_small_det_onnx_infer/` |
| Paddle REC gốc | `.runtime/paddleocr/models/PP-OCRv6_small_rec_onnx_infer/` |
| YOLO gốc | `.runtime/meter-digits/visionstate-yolo/models/stage1_meter_window_digits.pt` |
| Checkpoint YOLO nước v1/v2/v3 | `.runtime/meter-digits/runs/water_yolov8n_obb_v*/weights/` |
| Báo cáo train điện | `.runtime/paddleocr/runs/electric_paddle_eval.json` |
| Báo cáo train nước | `.runtime/meter-digits/runs/water_yolov8n_obb_eval.json` |

Python, thư viện, cache, dataset và checkpoint không được di chuyển trong lần sắp xếp này. Các báo cáo lịch sử giữ nguyên đường dẫn được ghi lúc tạo báo cáo.

## Chuẩn bị trên máy mới

1. Từ thư mục gốc của bản clone, chạy `npm run ai:setup-meter-reader` và `npm run ai:setup-paddle-meter` để chuẩn bị thư viện và model nền.
2. Lấy bộ trọng số đã fine-tune từ người phụ trách OCR của nhóm qua kênh chia sẻ được phép. Chép từng tệp vào đường dẫn tương đối ở trường `files[].path` của [models.json](models.json), gồm cả cấu hình và bảng ký tự Paddle. Trường `root` trong danh mục ghi vị trí trên máy lập biên bản ngày 12/11.
3. Chạy đoạn PowerShell sau ở thư mục gốc để đối chiếu kích thước và SHA-256 của toàn bộ tệp. Lỗi sẽ nêu đúng tệp cần kiểm tra.

```powershell
$models = Get-Content -Raw -LiteralPath 'MODELS-OCR/models.json' | ConvertFrom-Json
foreach ($model in $models.files) {
  $file = Get-Item -LiteralPath $model.path -ErrorAction Stop
  $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
  if ($file.Length -ne $model.bytes -or $hash -ne $model.sha256) {
    throw "Sai kích thước hoặc SHA-256: $($model.path)"
  }
}
Write-Output "Đã xác minh $($models.files.Count) tệp model."
```

Đối chiếu [giấy phép đi kèm](../THIRD-PARTY-NOTICES.md) trước khi phân phối bộ trọng số. Sau khi có bộ ảnh thử phù hợp, nhóm có thể kiểm tra hai nhánh qua HTTP bằng `npm run ai:meter-split-check`. Phép so sánh hash chỉ xác nhận đúng bộ tệp đã kê khai.

## Khi thay hoặc train model

App và trainer hiện trỏ tới các thư mục điện/nước ở trên. App kiểm SHA-256; chép đè một model khác chưa đủ để đưa model đó vào sử dụng. Hãy lưu ứng viên riêng, đánh giá và cập nhật trọng số cùng cấu hình/mã băm theo [hướng dẫn train](../docs/TRAIN-METER-OCR.md).

OCR tiếp tục chạy cục bộ bằng CPU và chỉ đề xuất chỉ số. Người thuê gửi ảnh; chủ nhà đối chiếu ảnh trước khi duyệt chỉ số. Việc sắp xếp file không thay đổi quyền hoặc hóa đơn.

Ghi công và giấy phép: [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md), [licenses/](../licenses/).
