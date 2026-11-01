# OCR tự định vị, Vision chỉ kiểm tra khung — kiểm chứng 29/10/2026

Đã chuyển luồng mặc định sang `recognizeMeterFrameVerified`. Model PaddleOCR det/rec đã có tự tìm vùng và đọc; Vision chỉ kiểm tra hình học. Khung đúng được giữ nguyên. Chỉ sau `rejected` mới được gợi ý một vùng tìm kiếm, rồi OCR tự phát hiện khung mới; tối đa hai lần kiểm tra, không lấy crop Vision làm khung cuối và không dùng chữ số Vision.

## Kiểm thử

- **302 kiểm thử Node đạt**, không lỗi hoặc bỏ qua; gồm quyền, profile/baseline/CAS, ảnh/metadata, lỗi runtime, khung đúng không đổi, tìm lại chỉ khi bị bác, giới hạn hai lượt, chống giả mạo khung/số và tương thích snapshot cũ.
- **81 kiểm tra UI, 132 lượt render trang/vai trò và TypeScript/build đạt.** UI dùng DOM cô lập; chưa thử camera hoặc trình duyệt thật trong lượt này.
- Đã sửa lỗi nhánh nhận dạng nguyên hàng trả tọa độ crop mở rộng vượt mép ảnh; giữ phép biến đổi ảnh, chặn polygon báo cáo trong nguồn. Có hồi quy biên ảnh.
- `git diff --check` không phát hiện lỗi khoảng trắng. Đã đối chiếu **72 hash mã nguồn** trong bốn JSON dưới đây với mã cuối. Không sửa hash/báo cáo lịch sử của luồng cũ.

## Model thật, HTTP và DB RAM

Các lượt chạy không truyền đáp án, profile số ô hoặc lịch sử vào Vision. Người thuê chỉ gửi ảnh, không có model call trước gửi. Kết quả và thông báo chỉ chủ nhà thấy. Không sửa bộ ảnh, chỉ số hoặc hóa đơn thật; mọi API trong báo cáo dùng DB RAM.

| Ca | Khung và kiểm tra Vision | OCR/quyết định |
| --- | --- | --- |
| Ảnh trong ca đọc nhầm `100` | OCR tự chọn `483,114,131,33`; Vision `accepted`, không đổi khung, một lượt audit. Nhãn trọng số không còn được chọn làm bộ đếm. | OCR đọc `13621` lặp lại; vùng rộng 131 px dưới ngưỡng 180, `needs_review`, không đề xuất. Không coi chuỗi này là nhãn chuẩn. [JSON](METER-FRAME-SCREENSHOT-20261029.json) |
| Điện mẫu | OCR tự chọn `134,260,222,46`; Vision `accepted`, không đổi khung, một lượt audit. | OCR `00766` còn thiếu ô đỏ so với profile 5+1; không bổ sung chữ số, `needs_review`. [JSON](METER-FRAME-ELECTRIC-20261029.json) |
| Nước xanh | Đầu tiên OCR chưa chọn một khung duy nhất. Vision bác và gợi ý search `240,426,874,291`; OCR tự xác định `248,441,866,276`, Vision kiểm tra lại và chấp nhận. | Khung cuối khác crop gợi ý và thuộc OCR. OCR chưa có chuỗi hợp lệ/ổn định nên không đề xuất, `needs_review`. Hai lượt audit, không lặp nữa. [JSON](METER-FRAME-WATER-20261029.json) |
| Tổng hợp làm mờ | Chặn bởi chất lượng trước OCR và Vision. | `retake`, không model call hoặc bộ gửi. [JSON](METER-FRAME-BLUR-20261029.json) |

Một lượt ghi báo cáo cuối bị gián đoạn vì Ollama đã dừng; script từ chối gán thành công khi không gọi được model. Đã mở lại runtime cục bộ có sẵn, chạy lại ba ảnh và xác minh các JSON cuối; không tải model. Lượt ảnh mờ không cần runtime.

## Thay đổi OCR

Veto `100` theo cùng hàng trọng số, không blacklist mọi giá trị 100. Các hộp detector tách ký tự có thể tạo `frameCandidates` chỉ hình học. Cùng PP-OCRv6 rec đọc nguyên ảnh ROI và crop xác nhận; không nối các chuỗi ký tự, không xóa dấu câu để tạo đáp án. Hai model AMR v16 tải từ trước chỉ phân loại từng ô đã crop, không phải detector khung nên chưa thay model phát hiện chữ.

Vision chấp nhận khung không bảo đảm đọc số đúng. Cả ba ảnh thật ở đây vẫn chưa có đề xuất đủ điều kiện; chưa có phép đo độ chính xác chung hoặc tuyên bố mọi ảnh đã đọc được. Giữ kiểm tra ảnh, cấu hình và chủ nhà xác minh; không nới ngưỡng để tạo kết quả.

## Sử dụng

Chạy tại `D:\Trozy` bằng `npm run dev`. Các phân tích đã lưu giữ snapshot cũ; chủ nhà chọn **Đọc lại ảnh bằng OCR** để tạo kết quả bằng luồng mới. Không tự chạy lại hay thay dữ liệu đã gửi. Xem [thiết kế](../analysis%20and%20design/METER-OCR-FRAME-VERIFIED.md).

Nếu phiên bị ngắt vì token/usage, trạng thái và lệnh tiếp tục lưu trong `CODEX_PROGRESS.md`. Không có cơ chế tự tạo lượt mới sau cấp token trong phiên này; gửi “tiếp tục theo CODEX_PROGRESS.md” khi cần.

Đã dọn 9 thư mục tạm Node rỗng và 11 log npm / 11.477 byte của lượt này, giữ thư mục tạm cũ chưa thuộc phạm vi. Worker tmp trống; Ollama do lượt kiểm thử mở đã được dừng. Không xóa model, ảnh hoặc dữ liệu nghiệp vụ. [Biên bản dọn tạm](METER-FRAME-CLEANUP-20261029.json).
