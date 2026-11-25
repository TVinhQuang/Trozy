# Báo cáo Kiểm tra Chất lượng Dataset Công tơ (Audit Report)

Thời điểm cập nhật: 2026-11-03

## 1. Đồng hồ Nước (YOLOv8n-OBB Oriented + VisionState)
- **Thư mục OBB:** `.runtime/datasets/water/yolo-obb/` (nhãn OBB xoay chuẩn hóa theo trục PCA hàng bánh số, kiểm chứng qua `refine_row`, đủ lớp `0: meter`, `1: window`, `2..11: 0..9`, `12: u`, bổ sung xoay `90°/180°/270°` và biến thể mặt đồng hồ cũ/bụi mờ ở `train`/`val`)
- **Tập Train:** 1290 ảnh
- **Tập Validation:** 197 ảnh
- **Tập Test (OBB độc lập, không tăng cường):** 109 ảnh
- **Tập Kiểm chứng Đọc Toàn Luồng (`eval_readings.jsonl`):** 403 ảnh thực tế có nhãn chỉ số (`DL7981-Value` + `UD-Smart-City-CC0`)
- **Rò rỉ dữ liệu giữa Train/Val/Test:** 0
- **Trùng lặp với 5 ảnh mẫu kiểm thử `.runtime/datasets/meter/*`:** 0
- **Ảnh hỏng (Corrupt):** 0

## 2. Đồng hồ Điện Cơ Khí (PaddleOCR PP-OCRv6 Det & Rec)
- **Thư mục Det:** `.runtime/datasets/electric/paddle-det/` (mặt công tơ cơ khí nhiều chi tiết gây nhiễu + khung bánh lẻ `1/10` viền đỏ tách riêng khỏi `kWh` và thước `10000..1/10`, kèm mẫu crop ngữ cảnh lượt 2 `rectify_manual` và sơ đồ kỹ thuật)
  - Train: 1500 | Val: 180 | Test: 180
- **Thư mục Rec:** `.runtime/datasets/electric/paddle-rec/` (dãy bánh số cơ khí có bánh lẻ đỏ + mẫu chữ mặt đồng hồ/`kWh` chống quên từ điển + mẫu chỉ số thực từ `Henrik-Energy-Meter`)
  - Train: 4313 | Val: 506 | Test: 526
- **Rò rỉ dữ liệu giữa Train/Val/Test:** 0
- **Trùng lặp với 5 ảnh mẫu kiểm thử `.runtime/datasets/meter/*`:** 0
- **Ảnh hỏng (Corrupt):** 0

## 3. Tuân thủ Quy định Dự án (`AGENTS.md`)
- Toàn bộ dữ liệu thô, dữ liệu chuẩn hóa, bộ nhớ đệm và mô hình nằm gọn trong `.runtime/` và `.cache/` của thư mục dự án `d:/Trozy`.
- Tuyệt đối không đưa 5 ảnh mẫu `.runtime/datasets/meter/*` vào bất kỳ tập huấn luyện hay validation nào.
