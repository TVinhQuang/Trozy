# OCR ưu tiên, Vision đọc dự phòng — 30/10/2026

B03 mặc định dùng `recognizeMeterAssisted`, chế độ `ocr-vision-assisted`. Người thuê chỉ chụp/chọn và gửi ảnh; hệ thống đọc ngầm và chỉ chủ nhà thấy một chỉ số đề xuất. Model OCR, Vision và runtime cục bộ đã có được dùng lại. Không huấn luyện hoặc tải model trong lúc nhận dạng.

## Luồng hiện tại

1. OCR tự tìm khung và đọc bằng detector/recognizer đã cài. Vision kiểm tra khung: khung đúng giữ nguyên; chỉ khung bị bác bỏ mới gợi ý vùng để OCR tự phát hiện lại tối đa một lần.
2. Nếu OCR có đề xuất đủ bằng chứng, giữ nguyên đề xuất đó và không gọi Vision đọc chữ số. Không tạo dãy Vision cạnh tranh hoặc áp dụng dung sai hàng đơn vị.
3. Nếu chưa có đề xuất nhưng bằng chứng OCR xác định đúng một ô thiếu, chất lượng vùng số đạt và các chữ số còn lại ổn định, hệ thống thử Vision đọc riêng ô đó. Model chỉ nhận ảnh và vị trí ô; mọi chữ số OCR đã đọc được giữ nguyên.
4. Nếu OCR hoặc bước bổ sung ô vẫn chưa tạo được đề xuất, khung đã được chấp nhận và vùng số đủ điều kiện thử, Vision có thể đọc dự phòng toàn hàng. Hai yêu cầu không chia sẻ câu trả lời: lượt đầu nhận ảnh toàn cảnh cùng crop đã xoay đúng chiều; lượt sau chỉ nhận crop. Cả hai không nhận văn bản OCR, đáp án mong đợi, số ô cấu hình hoặc chỉ số kỳ trước.
5. Mỗi yêu cầu hiện chỉ trả ba trường `integerDigits`, `fractionalDigits`, `uncertainDigits`, tránh yêu cầu model vừa chép số vừa suy thêm thông tin. Hai lượt phải chép trùng toàn bộ hai nhóm, giữ số 0 đầu, không có `?` hoặc cờ chữ số chưa rõ. Transport này không tuyên bố đã quan sát được đơn vị hoặc quy ước thập phân: cần cấu hình công tơ đã được chủ nhà xác nhận, khớp loại/số ô/ranh giới nhóm, để tạo đề xuất. Khi thiếu cấu hình, chỉ giữ quan sát trong chi tiết và hướng dẫn thiết lập. Sau đó code kiểm tra giới hạn/chỉ số nền. Chỉ một `proposedReading` đủ điều kiện được đưa lên màn hình chính; mọi kết quả vẫn cần chủ nhà đối chiếu ảnh trước khi lưu.

Các bước Vision dùng chung ngân sách `TROZY_VISION_TIMEOUT_MS` (mặc định 90 giây), tính cả kiểm tra khung, đọc một ô và đọc dự phòng. Hết thời gian không khởi chạy bước tiếp theo. Hai lượt cùng một model chỉ kiểm tra sự ổn định của quan sát, không phải hai bộ nhận dạng độc lập hay bằng chứng số đọc chắc chắn đúng.

## Chất lượng ảnh và quy ước

Kiểm tra nét, ánh sáng, tương phản và lóa luôn dùng pixel vùng ảnh gốc. Crop nhỏ hơn ngưỡng OCR thông thường vẫn có thể được thử Vision nếu các kiểm tra này đạt và cạnh dài/ngắn ít nhất 64/16 pixel. Để đề xuất theo phương thức `repeated-transcription`, mật độ trung bình của dãy trên crop nguyên bản phải đạt ít nhất 12 pixel mỗi chữ số và chiều cao crop ít nhất 24 pixel. Đây là phép sàng lọc theo kích thước trung bình của cả hàng, **không phải đo khung từng ô** hoặc phát hiện chắc chắn ô đang chuyển số. Phóng ảnh không tạo thêm chi tiết gốc.

Một placeholder rõ như `?`, `□`, `�`, `回` có thể biểu diễn một ô OCR chưa đọc. Bước đọc một ô chỉ dùng khi vị trí ấy được chứng minh từ các quan sát cùng khung; không suy từ chuỗi rơi ký tự hoặc ghép các dòng OCR. Nếu phải đọc dự phòng toàn hàng, kết quả là quan sát mới có nguồn Vision, không phải sửa văn bản OCR gốc.

