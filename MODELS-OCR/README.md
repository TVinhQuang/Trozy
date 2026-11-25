# Model OCR điện và nước của Trozy

Đây là nơi mở nhanh và kiểm kê **4 model OCR đang dùng**, sắp xếp ngày 12/11/2026. Mọi trọng số đều nằm trong `D:\Trozy` trên ổ D; không tải lại hoặc train lại model.

## Mở model đang dùng

- Nhấp đúp **DIEN.lnk**: mở hai thư mục PaddleOCR đọc công tơ điện.
- Nhấp đúp **NUOC.lnk**: mở YOLO tìm vùng và VisionState đọc bánh số nước.
- `models.json`: bảng kê đường dẫn, dung lượng và SHA-256 của từng file tại thời điểm sắp xếp. Bảng kê không tự cập nhật khi bạn train lại.
- `verification.json`: kết quả kiểm tra sau sắp xếp: 10 file giữ nguyên hash, 23 bài kiểm tra Python đạt và đọc mẫu điện/nước qua HTTP thành công. Đây là kiểm tra tích hợp, không phải độ chính xác chung trên ảnh thực tế.

Các lối tắt mở thư mục thật, không chứa bản sao trọng số. Nếu chuyển toàn bộ dự án sang vị trí khác, cần tạo lại hai lối tắt Windows; app tự lấy đường dẫn theo thư mục dự án.

| Nhánh | Model đang dùng | Công việc | Dung lượng trọng số |
| --- | --- | --- | ---: |
| Điện | `PP-OCRv6_small_det_trozy_onnx_infer/inference.onnx` | Tìm vùng chữ/hàng số; đã fine-tune Trozy | 9,88 MB |
| Điện | `PP-OCRv6_small_rec_trozy_onnx_infer/inference.onnx` | Đọc chuỗi; đã fine-tune Trozy | 21,16 MB |
| Nước | `trozy_water_yolov8_obb.pt` | Tìm cửa sổ và ô bánh số; đã fine-tune Trozy | 12,70 MB |
| Nước | `wheels-v2.onnx` | Đọc trạng thái bánh quay; trọng số gốc VisionState | 6,10 MB |

**Thư mục thật của điện:**

```text
D:\Trozy\.runtime\paddleocr\models\electric\
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
D:\Trozy\.runtime\meter-digits\visionstate-yolo\models\water\
  trozy_water_yolov8_obb.pt
  wheels-v2.onnx
```

Đường dẫn cũ `models/wheels-v2.onnx` còn được giữ bằng **NTFS hard link** tới đúng file `models/water/wheels-v2.onnx`, để các script thử nghiệm đã khóa mã nguồn tiếp tục hoạt động. Đây là hai tên của cùng một file trên D, không phải hai bản trọng số chiếm dung lượng riêng. App hiện dùng đường dẫn trong `water/`.

## Model gốc và checkpoint để đối chiếu

Các mục này được giữ nguyên vị trí, **không phải bộ trọng số đang được app chọn**:

| Loại | Vị trí trong `D:\Trozy` |
| --- | --- |
| Paddle DET gốc | `.runtime/paddleocr/models/PP-OCRv6_small_det_onnx_infer/` |
| Paddle REC gốc | `.runtime/paddleocr/models/PP-OCRv6_small_rec_onnx_infer/` |
| YOLO gốc | `.runtime/meter-digits/visionstate-yolo/models/stage1_meter_window_digits.pt` |
| Checkpoint YOLO nước v1/v2/v3 | `.runtime/meter-digits/runs/water_yolov8n_obb_v*/weights/` |
| Báo cáo train điện | `.runtime/paddleocr/runs/electric_paddle_eval.json` |
| Báo cáo train nước | `.runtime/meter-digits/runs/water_yolov8n_obb_eval.json` |

Python, thư viện, cache, dataset và checkpoint không được di chuyển trong lần sắp xếp này. Các báo cáo lịch sử giữ nguyên đường dẫn được ghi lúc tạo báo cáo.

## Khi thay hoặc train model

App và trainer hiện trỏ tới các thư mục điện/nước ở trên. App kiểm SHA-256; chép đè một model khác chưa đủ để đưa model đó vào sử dụng. Hãy lưu ứng viên riêng, đánh giá và cập nhật trọng số cùng cấu hình/mã băm theo [hướng dẫn train](../docs/TRAIN-METER-OCR.md).

OCR tiếp tục chạy cục bộ bằng CPU và chỉ đề xuất chỉ số. Người thuê gửi ảnh; chủ nhà đối chiếu ảnh trước khi duyệt chỉ số. Việc sắp xếp file không thay đổi quyền hoặc hóa đơn.

Ghi công và giấy phép: [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md), [licenses/](../licenses/).
