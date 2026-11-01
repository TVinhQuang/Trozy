# OCR tự định vị, Vision chỉ kiểm tra khung — 29/10/2026

Đây là thiết kế lịch sử ngày 29/10 và giai đoạn kiểm tra khung bên trong luồng mới. Từ 30/10, mặc định dùng [OCR với Vision bổ sung một ô](METER-OCR-VISION-ASSISTED.md). Không còn so sánh hai dãy số; OCR đọc đủ thì không gọi Vision đọc chữ số.

Giai đoạn này dùng `recognizeMeterFrameVerified` trong `meter-frame-reader.mjs`. OCR sở hữu khung đọc và chuỗi chữ số ban đầu. Tác vụ Vision kiểm tra khung chỉ đánh giá hình học, không đọc số; chỉ khi OCR xác định một ô chưa đọc thì giai đoạn tiếp theo mới hỏi Vision về đúng ô ấy. Mã và snapshot cũ được giữ để xem lịch sử.

## Trình tự

1. Server xác thực file/phòng/kỳ, lấy baseline và cấu hình công tơ có phiên bản. Ảnh được kiểm tra kỹ thuật trước nhận dạng.
2. Bộ detector **PP-OCRv6 small det** đã có tìm các hộp chữ trên ảnh; nhận dạng **PP-OCRv6 small rec** chép chữ. Tesseract vẫn là provider thay thế theo cấu hình. OCR chọn vùng có bằng chứng bố cục bộ đếm, loại sê-ri, năm và thông số.
3. Khi detector tách dãy thành các ký tự rời, worker có thể nhóm hình học các hộp cùng hàng thành `frameCandidates` chỉ chứa tọa độ, không chứa chuỗi số ghép. Nhãn đơn vị cùng hàng hoặc trọng số in phía dưới là bằng chứng vị trí. Hàng trọng số như `10000 1000`, `100`, `10`, `1/10` được loại theo cùng baseline; không cấm số đọc thật `100` ở hàng bộ đếm.
4. Cùng model nhận dạng đã có đọc lại **toàn ảnh crop của hàng**, qua API `TextRecognition`; chữ số quan sát là đầu ra model thật. Một lượt crop riêng kiểm tra lặp lại. Không ghép chuỗi `3` và `6` thành đáp án `36`, không thêm số 0, chuyển dấu câu hoặc lấy chữ số Vision bù vào.
5. Vision nhận ảnh và tọa độ OCR, không nhận chuỗi OCR, điểm số, số kỳ trước hoặc số ô cấu hình. Nếu khung đúng, Vision trả `accepted` và không có quyền chỉnh tọa độ. Nếu không rõ, giữ `uncertain`; nếu sai, trả `rejected` và có thể gợi ý **vùng tìm lại**.
6. Chỉ sau `rejected`, cho phép đúng một lượt OCR tìm khung mới trong vùng tìm lại. Khung cuối phải lại do OCR xác định, nằm trong vùng gợi ý; không lấy nguyên crop Vision thành khung đã được chấp nhận. Vision kiểm tra lại khung OCR mới. Không lặp vô hạn và không sửa khung đã đúng.
7. Kiểm tra chất lượng trên khung OCR thật chưa phóng lớn, tính lại đề xuất từ bằng chứng OCR và cấu hình. Chỉ giữ đề xuất khi khung cuối được Vision chấp nhận và bằng chứng số đủ điều kiện. Chủ nhà vẫn xác minh trên ảnh gốc; thiếu đơn vị/phần lẻ, số ô sai, OCR mâu thuẫn hoặc vùng quá nhỏ đều cần kiểm tra/chụp lại.

## Hợp đồng kết quả

`recognitionMode:'ocr-frame-verified'`; `localization.source:'ocr'` và `localization.rectangle` là tọa độ khung OCR trên ảnh sau EXIF. `frameVerification` giữ `status:'accepted'|'rejected'|'uncertain'|'unavailable'`, tối đa hai `attempts`, cùng `correctionApplied`. Chỉ lần đầu bị bác mới được có `searchRectangle` và tìm lại. Validator kiểm tra chuỗi hành động này, khung cuối tương ứng vùng OCR và chất lượng đúng khung.

`proposedReading` là đề xuất OCR duy nhất, `confirmedReading:null`, `candidates:[]`, `requiresConfirmation:true`. Luồng này không có số đọc Vision, so sánh chữ số, `within_tolerance` hoặc ngưỡng chênh OCR/Vision. Các trường đó chỉ còn ở snapshot lịch sử. Chấp nhận khung không đồng nghĩa xác nhận số; điểm OCR cũng không phải xác suất số đúng.

Người thuê vẫn chỉ chụp/chọn và gửi ảnh; chỉ chủ nhà nhận kết quả, cấu hình, lịch sử và ghi chú nội bộ. Xác minh phải đối chiếu ảnh, xác nhận cách ghi phần nguyên khi có phần lẻ; sửa số/chưa có đề xuất cần lý do. Profile/baseline/CAS, hợp đồng, kỳ và hóa đơn được kiểm tra trước/sau xử lý bất đồng bộ. Không tự lưu chỉ số, chốt kỳ hoặc tạo hóa đơn qua nhận dạng.

## Model có sẵn và kiểm chứng giới hạn

Hai model `digit_recognizer_v16` ONNX 10/100 lớp đã tải trước là bộ phân loại **một ô số đã crop**, không phải detector khung. Chúng không thể tự định vị đồng hồ từ toàn ảnh và chưa thay PP-OCRv6. Không tải model mới trong thay đổi này; runtime/model vẫn ở `.runtime/` dưới `D:\Trozy`.

Kiểm tra OCR thật trên ảnh điện đang được hỏi, đọc file bằng SQLite chỉ đọc, không sửa bộ gửi: từ toàn ảnh OCR chọn vùng `483,114,131,33`, chép `13621` lặp lại; vùng này nhỏ và chữ số có thể sai nên không được coi là đọc đúng. Khi thử vùng tìm kiếm rộng của lượt cũ, OCR tự dựng hàng `477,122,139,20`; model nguyên hàng đọc `13624`, lượt crop đọc `13621`, nên giữ không ổn định. Nhãn `100` đã thành `specification`, không còn là vùng bộ đếm. Đây là kiểm chứng khắc phục chọn nhầm nhãn, chưa phải phép đo độ chính xác.

Các kiểm thử bảo đảm khung đúng giữ nguyên, khung sai chỉ tìm lại một lần, model Vision không trả/nhận đáp án chữ số, không ghép fragment thành chuỗi, không chọn nhãn trọng số và không vượt quyền người thuê/chủ nhà. Chưa có tập ảnh độc lập đủ lớn để công bố độ chính xác. Các báo cáo của pipeline Vision đọc số cũ giữ nguyên hash và mốc lịch sử.
