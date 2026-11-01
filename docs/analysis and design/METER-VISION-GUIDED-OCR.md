# Vision định vị và kiểm tra OCR công tơ

Tài liệu lịch sử, đã được thay bằng [OCR tự định vị và Vision chỉ kiểm tra khung](METER-OCR-FRAME-VERIFIED.md). Các snapshot/model test cũ giữ nguyên; luồng hiện tại không dùng Vision đọc số hoặc ngưỡng chênh OCR/Vision.

Thiết kế B03 hiện hành từ ngày 29/10/2026: Vision tìm đúng vùng bộ đếm trước khi OCR đọc; OCR là nguồn của chỉ số đề xuất; Vision đọc độc lập để kiểm tra toàn dãy và từng ô. Thiết kế này thay thế luồng OCR duy nhất tại [METER-OCR-SPECIALIZED.md](METER-OCR-SPECIALIZED.md) và hybrid cũ vốn chạy OCR trước rồi mới lấy vùng OCR cho Vision. Mã và báo cáo cũ được giữ để tra cứu lịch sử, không được dùng làm minh chứng chạy thật của pipeline mới.

## Trình tự xử lý

1. Kiểm tra quyền tài khoản, phòng, file ảnh, kỳ ghi; lấy chỉ số nền và cấu hình công tơ từ server. Ảnh hợp lệ là một khung PNG/JPEG/WebP, tối đa 5 MB, 12 triệu pixel và 8000 px mỗi chiều.
2. Kiểm tra kỹ thuật ảnh; ảnh không đạt bị chặn trước model. Đây là kiểm tra nét, sáng, tương phản, chói và kích thước, không phải xác suất đọc đúng.
3. `meter-localizer.mjs` gửi ảnh toàn cảnh và vùng tìm kiếm do chủ nhà chọn nếu có cho Vision. Tác vụ này chỉ tìm một hàng bộ đếm tích lũy đầy đủ, gồm cả ô phần lẻ; không chép chữ số. Sê-ri, năm sản xuất, thông số và kim tròn bị loại. Có nhiều bộ đếm khả dĩ thì trả `ambiguous`.
4. Kiểm tra bbox theo ảnh sau EXIF, quy đổi lưới `0..1000` về pixel nguồn; không chấp nhận khung ngoài ảnh hoặc quá nhỏ. Kiểm tra chất lượng đúng vùng bộ đếm chưa phóng lớn.
5. OCR đọc vùng đã định vị bằng PaddleOCR hoặc Tesseract. Giữ kiểm tra vùng, bằng chứng OCR toàn vùng/lượt xác nhận crop, tính ổn định, đơn vị, phần nguyên/phần lẻ, số 0 đầu và cấu hình công tơ có phiên bản.
6. Trên cùng vùng ảnh đã định vị, Vision đọc độc lập toàn dãy/đơn vị/vai trò vùng, rồi có một tác vụ riêng quan sát từng ô và vị trí ô. OCR và Vision có thể xử lý song song sau định vị. Vision không nhận văn bản/đáp án/điểm OCR, số ô trong cấu hình, chỉ số kỳ trước hoặc đáp án của tác vụ Vision còn lại; OCR không nhận chữ số Vision.
7. `meter-comparison.mjs` so sánh hai kết quả theo từng vị trí và ngưỡng server. `meter-guided-reader.mjs` dựng kết quả và validator tính lại từ bằng chứng gốc, không chỉ tin nhãn `proposed` hoặc `within_tolerance`.

Nếu định vị thất bại, hệ thống chưa đọc số bằng OCR/Vision và không tạo đề xuất; chủ nhà kiểm tra/chọn vùng rồi đọc lại. Nếu bước đọc hoặc kiểm tra ô thất bại, giữ bằng chứng đã có để xem xét, không tự dùng Vision thay OCR hay tự ghi chỉ số.

## Đối chiếu và ngưỡng

| Trạng thái `comparison.status` | Điều kiện | Kết quả chủ nhà nhận |
| --- | --- | --- |
| `exact` | Đúng bộ đếm, đơn vị/cách chia số/số ô khớp; toàn bộ chữ số kể cả số 0 đầu khớp; từng ô Vision rõ và có vị trí hợp lệ | Một đề xuất giữ nguyên số OCR; `assessment:'proposed'`; vẫn cần xác minh trên ảnh |
| `within_tolerance` | Chỉ khác đúng một ô hàng đơn vị, các ô khác kể cả phần lẻ khớp, chênh tuyệt đối không quá ngưỡng | Đề xuất giữ nguyên số OCR, chỉ rõ ô khác và hai quan sát; `assessment:'within_tolerance'`; chủ nhà bắt buộc ghi lý do sau đối chiếu ảnh |
| `conflict` | Khác ngoài ngưỡng, khác vị trí khác, số ô, đơn vị hoặc vị trí dấu thập phân | Không có đề xuất để áp dụng; xem ảnh hoặc nhập tay có lý do |
| `unavailable` | Thiếu OCR đủ bằng chứng, Vision chưa đọc rõ/đủ từng ô, thiếu định vị hoặc bằng chứng phù hợp | Không có đề xuất; kiểm tra/chụp lại/đọc lại |

