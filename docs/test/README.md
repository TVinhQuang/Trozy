# Tra cứu báo cáo và minh chứng kiểm thử

Để biết tính năng nào đang dùng, xem [tiến độ dự án](../PROJECT-STATUS.md). Khi cần đối chiếu một kết quả, chọn tài liệu theo mục đích dưới đây.

| Cần tìm | Nơi tra cứu |
| --- | --- |
| Báo cáo tách bộ đọc điện/nước, huấn luyện và lần chạy trước khi cấu hình công tơ | [Báo cáo theo mốc](reports/) · [Thử nghiệm không cấu hình trước](reports/METER-ZERO-SETUP-20261105.md) |
| Quy trình thử và kết quả PaddleOCR ban đầu | [Thử nghiệm PaddleOCR](../research/paddleocr-trial/PADDLEOCR-TRIAL-RESULTS.md) |
| Các thế hệ OCR định vùng, chia ô, đối chiếu với Vision | [Minh chứng OCR lịch sử](archive/meter-ocr/) · [Các thiết kế cùng thời](../analysis%20and%20design/archive/) |
| Thay đổi điều hướng, màu sắc và quyền hỗ trợ trong giao diện ngày 01/11 | [Biên bản giao diện](archive/ui/) |
| Dữ liệu đầu vào được script và test sử dụng | [Danh mục ảnh mẫu](fixtures/visionstate-yolo-samples.json) · [Baseline và ảnh đối chứng YOLO](visionstate-yolo-20261031/) |
| Báo cáo do công cụ ghi tại đường dẫn cố định | [Kiểm kê dataset](METER-DATASETS-AUDIT.md) · [Ví dụ AI](AI-LIVE-EXAMPLES.json) |

Các tệp JSON trực tiếp trong thư mục này lưu kết quả theo từng lệnh chạy. Một số script kiểm tra tham số đầu ra chỉ chấp nhận tệp JSON ngay dưới `docs/test/`. Khi tái lập một lần chạy, hãy dùng tên tệp mới để giữ bản minh chứng đã lưu.

Hai bộ mẫu ngày 03/11 có cùng dung lượng nhưng khác nội dung. [Bộ mẫu cấu hình](METER-OCR-CONFIGURATION-SAMPLES-20261103.json) · [Bộ mẫu fine-tune](METER-OCR-FINETUNE-SAMPLES-20261103.json)
