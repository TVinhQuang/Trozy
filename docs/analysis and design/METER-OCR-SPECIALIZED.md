# OCR chuyên đọc công tơ

> Thiết kế lịch sử của mốc OCR duy nhất ngày 28/10/2026, đã được thay bằng [Vision định vị và kiểm tra OCR](METER-VISION-GUIDED-OCR.md) từ ngày 29/10/2026. Giữ mô tả và minh chứng cũ theo mốc gốc; luồng hiện hành dùng Vision định vị trước, OCR đọc chính, Vision kiểm tra độc lập với trạng thái chênh trong ngưỡng. Quy tắc mới lưu runtime/model/cache trong chính thư mục dự án thay cho đường dẫn D: bên ngoài trước đây.

Luồng công tơ chuyển sang OCR cục bộ, không gọi Ollama/Vision. PaddleOCR được ưu tiên theo cấu hình hiện có; Tesseract vẫn là lựa chọn dự phòng. B01/B04 tiếp tục dùng Ollama độc lập. Mã và báo cáo Vision cũ được giữ làm lịch sử, không chạy để xác nhận ảnh mới.

## Người sử dụng

Người thuê chỉ chụp/chọn và gửi tối đa ba ảnh. Server xử lý sau khi nhận bộ gửi, chủ nhà nhận thông báo riêng. Không trả chữ số, kết quả, cấu hình công tơ hoặc ghi chú nội bộ cho người thuê.

Chủ nhà xác nhận cấu hình từng công tơ theo phòng: điện/nước, loại mặt số, đơn vị, số ô phần nguyên và phần lẻ. Cấu hình có phiên bản; thay đổi trong lúc xử lý không được âm thầm diễn giải lại ảnh cũ. Cấu hình không chứa đáp án hoặc mức tiêu thụ mong muốn.

Kết quả chủ nhà có một trong ba trạng thái: **Chỉ số đề xuất — Chờ xác minh**, **Cần kiểm tra** hoặc **Cần chụp lại**. Chủ nhà đối chiếu ảnh gốc, xác nhận phần lẻ nếu có, rồi xác minh. Nhập/chỉnh thủ công cần lý do. Chỉ khi cả điện và nước được kiểm tra mới chốt kỳ; nhận ảnh/đọc ảnh không lập hóa đơn hoặc ghi chỉ số chính thức.

## Bằng chứng trước đề xuất

1. Giải mã ảnh và kiểm tra chất lượng pixel; kích thước vùng số được đo ở ảnh gốc, không phóng ảnh để vượt ngưỡng.
2. OCR tìm vùng có bằng chứng là bộ đếm; xoay/nắn theo hình học đã có, loại sê-ri, năm, trọng số in và thông số kỹ thuật. Nhiều vùng cạnh tranh hoặc không rõ vai trò thì chưa đề xuất.
3. Giữ toàn bộ chuỗi kể cả số 0 đầu, kiểm tra các lượt đọc tại cùng vùng. Không nối các dòng rời, đệm/chèn/bỏ số để khớp cấu hình.
4. Chỉ dùng cấu hình do chủ nhà xác nhận khi số ô khớp chính xác; bằng chứng đơn vị, dấu phân cách hoặc nhóm màu ngược với cấu hình sẽ chặn đề xuất. Không có cấu hình thì cần đủ bằng chứng OCR độc lập về đơn vị và cách chia số.
5. Chỉ số kỳ trước dùng để cảnh báo sau nhận dạng, không sửa đáp án cho hợp lịch sử. Thông tin ô chuyển vòng/bị che khi có phải chặn đề xuất.

Đề xuất mang `recognitionMode:ocr-specialized`, `assessment:proposed` và `proposedReading`. `confirmedReading` luôn null, `candidates` luôn rỗng; một đề xuất không phải kết quả được máy tự xác nhận. Server kiểm tra lại bằng chứng nguồn và profile thay vì tin nhãn trạng thái của một object.

Chủ nhà có thể bấm **Đọc lại ảnh bằng OCR** ở bộ ảnh đang chờ xác minh. API `POST /api/meter/submissions/:id/reanalyze` kiểm tra phiên bản, quyền, hợp đồng và kỳ, rồi chạy lại với cấu hình hiện tại; giữ ảnh gốc và tối đa ba snapshot phân tích cũ. Không tự đọc lại/lưu số khi chỉ đổi cấu hình. Ảnh đã duyệt hoặc kỳ đã chốt không được đi qua bước này.

## Giới hạn và bản quyền

Đây là phát triển pipeline quanh OCR hiện có, **chưa huấn luyện model công tơ mới**. Lặp lại cùng OCR đo độ ổn định, không tạo các phiếu độc lập chứng minh đúng. Điểm nhận dạng chữ không phải xác suất chỉ số đúng. OCR hiện chưa có bộ phát hiện chuyển vòng từng ô đã được kiểm chứng trên tập thực tế; một ô chuyển số vẫn có thể bị đọc ổn định thành chữ số sai. Không tuyên bố đã giải quyết triệt để ảnh đang chuyển số, mờ hoặc lóa; chủ nhà vẫn bắt buộc kiểm tra ảnh. Mặt kim chưa suy ra số tự động.

Khi người dùng/camera chỉ định khung, kiểm tra pixel áp dụng lên khung đó; khi tự tìm, kiểm tra áp dụng lên vùng bộ đếm phát hiện. Khung chọn rộng đạt chất lượng không chứng minh từng chữ số đủ nét; ngưỡng 180 px là quy tắc kỹ thuật ban đầu, chưa hiệu chỉnh theo số ô hoặc đo độ chính xác từng ký tự. Bằng chứng OCR cùng vùng và bước chủ nhà xem ảnh vẫn bắt buộc.

Model thử ONNX chuyên chữ số trước đây vẫn chỉ là thử ngoại tuyến, không được bật làm nguồn xác minh. Cần ảnh có quyền sử dụng, nhãn đúng và tập kiểm tra tách theo công tơ trước khi huấn luyện/tuyên bố độ chính xác. Đo đúng toàn dãy, phần lẻ/đơn vị, chọn nhầm sê-ri, tỷ lệ đề xuất sai và tỷ lệ từ chối; vài ảnh hồi quy không đại diện cho mọi đồng hồ.

PaddleOCR/model hiện dùng giữ nguyên trọng số và giấy phép. Xem [THIRD-PARTY-NOTICES](../../THIRD-PARTY-NOTICES.md), [Apache-2.0](../../licenses/PaddleOCR-Apache-2.0.txt) và [thử nghiệm chữ số](../test/METER-DIGIT-MODEL-TRIAL.md). Không tải thêm model hoặc xóa runtime/ảnh gốc trong lần chuyển đổi này.