Ngưỡng mặc định riêng cho điện và nước là 1 đơn vị vật lý: 1 kWh hoặc 1 m³. Biến môi trường `TROZY_METER_ELECTRIC_TOLERANCE` và `TROZY_METER_WATER_TOLERANCE` chỉ nhận chuỗi `0` hoặc `1`; đặt `0` để yêu cầu trùng toàn bộ. Đây là ngưỡng **chênh giữa hai lần đọc**, chưa phải sai số đo so với chỉ số thật. Không dùng phần trăm và không nới cho nhiều ô có tổng chênh nhỏ.

Ví dụ `012345.6` và `012346.6` khác đúng ô đơn vị, chênh 1 nên có thể thuộc nhóm trong ngưỡng. `00999` và `01000` cũng chênh 1 nhưng khác nhiều ô, vì vậy cần kiểm tra. `012345.6` và `012345.7` khác ô phần lẻ nên không được nhóm trong ngưỡng hiện tại. Không lấy trung bình, bỏ ô, thêm số 0 hoặc sửa số OCR theo Vision/lịch sử.

Ô đang chuyển số, bị che, chưa rõ, thiếu/chồng vị trí hoặc không khớp số ô không được chấp nhận là một sai khác nhỏ. Việc đối chiếu OCR ở từng ô hiện căn theo vị trí trong chuỗi; chưa phải một mô hình OCR ký tự riêng chạy độc lập trên từng khung ô.

## Kết quả và kiểm tra server

Kết quả hiện hành mang `recognitionMode:'vision-guided-ocr'`, `confirmedReading:null`, `candidates:[]`, `requiresConfirmation:true` trong mọi trường hợp. `proposedReading` chỉ xuất hiện khi OCR đủ bằng chứng và đối chiếu là `exact` hoặc `within_tolerance`; `suggestedValue` chỉ phản chiếu phần nguyên của đề xuất đó. `value` là phần nguyên cho biểu mẫu; `numericValue` và `displayText` giữ cả phần lẻ.

Các trường bổ sung:

- `localization:{version:1,status:'located'|'ambiguous'|'unavailable',rectangle:null|{left,top,width,height},sourceWidth,sourceHeight,model,issues}`. Rectangle tính trong ảnh gốc sau EXIF, không phải ảnh thu nhỏ gửi model.
- `comparisonPolicy:{version:1,maxAbsoluteDifference:0|1,allowedPlace:'units'}` lưu cùng snapshot phân tích.
- `comparison:{version:1,status,maxAbsoluteDifference,allowedPlace:'units',absoluteDifference:number|null,mismatches:[{index,place,ocrDigit,visionDigit}],issues}`. `place` là trọng số thập phân; 1 chỉ ô đơn vị.
- `vision` và `cellEvidence` giữ quan sát đọc độc lập, trạng thái/khung từng ô và đối chiếu với chuỗi OCR. Khung được ánh xạ về ảnh gốc khi có đủ hình học; thiếu tọa độ thì không vẽ khung giả.
- `ocrProposedReading`, `ocrAssessment`, các register/observation OCR và `meterProfile` giữ bằng chứng trước đối chiếu để validator dựng lại kết luận.

Nguồn chuẩn là file ảnh được server cấp quyền cùng cấu hình và baseline đã xác minh. Client không được chọn model, provider, host, đường dẫn runtime hoặc gửi kết quả AI thay cho bằng chứng server. Sau async vẫn kiểm tra lại quyền, cấu hình, kỳ và baseline; snapshot cũ được giữ lịch sử, không âm thầm đổi theo kết quả mới.

## Người thuê và chủ nhà

Người thuê vẫn chỉ chụp/chọn tối đa ba ảnh thật, kiểm tra kỹ thuật và gửi. Server lưu bộ gửi `processing` trước nhận dạng, xử lý nền, gửi thông báo riêng chủ nhà và chuyển `pending`. Biên nhận, bootstrap, danh sách và export cho người thuê không chứa số đọc, raw OCR, Vision, cấu hình hoặc ghi chú nội bộ chủ nhà.