Nhánh đọc dự phòng hiện yêu cầu cấu hình công tơ đã xác nhận vì transport chỉ chép nhóm chữ số; đơn vị, loại và quy ước trong bằng chứng chuẩn hóa giữ `unknown`. Cấu hình phải khớp tổng số ô và ranh giới nhóm, không được dùng để đệm/xóa hoặc đổi chữ số. Validator vẫn hỗ trợ bằng chứng cũ có đơn vị/quy ước đã quan sát và từ chối cấu hình trái ngược bằng chứng ấy. Nếu thiếu cấu hình thì chưa đề xuất để lưu. Không lấy màu đỏ đơn thuần làm phần lẻ của công tơ điện. Bằng chứng ô chuyển số/bị che làm mất điều kiện đề xuất; không dùng lịch sử để chọn một chữ số.

## Hợp đồng kết quả

- `proposedReading` là một chỉ số hoặc `null`; giữ số 0 đầu và phần lẻ.
- `assistance:{version:1,status:'ocr'|'vision_completed'|'vision_fallback'|'unavailable',source:'ocr'|'ocr+vision'|'vision'|null,ocrPattern,filledIndices,issues}` ghi nguồn đề xuất. Nguồn đọc dự phòng không ghi là OCR đã xác nhận.
- `slotVision` chứa bằng chứng đọc riêng một ô hoặc `null`. `fallbackVision` chỉ có khi đã thử đọc dự phòng; phương thức hiện hành `repeated-transcription` giữ hai `rawObservations`, chuỗi suy ra, nguồn ảnh/crop và chất lượng `native-strip-density`. Transport chỉ trả ba trường chữ số/cờ chưa rõ; adapter chuẩn hóa metadata chưa quan sát thành `unknown`, không tự gán là model đã đọc được đơn vị. Các ô suy từ chuỗi có `rectangle:null`; không dựng khung giả. Bằng chứng có khung từng ô từ thử nghiệm trước được hỗ trợ để kiểm tra snapshot lịch sử.
- `frameEngine`, `frameProposedReading`, `frameAssessment` giữ quyết định OCR/khung ban đầu để validator tính lại. Không có `vision`, `resolution`, `comparison` hoặc `comparisonPolicy` của luồng so sánh cũ trong kết quả mới.
- `confirmedReading:null`, `candidates:[]`, `requiresConfirmation:true` luôn được giữ. `suggestedValue` chỉ phản chiếu phần nguyên của đề xuất; nhận dạng không tự ghi chỉ số/hóa đơn.

Validator dựng lại chuỗi và chất lượng từ hai quan sát, kiểm tra đúng khung/ảnh nguồn/hướng xoay, thay vì tin nhãn `readable` hoặc `proposed`. Quyền theo phòng, cấu hình có phiên bản, chỉ số nền và CAS vẫn được kiểm tra phía server.

## Giao diện và xác minh

Chủ nhà thấy một chỉ số đề xuất cùng nguồn OCR, OCR + Vision hoặc Vision; thông tin kỹ thuật trong chi tiết đóng sẵn. Văn bản OCR giống nhau được gộp để trình bày kèm góc/lượt đọc và điểm, không ghép các đoạn thành số mới. Ví dụ `26762回` và `222` ở các góc khác nhau là hai quan sát thô, không phải hai chỉ số chính thức; điểm nhận dạng văn bản không phải xác suất chỉ số đúng.

Nút **Đọc lại ảnh** chạy lại ảnh pending bằng cấu hình hiện tại; snapshot cũ không tự thay đổi. Chủ nhà phải xem ảnh và xác nhận phần lẻ trước khi lưu. Sửa số hoặc dữ liệu/cấu hình đã thay đổi cần lý do thủ công. Xác minh đề xuất OCR giữ nguồn `ocr-and-human`; bổ sung một ô dùng `ocr-vision-and-human`; đọc dự phòng toàn dãy dùng `vision-and-human`. Người thuê vẫn chỉ nhận ảnh/trạng thái, không nhận số, cấu hình, quan sát hoặc phân tích.

## Giới hạn và kiểm chứng

Model vẫn có thể đọc sai giống nhau qua hai lượt hoặc bỏ sót trạng thái bánh số đang chuyển; không coi đọc lặp lại là chứng minh chính xác. Các chẩn đoán yêu cầu model vừa đọc vừa trả tọa độ từng ô đã cho hình học không hợp lệ nên không tạo đề xuất; các báo cáo ấy được giữ nguyên lịch sử, không đổi thành kết quả đạt. Luồng mới giảm yêu cầu model về ba trường chép nhóm chữ số/cờ chưa rõ, cần cấu hình công tơ thay cho thông tin model không quan sát và vẫn giữ kiểm tra ảnh/chủ nhà xác minh. Chưa có tập đánh giá đủ lớn để công bố độ chính xác chung.

Xem `CODEX_PROGRESS.md` và báo cáo kiểm thử tương ứng cho kết quả của mã cuối. [Thiết kế so sánh trước đây](METER-OCR-VISION-RECONCILED.md) và snapshot cũ được giữ để xem lịch sử; không gán kết quả cũ cho pipeline hiện tại.

Kiểm chứng bản đọc dự phòng ngày 30/10/2026: [kết quả model thật, kiểm thử và giới hạn](../test/METER-VISION-FALLBACK-VALIDATION.md).
