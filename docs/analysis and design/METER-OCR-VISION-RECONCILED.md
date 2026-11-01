# Một chỉ số đề xuất từ OCR và Vision — 30/10/2026

Đây là thiết kế lịch sử, đã được thay bởi [OCR với Vision chỉ bổ sung một ô thiếu](METER-OCR-VISION-ASSISTED.md) theo yêu cầu tiếp theo cùng ngày. Luồng so sánh toàn dãy không còn là mặc định; mã/snapshot và báo cáo cũ được giữ nguyên để xem lịch sử.

Ở mốc này, B03 dùng `recognizeMeterReconciled`, chế độ `ocr-vision-reconciled`. Người thuê gửi ảnh; toàn bộ nhận dạng chạy ngầm và chỉ chủ nhà thấy kết quả. Không tải hoặc huấn luyện model mới.

OCR bằng detector/recognizer có sẵn tự xác định khung và đọc số. Vision kiểm tra khung; đúng giữ nguyên, sai mới gợi ý một vùng để OCR tự tìm lại tối đa một lần. Sau khi chính khung OCR được chấp nhận và đạt chất lượng, Vision đọc độc lập toàn dãy và kiểm tra từng ô bằng hai yêu cầu ảnh riêng. Vision không nhận văn bản OCR, đáp án của yêu cầu còn lại, số ô cấu hình hoặc chỉ số kỳ trước.

## Quy tắc chọn một số

- Hai bên khớp toàn bộ chữ số, đơn vị và phần nguyên/lẻ: giữ nguyên OCR (`exact`).
- Chỉ khác đúng chữ số hàng đơn vị của phần nguyên: giữ nguyên OCR (`units_only`). Các chữ số hàng cao hơn và mọi chữ số phần lẻ phải khớp. Quy tắc này dựa trên vị trí, không giới hạn chênh lệch số học ở 1: `09998.4` và `09991.4` giữ `09998.4`; `09998.4` và `10008.4` không hợp lệ. Các biến môi trường ngưỡng 0/1 của luồng lịch sử không tham gia.
- OCR có đúng một ô chưa đọc được nhưng giữ rõ vị trí trong cả lượt toàn hàng và lượt crop xác nhận: cho phép bổ sung duy nhất ô đó từ Vision (`vision_completed`). Các ô OCR đã đọc phải khớp Vision; Vision phải quan sát rõ, đủ ô, đơn vị, phần lẻ và hình học trên đúng khung. Giữ bằng chứng gốc và chỉ số ô được bổ sung.
- Không suy ra vị trí từ chuỗi OCR bị rơi mất ký tự, không thêm số 0, ghép các dòng, lấy số Vision nguyên dãy hoặc sửa các ô OCR đã đọc. Chỉ nhận dấu chưa đọc rõ ràng `?`, `□`, `�`, `回` trong một hàng số phù hợp; chữ cái khác không được tự đổi thành số.
- Nếu bánh số thật đang xoay giữa hai chữ số, Vision báo chưa rõ, các bên khác ở hàng khác, sai đơn vị/phần lẻ, khung chưa đúng hoặc ảnh không đạt thì chưa có đề xuất. Giữ kiểm tra độ phân giải vùng số, không dùng phóng ảnh để vượt ngưỡng.

## Kết quả và xác minh

Chỉ có một `proposedReading` hoặc `null`. `resolution` lưu `{version:1,status,source,ocrPattern,filledIndices,issues}`; nguồn là `ocr` hoặc `ocr+vision`. `frameEngine`, `frameProposedReading`, `frameAssessment` giữ quyết định trước đối chiếu. Validator tính lại cả quyết định OCR/khung và đối chiếu từ quan sát gốc, không tin nhãn kết quả hoặc chữ số do client gửi.

`confirmedReading:null`, `candidates:[]`, `requiresConfirmation:true`. `suggestedValue` chỉ phản chiếu phần nguyên của đề xuất. Chủ nhà phải đối chiếu ảnh và xác nhận phần lẻ trước khi lưu; nếu sửa số hoặc bằng chứng cũ thay đổi thì cần lý do thủ công. Nguồn xác minh có bổ sung ô Vision là `ocr-vision-and-human`; các đề xuất giữ OCR là `ocr-and-human`. Không tự chốt chỉ số/hóa đơn.

Màn hình chính hiển thị ảnh, đúng một đề xuất hoặc lý do ngắn khi chưa có, cùng biểu mẫu xác minh/yêu cầu chụp lại. Quan sát OCR/Vision, điểm, khung và lịch sử được đưa vào phần chi tiết đóng sẵn. Không gọi điểm OCR là xác suất đúng. Snapshot lịch sử vẫn đọc được; chủ nhà chọn đọc lại để tạo kết quả mới, không tự sửa bộ ảnh đã gửi.

## Giới hạn

Hai model có thể cùng đọc sai. Quy tắc khác hàng đơn vị là lựa chọn ưu tiên OCR, không chứng minh OCR chính xác. Một ô được bổ sung chỉ là bằng chứng rõ hơn của Vision; chủ nhà vẫn xem ảnh gốc. Chuỗi bị thiếu ký tự hoặc model không xác định được ô cần bổ sung tiếp tục cần xem thủ công/chụp lại. Xem `CODEX_PROGRESS.md` và báo cáo kiểm thử tương ứng để biết phần nào đã chạy model thật.