Chủ nhà xem một đề xuất OCR cùng Vision đọc độc lập, khung bộ đếm và ô khác. Tất cả phê duyệt cần `imageChecked:true`; có phần lẻ cần xác nhận cách ghi phần nguyên. Kết quả trong ngưỡng được xử lý như xác minh thủ công: lý do 10–1000 ký tự bắt buộc kể cả giữ nguyên số OCR, nguồn ghi `manual`. Kết quả khớp đủ điều kiện và được người xác minh dùng nguồn `ocr-and-human`. Công cụ đọc trực tiếp có thể hiển thị đề xuất trong ngưỡng nhưng không bật lối áp dụng nhanh thiếu lý do.

Chủ nhà có thể sửa số sau xem ảnh hoặc yêu cầu chụp lại. Phê duyệt vẫn kiểm tra phiên bản bộ gửi, cấu hình, hợp đồng, baseline, kỳ đã chốt và hóa đơn. Chỉ chốt kỳ khi cả điện và nước được kiểm tra; không có bước nhận dạng, gửi ảnh hoặc phê duyệt nào tự tạo/sửa hóa đơn.

## Lưu trữ và trạng thái môi trường

Theo [AGENTS.md](../../AGENTS.md), mọi thư viện, runtime, model, dataset, cache, log và dữ liệu sinh riêng cho Trozy phải nằm trong thư mục dự án. JavaScript dùng `node_modules/`; Ollama `.runtime/ollama/`; Python và PaddleOCR `.runtime/paddleocr/`; thử model chữ số `.runtime/meter-digits/`; npm cache `.cache/npm/`; dữ liệu nghiệp vụ `data/`. Các thư mục runtime/cache/data được Git bỏ qua, không có nghĩa là nằm ngoài thư mục dự án. Công cụ hệ thống dùng chung đã có không phải thư viện riêng do Trozy cài.

Mỗi lượt Codex dùng một thư mục tạm riêng trong dự án, đặt `TEMP`/`TMP`/`TMPDIR` phù hợp rồi dọn đúng phần do lượt đó tạo sau xử lý/kiểm chứng. Trước xóa đệ quy phải kiểm tra đường dẫn tuyệt đối nằm trong mục tiêu được phép. Không xóa ảnh gốc, dữ liệu nghiệp vụ, model, thư viện, báo cáo hoặc tệp chưa rõ nguồn gốc.

Ngày 29/10/2026, dự án chuyển vị trí làm việc sang `D:\Trozy` vì ổ C không đủ chỗ gom model. Đã kiểm chứng SHA-256 toàn bộ dự án và hai bộ môi trường cũ; Ollama nằm tại `.runtime/ollama/`, PaddleOCR tại `.runtime/paddleocr/`. Runtime/model cũ được dùng lại, không tải/cài lại. Ba ảnh mẫu dùng trong lượt này được sao chép và kiểm tra hash tại `.runtime/datasets/meter/`, ảnh gốc của người dùng giữ nguyên. Xem [báo cáo kiểm chứng](../test/METER-GUIDED-VALIDATION.md).

## Kiểm chứng và giới hạn

Kiểm thử tự động kiểm tra logic định vị, ánh xạ tọa độ, so sánh theo từng ô, ngưỡng, validator, quyền truy cập và quy trình người xác minh. UI được kiểm tra bằng DOM cô lập; không vì vậy khẳng định camera thật hay model đã đọc chính xác trên điện thoại. Hai ảnh mẫu đã chạy qua model thật và đều còn cần kiểm tra; đây chưa phải phép đo độ chính xác chung. Kết quả chạy thật cũ trong `docs/test/` giữ mốc và hash gốc của chúng.

Hai quan sát có thể cùng đọc sai, và Vision có thể trả khung có vẻ hợp lý nhưng sai vị trí. JSON đúng schema chỉ kiểm tra cấu trúc; ảnh nét, OCR lặp ổn định và hai bên khớp chưa bảo đảm số thật. Chưa huấn luyện model mới, chưa có tập ảnh đại diện độc lập đủ để công bố độ chính xác. Cần đánh giá tỷ lệ đúng toàn dãy và tỷ lệ từ chối trên ảnh đã gán nhãn theo loại đồng hồ, ánh sáng, góc chụp và trạng thái chuyển số.

Tham khảo upstream: [Ollama structured outputs](https://ollama.com/blog/structured-outputs) mô tả trả kết quả theo JSON schema, gồm trường hợp model ảnh; [Qwen3-VL](https://github.com/QwenLM/Qwen3-VL) cung cấp model và cookbook upstream. Việc Trozy dùng schema, lưới tọa độ và kiểm tra chéo là thiết kế tích hợp của dự án, không phải cam kết upstream về độ chính xác đọc công tơ.
