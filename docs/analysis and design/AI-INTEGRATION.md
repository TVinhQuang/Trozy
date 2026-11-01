# Các tính năng B01 đến B04 và cấu hình AI cục bộ

> **Cập nhật 31/10/2026:** đã tích hợp bộ đọc công tơ cơ YOLO + VisionState theo luồng chủ nhà chọn/xác nhận vùng, nhận đề xuất và đối chiếu ảnh trước khi lưu. Người thuê chỉ gửi ảnh. [Hướng dẫn/API hiện hành](../METER-READER.md). Nội dung mô tả PaddleOCR/Tesseract/Ollama Vision hoặc API B03 cũ bên dưới là lịch sử trước khi gỡ; không dùng để triển khai bộ đọc mới.

Trozy đã có B01–B04 trong ứng dụng: trợ lý vận hành có nguồn dữ liệu, cảnh báo điện nước, OCR công tơ và gợi ý phân loại sửa chữa. Người dùng chọn **Ollama chạy cục bộ**, không dùng API AI trả phí. B05 — dự báo công nợ, doanh thu và phòng trống — vẫn chưa triển khai.

## Luồng hiện tại: OCR ưu tiên, Vision đọc dự phòng

B03 dùng `recognizeMeterAssisted`, mode `ocr-vision-assisted`: OCR tự xác định khung và đọc; Vision vẫn kiểm tra khung. OCR đã đọc đủ thì giữ đề xuất đó, không gọi Vision đọc chữ số. Nếu bằng chứng OCR xác định đúng một ô thiếu, Vision thử đọc ô ấy; mọi chữ số OCR khác giữ nguyên. Nếu vẫn chưa có đề xuất, Vision có thể đọc dự phòng toàn hàng bằng hai yêu cầu không chia sẻ đáp án: toàn cảnh + crop, sau đó chỉ crop. Mỗi lượt chỉ trả `integerDigits`, `fractionalDigits`, `uncertainDigits`; các nhóm phải trùng và không có ký tự chưa rõ. Không gửi số OCR, profile hoặc chỉ số cũ vào model. Transport không yêu cầu model suy đơn vị/loại/quy ước nên metadata chưa quan sát giữ `unknown`: nhánh dự phòng cần cấu hình công tơ đã xác nhận, khớp số ô/ranh giới nhóm, để cung cấp quy ước; thiếu cấu hình thì chưa có đề xuất. Cấu hình không ghi đè bằng chứng quan sát trái ngược trong snapshot có metadata. Các bước dùng chung ngân sách Vision mặc định 90 giây. Hai lượt cùng model chỉ kiểm tra ổn định, không bảo đảm chính xác. Không so sánh hai đáp án chính thức hoặc dùng dung sai hàng đơn vị; không suy vị trí ký tự rơi hay đoán bánh số đang xoay. Màn hình chính chỉ một đề xuất, thông tin kỹ thuật trong chi tiết; chủ nhà vẫn xem ảnh/phần lẻ trước lưu, người thuê chỉ gửi ảnh. Xem [thiết kế hiện hành](METER-OCR-VISION-ASSISTED.md).

## Lịch sử trước đó cùng ngày: so sánh cả dãy OCR/Vision

`recognizeMeterReconciled`, mode `ocr-vision-reconciled`, từng đọc độc lập cả dãy và từng ô để so sánh. Đã bỏ luồng so sánh này khỏi mặc định theo yêu cầu mới; mã/snapshot và [thiết kế cũ](METER-OCR-VISION-RECONCILED.md) giữ để xem lịch sử, không phải hành vi hiện tại.

## Lịch sử cùng ngày: Vision định vị, OCR đọc chính

Ở mốc lịch sử này, B03 dùng `recognizeMeterGuided`: kiểm tra ảnh → Vision định vị một bộ đếm tích lũy → kiểm tra chất lượng đúng vùng số → OCR đọc chính và Vision đọc độc lập toàn dãy/từng ô → đối chiếu. Mô tả bên dưới được giữ để hiểu snapshot cũ, không phải luồng đang chạy. Xem [thiết kế lịch sử và giới hạn](METER-VISION-GUIDED-OCR.md).

OCR là nguồn của `proposedReading`; không lấy trung bình hoặc sửa chữ số theo Vision. Khớp toàn bộ trả `assessment:'proposed'`; chỉ khác đúng một ô đơn vị, các ô khác/phần lẻ khớp và chênh không quá ngưỡng trả `assessment:'within_tolerance'`. Ngưỡng mặc định 1 kWh hoặc 1 m³, cấu hình độc lập bằng `TROZY_METER_ELECTRIC_TOLERANCE`/`TROZY_METER_WATER_TOLERANCE` chỉ nhận `0` hoặc `1`. Các trường hợp khác chưa có đề xuất để áp dụng. Đây là chênh giữa hai kết quả, chưa phải sai số so với số thật.

Mọi kết quả giữ `confirmedReading:null`, `candidates:[]`, `requiresConfirmation:true`. Chủ nhà đối chiếu ảnh rồi xác minh; kết quả trong ngưỡng cần lý do 10–1000 ký tự và ghi nguồn thủ công kể cả giữ nguyên số OCR. Có phần lẻ cần xác nhận quy ước ghi phần nguyên. Nhận dạng không tự chốt chỉ số hoặc lập hóa đơn. Các schema/mô tả hybrid cũ và báo cáo trong mục lịch sử bên dưới giữ mốc gốc, không chứng minh đã chạy model thật của pipeline mới. B01/B04 vẫn dùng model văn bản khi Ollama sẵn sàng; B02 độc lập model.

## Lịch sử: luồng camera và kiểm tra ô số ngày 28/10/2026

Người thuê dùng **Chỉ số điện nước → Chụp điện / Chụp nước** để chụp hoặc tải tối đa ba ảnh thật. Camera ưu tiên camera sau; không xin micro. Vùng hàng số có thể điều chỉnh; kiểm tra ánh sáng, tương phản, nét, vùng cháy sáng và chuyển động chạy trên thiết bị. Nút chụp mở sau bốn lượt đo đạt liên tiếp và ít nhất 750 ms ổn định; đo lại chính pixel của ảnh lúc chụp, đóng camera khi đóng/rời màn hình/đổi phạm vi. Chỉ số chất lượng là heuristic kỹ thuật, không xác suất đọc đúng. API camera trình duyệt cần HTTPS hoặc localhost, xem [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

**Luồng người thuê được chốt lại:** chỉ chụp/chọn ảnh và gửi cho chủ nhà. Không hiện ô nhập/sửa chỉ số, quan sát OCR/Vision, điểm nhận dạng, lựa chọn đáp án hoặc yêu cầu xác nhận số cho người thuê. Trước khi gửi, server chỉ giải mã ảnh trong RAM và kiểm tra kỹ thuật như nét/ánh sáng/kích thước; ảnh không đạt được hướng dẫn chụp lại. Người thuê không phải chờ model đọc. Giới hạn ảnh vẫn là PNG/JPEG/WebP, 5 MB, 12 MP, một khung, không tải model trong lúc nhận ảnh. Cache/runtime tiếp tục ở D.

Vision cung cấp số ô, trạng thái từng ô, chữ số/khả năng quan sát và hình học, bao gồm cả ô phần lẻ. Ô chuyển vòng, bị che, thiếu vị trí, mất ô, chồng khung hoặc dãy tự mâu thuẫn không được xác nhận. Vị trí chưa biết giữ `null`, không tạo khung giả. OCR đối chiếu từng vị trí trong chuỗi ổn định; **đây chưa phải nhận dạng OCR độc lập từng vùng ký tự**. Khi hình học hợp lệ, phép biến đổi ngược crop/xoay/nắn nghiêng đưa khung ô về ảnh gốc để người dùng đối chiếu; khung vẫn là quan sát model, không chứng minh nét chữ chắc chắn. Không dùng lịch sử/chỉ số kỳ trước để chọn chữ số đang chuyển hoặc lấy cứng số nhỏ hơn.

`/api/meter/submissions` nhận ảnh đã tải lên của người thuê đang có hợp đồng, gắn đúng phòng/kỳ/công tơ và lưu bộ gửi trước khi chạy AI. Payload chứa file ảnh/vùng khung camera nếu có, không chứa giá trị công tơ hoặc ID đáp án phân tích. Sau khi nhận, hàng đợi phía server tự đọc ngầm từng ảnh rồi cập nhật bộ gửi cho chủ nhà. Công việc đã lưu được tiếp tục khi server khởi động lại; một lượt xử lý thất bại không tự ghi chỉ số. `/api/meter/analyses` và `/api/extensions/B03` chỉ cho chủ nhà xem kết quả nhận dạng. Người thuê chỉ nhận biên nhận/trạng thái và ảnh gốc của mình; kết quả, số đã xác minh và ghi chú nội bộ của chủ nhà được lọc khỏi response, bootstrap và export. Thông báo kết quả được giới hạn đúng tài khoản chủ nhà, không gửi tới người thuê khác trong cùng cơ sở.

Chủ nhà nhận thông báo trong ứng dụng, mở bộ gửi đã xử lý và duyệt tại trang chỉ số bằng `/api/meter/submissions/:id/review`: bắt buộc đối chiếu ảnh, giá trị nguyên hợp lệ; chỉnh số hoặc chưa có đề xuất đủ điều kiện cần lý do; phần lẻ cần xác nhận cách ghi phần nguyên. Web chủ nhà khi đang mở ở tab hiện kiểm tra digest `/api/meter/updates` khoảng mỗi 10 giây rồi tải lại dữ liệu khi có thay đổi, tùy độ trễ mạng; thông báo có lối mở trang ảnh công tơ. Không có email/push hoặc tin nhắn bên ngoài. Kết quả chưa rõ được giữ cho chủ nhà kiểm tra thủ công hoặc yêu cầu chụp lại. Người thuê chỉ thấy trạng thái chụp lại chung, không nhận nội dung AI/ghi chú nội bộ có thể chứa chỉ số. Kiểm tra phiên bản, kỳ trước, công tơ hiện tại, hợp đồng, kỳ sau và hóa đơn được chạy trong transaction. Chỉ khi điện và nước được kiểm tra mới chốt kỳ.

Model chuyên biệt có hai bản ONNX 10/100 lớp đã chạy ngoại tuyến, giữ riêng ở D, không thay PaddleOCR hoặc tham gia quyết định tính tiền. Ảnh rõ đọc tốt nhưng ảnh chuyển số khó còn sai dù điểm model cao. Chưa huấn luyện model mới hoặc có tập đánh giá độc lập đủ lớn. Nguồn, hash, giấy phép và kết quả thực ở [báo cáo model chuyên biệt](../test/METER-DIGIT-MODEL-TRIAL.md); quy trình và kiểm chứng phiên này ở [báo cáo camera](../test/METER-CAPTURE-IMPROVEMENT.md). Những số kiểm thử/minh chứng bên dưới thuộc các mốc trước, không phải đánh giá độ chính xác của pipeline mới.

| Tính năng | Cách xử lý | Khi Ollama chưa sẵn sàng |
| --- | --- | --- |
| B01 — Operations Copilot | Tra cứu dữ liệu đã lọc quyền, tính số liệu bằng code; Ollama có thể diễn đạt câu trả lời từ nguồn đã chọn. | Câu hỏi thông dụng vẫn trả kết quả thật bằng truy vấn cục bộ, gắn nhãn `local`. Câu hỏi chưa hỗ trợ được báo rõ. |
| B02 — Cảnh báo điện nước | Thống kê lịch sử chỉ số đã xác nhận; không gọi mô hình ngôn ngữ. | Hoạt động độc lập, gắn nhãn `statistics`. |
| B03 — OCR ưu tiên, Vision dự phòng | OCR tự tìm khung/đọc, Vision kiểm tra khung. OCR đủ thì giữ nguyên; thiếu một ô có vị trí rõ thì thử bổ sung, chưa có đề xuất thì có thể đọc dự phòng qua hai lượt chép nhóm số ổn định. Nhánh dự phòng chỉ chép nhóm số và cần cấu hình công tơ đã xác nhận; chỉ một đề xuất cho chủ nhà. | Kiểm tra ảnh gốc và mật độ trung bình dãy số không bảo đảm từng ô rõ. Khung/đơn vị/phần lẻ mâu thuẫn hoặc chữ số chưa rõ thì chưa đề xuất; chủ nhà xem ảnh/nhập tay hoặc yêu cầu chụp lại. |
| B04 — Phân loại sửa chữa | Quy tắc tiếng Việt và nhận diện rủi ro; Ollama có thể bổ sung phân loại/giải thích có kiểm tra. | Gợi ý từ quy tắc vẫn dùng được, gắn nhãn `rules`. |

Nhãn `ollama` chỉ xuất hiện khi có phản hồi mô hình hợp lệ. Lỗi kết nối, quá hạn hoặc JSON sai không được trình bày như phản hồi AI thành công. Không chuyển sang dịch vụ cloud khi Ollama lỗi.

## Cài và chạy trên máy

Chạy `npm install` tại gốc repo để có thư viện OCR và file ngôn ngữ cục bộ. Để dùng model, cần thêm Ollama và tải đúng model đã cấu hình. Script Windows tải runtime portable chính thức, kiểm tra SHA-256 trước khi chạy, khởi động server và tải model:

```powershell
.\scripts\setup-ollama.ps1 -WithVision
```

Script mặc định dùng model văn bản `qwen3:4b-instruct`. Lần cài/tải đầu cần mạng và dung lượng trống cho runtime, file tải và model; những lần xử lý sau dùng file cục bộ. Ưu tiên dùng lại các model đã có, không tải lại chỉ để đổi vị trí.

`-WithVision` chuẩn bị thêm model ảnh `qwen3-vl:4b-instruct`; model văn bản phía trên không thay thế model ảnh. Có thể chạy `npm run ai:setup-vision` để chuẩn bị cả hai trong `.runtime/ollama/` khi chưa có môi trường. Model đã có tại vị trí chuẩn được dùng lại; không có tải model trong luồng nhận dạng.

| Tham số script | Ý nghĩa |
| --- | --- |
| `-InstallRoot` | Thư mục con hợp lệ trong dự án chứa runtime, model, log; mặc định `.runtime/ollama/`. Không dùng đường dẫn ngoài dự án. |
| `-Model` | Tag model cần tải; đổi cả `TROZY_AI_MODEL` của backend khi chọn model khác. |
| `-WithVision` / `-VisionModel` | Tải thêm model ảnh, mặc định `qwen3-vl:4b-instruct`; cấu hình backend bằng `TROZY_VISION_MODEL` nếu đổi. |
| `-Version` | Phiên bản runtime portable chính thức; xem giá trị mặc định trong script. |
| `-SkipPull` | Chuẩn bị/chạy runtime nhưng chưa tải model. |

Script không thêm system PATH hoặc tạo Windows service. Server lắng nghe tại `127.0.0.1:11434`, đặt `OLLAMA_NO_CLOUD=1`; model nằm trong thư mục dự án đã chọn. Đường dẫn máy hiện tại lưu ở `.cache/ollama-location.json`, không đưa lên Git. Chạy lại script cùng thư mục để dùng runtime đã có. Không dùng một server Ollama ngoài dự án để tải model mới của Trozy.

Theo [quy tắc lưu trữ dự án](../../AGENTS.md), thư viện/model/runtime/cache/log/dataset riêng của Trozy phải nằm trong dự án: `node_modules/`, `.runtime/ollama/`, `.runtime/paddleocr/`, `.runtime/meter-digits/`, `.cache/npm/` và `data/`. Mỗi lượt Codex dùng thư mục tạm riêng trong dự án, đặt `TEMP`/`TMP`/`TMPDIR` thích hợp và dọn đúng phần do lượt đó tạo khi xong; không xóa ảnh gốc/model/database/báo cáo.

**Vị trí dự án và runtime từ 29/10/2026:** `D:\Trozy`, với Ollama/model ở `.runtime/ollama/` và Python/PaddleOCR/model ở `.runtime/paddleocr/`. Đã sao chép và kiểm chứng toàn bộ tệp dự án/runtime bằng SHA-256, tái sử dụng model hiện có. Kiểm tra trạng thái, kiểm thử và build chạy được tại vị trí mới. Báo cáo lịch sử giữ nguyên đường dẫn cũ; [báo cáo hiện tại](../test/METER-GUIDED-VALIDATION.md) phân biệt kiểm thử logic với kết quả model thật.

Không chạy `ollama serve` lần nữa nếu Ollama đã chạy nền. Khởi động Trozy bằng `npm run dev`, mở **Trợ lý Trozy** và nhấn **Kiểm tra**. Capability của B01–B04 biểu thị đã có provider cục bộ, không thay thế kiểm tra model đã tải/sẵn sàng.

Khi đã có `.cache/ollama-location.json`, `npm run dev` tự mở runtime đã chuẩn bị nếu chưa chạy, không tự tải file. `npm run ai:start` mở riêng; `npm run ai:stop` chỉ dừng tiến trình có PID và đường dẫn trùng runtime Trozy. Các server Ollama đã chạy từ trước không bị tiến trình web tự dừng. `npm run ai:check` kiểm tra trạng thái; `npm run ai:live-check` gọi model thật với dữ liệu tổng hợp riêng và ghi minh chứng.

### Chuẩn bị PaddleOCR

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-paddle-ocr.ps1
```

Script dùng Python portable 3.11.9, PaddleOCR 3.7.0, PaddleX 3.7.2 và ONNX Runtime CPU 1.23.2; không cần PaddlePaddle GPU, API key hoặc cài Python vào hệ thống. Hai model `PP-OCRv6_small_det`/`PP-OCRv6_small_rec` cùng thư viện/cache ở `.runtime/paddleocr/`. Môi trường đã chuyển đúng vị trí được dùng lại sau kiểm tra phiên bản và SHA-256 trọng số. Backend gọi gói `paddleocr` đã cài, không phụ thuộc đường dẫn checkout `PaddleOCR-main` của người dùng.

Mặc định `TROZY_OCR_ENGINE=auto`: ưu tiên PaddleOCR khi các file cục bộ đã sẵn sàng; chuyển sang Tesseract khi môi trường Paddle chưa sẵn sàng hoặc lỗi thực thi, kèm cảnh báo và tên engine thực tế. Lỗi ảnh không hợp lệ/vượt giới hạn không dùng fallback để bỏ qua kiểm tra đầu vào. `paddleocr` yêu cầu provider Paddle; `tesseract` chọn riêng provider cũ. Đọc ảnh không tải trọng số, không gửi ảnh lên cloud và không lấy chỉ số cũ làm đầu vào model. Đặt biến môi trường ở backend rồi khởi động lại khi đổi cấu hình.

Nguồn mã, giấy phép model, trọng số đã dùng và yêu cầu giữ thông báo khi phân phối ở [THIRD-PARTY-NOTICES.md](../../THIRD-PARTY-NOTICES.md). Giấy phép Apache-2.0 đầy đủ được giữ trong [licenses/PaddleOCR-Apache-2.0.txt](../../licenses/PaddleOCR-Apache-2.0.txt); setup sao chép thông tin này vào thư mục môi trường trong dự án.

## Cấu hình backend

Đặt trong `.env` tại gốc hoặc môi trường backend rồi khởi động lại:

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Chỉ localhost/loopback; từ chối URL client, đường dẫn, thông tin đăng nhập và redirect. |
| `TROZY_AI_MODEL` | `qwen3:4b-instruct` | Model cục bộ; từ chối tag cloud. |
| `TROZY_AI_ENABLED` | Bật | `false`/`0` tắt gọi model B01/B03/B04; truy vấn/quy tắc và B02 vẫn chạy cục bộ. B03 thiếu định vị/kiểm tra Vision không tạo đề xuất, chủ nhà nhập tay được. |
| `TROZY_AI_AUTO_START` | Bật | `false`/`0` tắt tự mở runtime đã lưu khi chạy `npm run dev`; không làm phát sinh tải model. |
| `TROZY_AI_TIMEOUT_MS` | `60000` | Chờ model, bị giới hạn trong code ở 100–120000 ms; lượt đầu có thể chậm khi tải vào bộ nhớ. |
| `TROZY_OCR_TIMEOUT_MS` | `45000` | Chờ OCR, giới hạn 5000–90000 ms. |
| `TROZY_OCR_ENGINE` | `auto` | `auto`, `paddleocr` hoặc `tesseract`; do backend cấu hình, client không chọn đường dẫn runtime/model. |
| `TROZY_PADDLE_ROOT` | `.runtime/paddleocr` | Thư mục trong dự án chứa `python/python.exe`, hai model tại `models/`, thư viện và cache; không nhận đường dẫn ngoài dự án. |
| `TROZY_PADDLE_THREADS` | `4` | Số luồng CPU Paddle, giới hạn 1–8. |
| `TROZY_VISION_MODEL` | `qwen3-vl:4b-instruct` | Model đọc ảnh riêng; kiểm tra đã tải, có capability `vision` và không dùng backend cloud. |
| `TROZY_VISION_TIMEOUT_MS` | `90000` | Ngân sách chung cho kiểm tra khung/đọc ô/đọc dự phòng, giới hạn 100–180000 ms; lỗi/quá hạn giữ bằng chứng OCR và cảnh báo. |
| `TROZY_METER_ELECTRIC_TOLERANCE` | `1` | Chỉ dùng thử nghiệm `vision-guided-ocr` cũ; không tham gia chế độ `ocr-vision-assisted` hiện hành. |
| `TROZY_METER_WATER_TOLERANCE` | `1` | Ngưỡng thử nghiệm lịch sử tương tự theo m³; không tham gia chế độ hiện hành. |

Không cần OpenAI/Anthropic API key. Muốn dùng dịch vụ khác cần adapter và đánh giá lại dữ liệu gửi đi; bản hiện tại chỉ kết nối Ollama loopback.

## B01 Trợ lý vận hành

Mở **Trợ lý Trozy**, chọn cơ sở rồi hỏi, ví dụ “Phòng nào còn nợ tiền?”, “Giải thích hóa đơn gần nhất của tôi”, “Hợp đồng nào sắp hết hạn?”, “Nội quy nhà trọ quy định những gì?” hoặc “Soạn thông báo nhắc thanh toán”. Trả lời có nguồn để mở phân hệ liên quan. Số tiền được tính từ sổ dữ liệu; không giao cho model tự quyết định tổng. Lịch sử hỏi đáp lưu riêng theo tài khoản; hội thoại gần đây được giới hạn theo cơ sở khi dùng làm ngữ cảnh.

Bản nháp thông báo **chưa được gửi**. Chủ trọ chọn cơ sở/phòng, sửa hoặc kiểm tra nội dung và nhấn **Xác nhận gửi thông báo**. Tenant không gửi thông báo thay chủ trọ. Trợ lý không tự nhận tiền, sửa hợp đồng hoặc khấu trừ cọc.

## B02 Cảnh báo điện nước

Mở **Tiêu thụ điện nước → Cảnh báo điện nước**. Lọc phòng/chọn kỳ hoặc để trống để xem kỳ mới nhất. Bộ phân tích dùng lịch sử đã xác nhận, mức tham chiếu trung vị được chuẩn hóa, ngưỡng cấu hình và mức thay đổi thực tế. Khi thiếu ít nhất ba kỳ trước, báo thiếu lịch sử thay vì kết luận bình thường/bất thường.

Cảnh báo hiển thị phòng/kỳ, mức dùng, tham chiếu, chênh lệch, giải thích và đề nghị kiểm tra. Chủ trọ chỉnh ngưỡng ở **Cài đặt → Nhắc lịch**. Người dùng ghi chú kiểm tra hoặc mở lại cảnh báo; không tự sửa chỉ số/hóa đơn. Thông báo trong ứng dụng được chống trùng; kết quả không tự kết luận rò rỉ hoặc hỏng thiết bị.

## Lịch sử B03: hybrid OCR trước Vision

Phần mô tả và các lệnh/minh chứng B03 từ đây đến trước B04 thuộc các mốc lịch sử. `meter-vision.mjs`/`meter-consensus.mjs` vẫn phục vụ thử nghiệm hoặc snapshot cũ; luồng hiện hành dùng [OCR ưu tiên với Vision dự phòng](METER-OCR-VISION-ASSISTED.md). Không gán lại kết quả cũ thành thử nghiệm của pipeline mới.

Chủ trọ mở **Điện & nước → Đọc ảnh công tơ** hoặc bật công cụ OCR trong form ghi chỉ số:

1. Chọn phòng/kỳ; chỉ số đầu kỳ đối chiếu dữ liệu đã chốt.
2. Chọn ảnh điện/nước rõ nét, kiểu mặt số nếu biết; có thể giới hạn vùng mặt số theo tọa độ pixel ảnh gốc sau EXIF. Giữ dấu thập phân và đơn vị. Vision dùng toàn cảnh cùng vùng số đã xoay đúng chiều khi có vùng phù hợp.
3. Nhấn **Đọc bằng Vision + OCR**, xem vùng bộ đếm, hai quan sát riêng và trạng thái đối chiếu. Nếu có nhiều vùng hoặc chưa xác định rõ, chọn khung bộ đếm trên ảnh hay nút **Chọn vùng**, rồi nhấn **Đọc lại vùng này**. Chọn vùng xóa kết quả cũ và điền tọa độ crop; lần đọc mới chỉ bắt đầu khi nhấn nút. Kết quả chính chỉ xuất hiện khi đã xác định đúng vùng, khớp toàn bộ chữ số, cách đọc đủ rõ và không có bằng chứng mâu thuẫn.
4. Khi có kết quả đồng thuận, xác nhận đã đối chiếu ảnh rồi **Áp dụng** vào ô chỉ số mới. Nếu có phần lẻ, xác nhận rõ việc ghi phần nguyên theo biểu mẫu hiện tại. Khi chưa đồng thuận, đọc lại/chọn vùng khác hoặc nhập tay trong form; không chọn một ứng viên mâu thuẫn để áp dụng.
5. Kiểm tra cả form, xác nhận cuối cùng và **Lưu chỉ số** qua API nghiệp vụ thường.

OCR không tự xác nhận/lưu bản ghi; nhập tay luôn dùng được. Ảnh tối đa 5 MB, PNG/JPEG/WebP; kiểm tra định dạng thật, tối đa 12 triệu pixel và vùng crop. Không nhận URL, đường dẫn filesystem hoặc PDF. Hàng đợi chỉ xử lý một job và tối đa hai job chờ; subprocess bị dừng khi quá hạn.

Ảnh tải từ web có thể mang đuôi `.jpg` nhưng dữ liệu thật là PNG hoặc WebP. Upload nhận diện header để lưu/phục vụ đúng MIME; cả OCR và Vision kiểm tra định dạng thật bằng bộ giải mã, chấp nhận ba định dạng được hỗ trợ kể cả khi MIME trình duyệt khai báo khác. Ảnh đã tải lên trước bản sửa cũng đọc được mà không phải sửa database. Tệp hỏng, GIF/SVG/PDF hoặc dữ liệu không phải PNG/JPEG/WebP vẫn bị từ chối với hướng dẫn xuất lại ảnh; đổi tên đuôi không chuyển đổi định dạng.

PaddleOCR dùng model phát hiện chữ và nhận dạng để trả văn bản cùng polygon; các quan sát theo hướng ảnh được giữ riêng. Pipeline đọc toàn cảnh ở 0°, 90°, 270° và tối đa hai vùng xác nhận mỗi hướng: tối đa chín nhóm bằng chứng. Khi có hàng bị tách ký tự, tối đa hai crop mỗi hướng được model nhận dạng dòng đọc nguyên ảnh trước lượt xác nhận; đây là các lời gọi model bổ sung, không ghép chữ số. Vùng nghiêng được làm thẳng từ tứ giác rồi tọa độ được chiếu về ảnh nguồn. Đây là nhiều lượt cùng engine, không phải các bộ đọc độc lập. Văn bản OCR gốc giữ nguyên. Hiện OCR đủ thì không đọc chữ số Vision. OCR thiếu đúng một ô có vị trí rõ có thể được bổ sung; khi chưa có đề xuất, bước Vision dự phòng có thể chép lại toàn hàng theo hợp đồng hiện hành phía trên. Đề xuất cuối ghi rõ nguồn và giữ nguyên quan sát gốc.

Module `meter-regions.mjs` phân loại tối đa 12 vùng thành `counter`, `serial`, `specification`, `inspection_label`, `unknown`. Dấu hiệu gồm cửa sổ bánh số/LCD, nhóm màu, đơn vị tích lũy, trọng số in và nhãn lân cận; nhãn sê-ri/thông số/năm có thể loại một vùng dù OCR đọc lặp lại rất ổn định. Các polygon trùng trên nhiều hướng được gộp theo vùng vật lý. Chỉ một vùng bộ đếm phù hợp mới được chọn tự động; nhiều vùng là `ambiguous`, thiếu bằng chứng là `unresolved`. Đây là quy tắc hình học/bố cục có giới hạn, chưa phải model phát hiện công tơ mới được huấn luyện.

API giữ `sourceRectangle` theo pixel ảnh gốc sau EXIF, bao gồm bù crop và xoay, để UI vẽ đúng khung. UI hiện tối đa sáu lựa chọn `counter`/`unknown`; các vùng sê-ri/thông số/nhãn kiểm định vẫn xem được trong phần bằng chứng đã loại. Người dùng có thể chọn vùng thủ công khi detector bỏ sót. Chọn vùng chỉ thay phạm vi ảnh để đọc lại, không xác nhận chữ số, không tự gọi API và không tự lưu bản ghi.

Với PaddleOCR, chuỗi chưa có dấu phân cách như `012345` vẫn chỉ là bằng chứng chữ số, kể cả khi đọc được `kWh` bên cạnh: đơn vị đó không chứng minh công tơ không có bánh số thập phân. Provider có thể giữ ứng viên nội bộ khi có dấu thập phân và đơn vị phù hợp, nhưng API B03 chỉ trả lựa chọn áp dụng sau bước đồng thuận cả hai engine. Nhãn sê-ri/thông số ở vùng lân cận được dùng để loại các dãy `S/N`, `Serial`, `Q3`, điện áp/tần số khỏi đối chiếu chỉ số.

Phần định dạng OCR giữ riêng `digits`, `integerDigits`, `fractionalDigits`, `unit` và nguồn bằng chứng. Với vùng số ổn định, phân tích RGB có thể nhận nhóm chữ đen/đỏ trên nền sáng hoặc nhóm bánh đếm nền đen/đỏ. Ví dụ ảnh đồng hồ cũ có chuỗi `13038`, nhóm đen `1303`, nhóm đỏ `8`, nên biểu diễn được `1303.8`; đơn vị vẫn là `unknown` khi OCR không thấy nhãn. Đây chưa phải kết quả `1303.8 m³` hoàn chỉnh. Nhóm màu chưa tự chứng minh hệ số/phần lẻ của từng loại công tơ, vì vậy riêng màu không đủ để đặt `complete:true`. Nếu OCR đọc được các trọng số vị trí `1/10`, `1/100`… ở ngay bộ đếm, khớp số lượng/vị trí ô đỏ, định dạng ghi `boundarySource:'printed-weights'` cùng `scaleEvidence` đã kiểm tra; có chuỗi ổn định và đơn vị đọc được mới đủ điều kiện diễn giải OCR hoàn chỉnh. Ngoài bằng chứng đó hoặc dấu phân cách thực tế, quy ước còn do Vision nhận dạng và được ghi nguồn. Không lấy lựa chọn “nước/điện”, lịch sử hoặc đáp án Vision để đặt đơn vị/dấu phân cách cho OCR. Màu không rõ, bố cục không phù hợp hoặc các lượt không thống nhất thì giữ nguyên chuỗi chưa diễn giải.

Khi chọn Tesseract, provider cũ tự tìm tối đa hai hàng chữ số phù hợp từ các cụm điểm ảnh, kiểm tra độ thẳng hàng/khoảng cách, tách và chuẩn hóa kích thước từng ký tự trước khi đọc. Nhóm nền đen/đỏ được quan sát từ RGB; Tesseract đọc một số biến thể ảnh trong ngân sách tối đa 9 lượt nhận dạng. Chuỗi chỉ được coi là ổn định khi các biến thể cùng khớp số ký tự hình học và không có kết quả cạnh tranh. Cả hai provider độc lập với Vision; không nhận đáp án từ model hoặc lấy chỉ số kỳ trước để đoán chữ số. Chưa có bộ đọc bảo đảm cho mọi loại đồng hồ.

Ở lượt cải tiến Tesseract trước đây trên ảnh nước đã cung cấp, OCR đọc ổn định nhóm đen `00001` ở hai biến thể, điểm văn bản `94` và `93`; toàn hàng và nhóm đỏ chưa ổn định. Minh chứng cũ chỉ đối chiếu được phần nguyên và được giữ tại [OCR-IMPROVEMENT.md](../test/OCR-IMPROVEMENT.md). Theo cơ chế hiện tại, khớp phần nguyên như vậy **không đủ điều kiện hiện kết quả chính hoặc áp dụng**.

Có thể kiểm tra riêng OCR, không cần Ollama:

```powershell
npm run ai:ocr-check -- --file 'E:\Downloads\meter.jpg' --utility water
```

Lệnh dùng provider được backend cấu hình, mặc định `auto`. `--expected-black` chỉ kiểm tra đáp án sau khi OCR hoàn tất, không đưa chữ số mong đợi vào bộ nhận dạng; tùy chọn đó phù hợp với ca Tesseract có bằng chứng nhóm nền đen và không có nghĩa mọi provider đều tách nhóm màu. Tùy chọn `--evidence 'docs/test/ocr-result.json'` ghi kết quả, vùng phát hiện và các lượt thử; không sao chép ảnh.

Vision nhận ảnh toàn cảnh và vùng số có phần ngữ cảnh lân cận đã xoay thẳng theo hình học vùng được chọn. Chỉ tọa độ/góc xoay được dùng để chuẩn bị ảnh; không đưa chuỗi số, điểm OCR, chỉ số cũ hoặc đáp án mong đợi vào prompt. Model phải xác minh độc lập `regionRole:'counter'`, có quyền từ chối crop sê-ri/năm/thông số và không nhận crop tự chọn lớn nhất khi trạng thái vùng còn mơ hồ. Hướng dẫn nhận cả màu **chữ hoặc nền**, không thêm số 0 theo độ dài công tơ thường gặp, không suy ra đơn vị từ kiểu đồng hồ và không lẫn các kim thử nhỏ. Hai bộ nhóm trường cơ học/điện tử loại trừ nhau; mâu thuẫn vẫn bị đánh dấu cần kiểm tra, không dùng OCR để sửa câu trả lời model.

Nếu JSON Vision tự mâu thuẫn giữa kiểu hiển thị, nhóm trường và bằng chứng phần lẻ, reader có thể yêu cầu tự kiểm tra thêm đúng một lần trên **cùng ảnh**, trong cùng ngân sách timeout (tối đa hai lần gọi). Lượt này không phải phiếu đồng thuận độc lập và không được cung cấp chữ số OCR. Nếu chữ số, đơn vị hoặc vai trò vùng thay đổi, kết quả giữ không đọc chắc và không áp dụng.

Model giữ màu ảnh để phân biệt bộ số cơ học và phần thập phân; bộ số điện tử dùng dấu chấm/phẩy thực tế. Công tơ điện cơ cũng có thể có ô đỏ phần lẻ: Vision chỉ chấp nhận khi đọc rõ trọng số vị trí in như `1/10` tương ứng từng ô, không suy từ màu đỏ hoặc nhãn trên kim tròn. Công tơ nước cơ cần quy ước nhóm đỏ cùng đơn vị `m³` nhìn thấy phù hợp. Đơn vị không rõ được giữ `unknown`. Chọn loại điện/nước chỉ dùng để kiểm tra kết quả sau nhận dạng. So sánh lịch sử thực hiện bằng code sau khi đọc.

Trạng thái gồm `agreed`, `vision_only`, `ocr_only`, `conflict`, `unreadable`, `needs_review`. `confirmedReading` chỉ có khi vai trò bộ đếm đã được xác minh, Vision đọc hợp lệ và OCR độc lập khớp **toàn bộ chuỗi**, giữ đúng cả số 0 đầu; phần nguyên khớp hoặc chỉ bằng nhau về giá trị số chưa đủ. Dấu phân cách/nhóm màu/đơn vị OCR đã quan sát được phải phù hợp với Vision. Khi OCR chỉ xác nhận được chữ số, giao diện nêu rõ đơn vị hoặc cách chia phần lẻ còn do Vision nhận dạng; không gọi đó là cả hai engine đã xác nhận độc lập cách đọc đầy đủ.

Một engine chưa đọc được, chỉ khớp phần nguyên, thiếu đơn vị/quy ước hoặc có xung đột thì API trả `candidates: []`, `suggestedValue: null`, `confirmedReading: null`; UI giữ hai quan sát trung tính và không có nút áp dụng. Mặt kim, nhiều màn chỉ số không phân biệt được và số đang chuyển tiếp cần kiểm tra thủ công. Kết quả thấp hơn chỉ số cũ giữ trong bằng chứng để kiểm tra phòng/kỳ/thay đồng hồ, không thành đề xuất áp dụng.

Đã bỏ nhãn “độ tin cậy OCR 95%” trên kết quả chính. Điểm OCR chỉ nằm trong chi tiết với nhãn điểm nhận dạng văn bản, không phải xác suất đọc đúng công tơ; văn bản rỗng trả điểm 0. Vision không tự đặt phần trăm độ chính xác. Điện biểu diễn bằng **kWh**, nước bằng **m³**; số trên đồng hồ là **chỉ số tích lũy**, không phải lượng dùng riêng của kỳ hiện tại. Mức dùng trong kỳ được tính từ chỉ số mới trừ chỉ số cũ theo nghiệp vụ, không đổi nhãn thành kg.

Luồng nghiệp vụ hiện ghi **chỉ số nguyên**: khi đã đủ điều kiện đồng thuận, dãy như `00001.056 m³` vẫn hiển thị đầy đủ; chỉ dùng phần nguyên `1` sau khi người dùng xác nhận rõ quy ước. Không tự bỏ phần lẻ khi chưa xác nhận, không ghép thành `1056`, không lưu mất ảnh/bằng chứng và không tự chốt hóa đơn. OCR giấy tờ/CCCD không thuộc B03 này.

Kiểm tra ảnh thật qua HTTP với database trong bộ nhớ (không chạm dữ liệu demo), ví dụ:

```powershell
npm run ai:vision-check -- --file 'E:\Downloads\meter.jpg' --utility water --expected-display 00001.056
```

Lệnh cần model đang sẵn sàng, kiểm tra kết quả Vision với chuỗi mong đợi sau khi nhận dạng, đối chiếu chỉ số cũ do server quyết định, lịch sử và bản ghi nghiệp vụ không bị sửa. Chỉ dùng `--expected-value` cho ca phải có đồng thuận đủ điều kiện đề xuất; Vision đọc đúng một mình chưa đủ để kỳ vọng số áp dụng. Tùy chọn `--evidence 'docs/test/ten-file.json'` lưu JSON kiểm chứng, không sao chép ảnh. Một ảnh đúng không đủ chứng minh chất lượng cho các loại đồng hồ khác; cần tập ảnh được gán nhãn theo loại mặt số, điều kiện sáng/góc và độ rõ để đo tỷ lệ đúng cả dãy cùng tỷ lệ từ chối đọc.

Kế hoạch dữ liệu, cách tách theo thiết bị và các chỉ số cần đo ở [METER-EVALUATION.md](../test/METER-EVALUATION.md). Ảnh dùng trong quá trình sửa prompt là ca hồi quy, không phải tập đánh giá độc lập.

### Minh chứng thử PaddleOCR trước tích hợp

Trước khi tích hợp provider, đã chạy PP-OCRv6 small từ source `PaddleOCR-main` người dùng tải, qua ONNX Runtime CPU 4 luồng. Python portable, model và cache nằm tại `D:\TrozyOCRTrial`. Lượt thử riêng không gọi Vision, mở database hay lưu chỉ số; các số đo dưới đây mô tả đúng lượt thử đó.

Hai ảnh đồng hồ nước thật, một ảnh điện tổng hợp và hai ảnh đối chứng tạo thành 13 biến thể cố định. Ảnh đồng hồ cũ: Paddle đọc được hai vùng `1303` và `8` trên ảnh gốc; bản xoay 270° đọc được chuỗi `13038`, trong khi Tesseract không đọc được dãy. Đây là bằng chứng cải thiện nhận chữ, chưa xác nhận đơn vị hoặc vị trí thập phân. Ảnh đồng hồ xanh vẫn xuất hiện dấu `:` không đúng trong `000010:56m`; các bản xoay còn mất số 0 đầu. Vì vậy chưa dùng văn bản Paddle làm chỉ số tính tiền và chưa công bố tỷ lệ chính xác.

Kết quả từng ảnh, tọa độ vùng chữ, thời gian, RAM và giới hạn ở [PADDLEOCR-TRIAL-RESULTS.md](../test/PADDLEOCR-TRIAL-RESULTS.md); dữ liệu gốc của phép đo ở [PADDLEOCR-TRIAL.json](../test/PADDLEOCR-TRIAL.json). Cách chạy lại công cụ thử riêng ở [PADDLEOCR-TRIAL-PROTOCOL.md](../test/PADDLEOCR-TRIAL-PROTOCOL.md). Provider đã được bổ sung vào B03 sau phép thử, giữ tọa độ và chuỗi gốc để kiểm tra/đối chiếu; kết quả của phép thử không tự chứng minh mọi ảnh qua ứng dụng đều được đọc đúng.

### Minh chứng tích hợp PaddleOCR ban đầu

Lượt tích hợp ban đầu ngày 27/10/2026, trước thay đổi Vision/đồng thuận mới, đã chạy thành công **124 kiểm thử Node**, **22 ca UI**, **132 lượt render trang/vai trò/cơ sở** và build production. Các tệp dưới đây được giữ nguyên như minh chứng lịch sử, không phải kết quả chạy lại của phiên bản hiện tại. Kiểm tra PaddleOCR thật qua HTTP dùng database trong bộ nhớ, tắt Vision để xác định đúng bằng chứng của riêng provider; không chạm database demo.

| Đầu vào | Kết quả qua API B03 | Minh chứng |
| --- | --- | --- |
| Ảnh điện tổng hợp | Chuỗi `012345` đọc lặp lại ổn định và có đơn vị `kWh`; quy ước phần thập phân còn chưa xác định nên không đề xuất `12345`. Khi chưa bật Vision, kết quả cần kiểm tra (`needs_review`). | [PADDLEOCR-INTEGRATION-ELECTRIC-LIVE.json](../test/PADDLEOCR-INTEGRATION-ELECTRIC-LIVE.json) |
| Ảnh đồng hồ nước cũ | Chuỗi `13038` ổn định; đơn vị và quy ước thập phân còn `unknown`, không đề xuất số tính tiền. | [PADDLEOCR-INTEGRATION-WATER-LIVE.json](../test/PADDLEOCR-INTEGRATION-WATER-LIVE.json) |
| Ảnh đồng hồ nước xanh | Giữ nguyên `000010:56m` trong văn bản thô và cảnh báo dấu `:`; không tạo register hoặc đề xuất số tính tiền từ chuỗi này. | [PADDLEOCR-INTEGRATION-BLUE-LIVE.json](../test/PADDLEOCR-INTEGRATION-BLUE-LIVE.json) |

Cả ba lượt xác nhận các bản ghi nghiệp vụ không bị thay đổi sau nhận dạng; chỉ số kỳ trước và lịch sử AI dùng giá trị server xác định thay cho giá trị client gửi. Các phép thử này kiểm tra tích hợp, khả năng từ chối và giữ bằng chứng; không phải tập ảnh độc lập để suy ra độ chính xác trên các công tơ khác. Bộ 13 biến thể ở mục trên vẫn là phép thử riêng trước tích hợp.

Ở lượt cũ, Vision đọc ảnh nước xanh thành `00001.056 m³`, PaddleOCR giữ văn bản có dấu `:` chưa đủ điều kiện xác nhận. Tệp [PADDLEOCR-VISION-INTEGRATION-LIVE.json](../test/PADDLEOCR-VISION-INTEGRATION-LIVE.json) giữ kết quả `vision_only` lúc đó. Phiên bản mới không cho áp dụng từ trạng thái này dù Vision đọc hợp lý.

Trên ảnh điện tổng hợp ở lượt cũ, Paddle đọc ổn định `012345` nhưng Vision trả `red_digits` khi không có phần lẻ. Phép kiểm tra yêu cầu Vision đọc được đã thất bại; bộ kiểm tra nghiệp vụ giữ `readable:false`, `needs_review` và không đề xuất chỉ số. [PADDLEOCR-VISION-ELECTRIC-LIVE.json](../test/PADDLEOCR-VISION-ELECTRIC-LIVE.json) ghi việc từ chối đó; cờ `passed` chỉ nói về hợp đồng tích hợp/từ chối, không phải Vision đọc đúng. Không dùng OCR để sửa câu trả lời model; reader mới được kiểm tra lại riêng ở mục tiếp theo.

### Minh chứng lịch sử của đồng thuận toàn chuỗi

Lượt trước cải tiến chọn vùng đã đạt **142 kiểm thử Node**, **23 ca tương tác UI**, **132 lượt render trang/vai trò/cơ sở** và build production. Các số liệu và JSON trong mục này được giữ làm minh chứng lịch sử, không phải kết quả chạy lại của bản chọn vùng hiện tại. Ba lượt HTTP dưới đây đều xác nhận không đổi bản ghi nghiệp vụ; lịch sử và chỉ số kỳ trước dùng giá trị server xác định, không nhận giá trị client gửi làm đáp án.

Reader đã được thử bằng model cục bộ trên cùng các ca hồi quy: đồng hồ cũ đọc đúng nhóm `1303`/`8`, biểu diễn `1303.8` nhưng đơn vị `unknown`; ảnh điện tổng hợp đọc `012345 kWh`, không có phần lẻ; ảnh nước xanh đọc `00001.056 m³`. Đây là các ca dùng trong phát triển, không phải tập đánh giá độc lập hay bảo đảm model luôn đọc đúng.

Minh chứng HTTP của luồng mới, dùng database trong bộ nhớ và kiểm tra các bản ghi nghiệp vụ không đổi:

| Ca | Ý nghĩa cần kiểm tra | Minh chứng |
| --- | --- | --- |
| Đồng hồ cũ | OCR phân tích nhóm màu thành `1303.8`, Vision không thêm số 0; đơn vị chưa rõ nên không có kết quả chính để áp dụng. | [METER-CONSENSUS-WEATHERED-LIVE.json](../test/METER-CONSENSUS-WEATHERED-LIVE.json) |
| Điện tổng hợp | OCR và Vision khớp toàn chuỗi `012345`, kết quả chính `012345 kWh`, giá trị biểu mẫu `12345`. Đơn vị được cả hai quan sát; quy ước không phần lẻ do Vision nhận dạng và được ghi rõ. | [METER-CONSENSUS-ELECTRIC-LIVE.json](../test/METER-CONSENSUS-ELECTRIC-LIVE.json) |
| Nước xanh | Vision có thể đọc `00001.056 m³` nhưng OCR còn dấu `:`/dãy chưa ổn định; chỉ giữ quan sát riêng, không áp dụng kết quả Vision đơn lẻ. | [METER-CONSENSUS-BLUE-LIVE.json](../test/METER-CONSENSUS-BLUE-LIVE.json) |

Thời gian toàn luồng của ba lượt khoảng 9–10 giây, gồm khởi tạo, OCR, chuẩn bị ảnh và Vision; xem `elapsedMs` trong từng JSON. Luồng cần OCR lấy hình học trước rồi Vision mới đọc vùng đã chuẩn bị, nên số đo này không tương đương một lượt inference nóng trên ảnh. Không suy ra độ chính xác chung từ ba ca hồi quy.

Thời gian OCR qua API gồm khởi động tiến trình Python/model và các lượt nhận dạng trong ngân sách; xem `elapsedMs` trong từng báo cáo JSON của phiên bản hiện tại. Không dùng số đo inference nóng khoảng 0,7 giây của phép thử trước để mô tả độ trễ toàn luồng trên web. Khi bật Vision, thời gian và kết quả còn phụ thuộc phản hồi Ollama.

Chạy lại kiểm tra provider qua HTTP, không cần Ollama:

```powershell
# Mặc định dùng ảnh điện tổng hợp trong repo và kiểm tra register 012345.
npm run ai:paddle-check
# Hoặc ảnh công tơ của bạn; không cung cấp đáp án cho model.
npm run ai:paddle-check -- --file 'E:\Downloads\meter.jpg' --utility water
```

Script này chủ động chọn PaddleOCR và tắt Vision trong tiến trình kiểm tra; ứng dụng đang chạy không bị đổi cấu hình. Tùy chọn `--expected-register` chỉ đối chiếu sau nhận dạng, `--evidence` lưu báo cáo JSON khi cần. Đây không phải lệnh khởi động web; để xem luồng Vision + OCR và xác nhận trên giao diện, chạy `npm run dev` như hướng dẫn thông thường.

Tùy chọn `--with-vision true` của công cụ kiểm tra bật model thật và kiểm tra cả việc từ chối an toàn khi model chưa đọc rõ. Nó không mặc định đòi hỏi mọi ảnh đều được Vision đọc thành công. Muốn kiểm tra một ca phải đọc được với giá trị cụ thể, dùng `ai:vision-check` ở trên.

### Cải tiến ảnh nhiều dãy số — 28/10/2026

Sáu ảnh người dùng cung cấp được dùng để sửa lỗi chọn năm sản xuất/sê-ri thay cho bộ đếm, giữ nguyên chữ OCR và giới hạn áp dụng khi chưa đọc đủ ô số. Bản mới kiểm tra vai trò trước đồng thuận chữ số, hỗ trợ vùng nghiêng và trọng số phần lẻ điện cơ, đồng thời cho chọn lại khung trên ảnh. Kết quả từng ảnh, lệnh tái hiện, kiểm thử và giới hạn ở [METER-REGIONS-IMPROVEMENT.md](../test/METER-REGIONS-IMPROVEMENT.md). Đây là các ảnh hồi quy dùng trong phát triển; chưa có tập đánh giá độc lập để công bố tỷ lệ chính xác hoặc bảo đảm mọi ảnh đều đọc được.

## B04 Phân loại sửa chữa

Nhập mô tả trong form phiếu rồi nhấn **Gợi ý loại sự cố & mức ưu tiên**. Xem engine thực tế, loại, ưu tiên, lý do, chú ý an toàn và bước kiểm tra đề xuất. Nhấn **Áp dụng gợi ý vào phiếu**, chỉnh lại nếu cần rồi tự gửi phiếu.

Dấu hiệu nguy hiểm như khói/cháy, điện giật, khí gas hoặc sập đổ được giữ ưu tiên cao; model không hạ mức rủi ro đã phát hiện. Quy tắc xử lý một số cách phủ định tiếng Việt nhưng không thay thế xác minh thực tế. Không tự gán chi phí/lịch sửa hoặc chuyển trạng thái đã xử lý/hoàn tất.

## API và nguồn mã

| API | Vai trò |
| --- | --- |
| `GET /api/ai/status` | Trạng thái Ollama/model, OCR và capability; yêu cầu đăng nhập. |
| `POST /api/extensions/B01` … `/B04` | JSON được kiểm tra quyền; trả `{ result }` với engine và dữ liệu tính năng. |
| `GET /api/ai/history?feature=B01` | Tối đa 40 kết quả gần nhất của tài khoản; lịch sử giữ tối đa 200 mục/tài khoản. |
| `POST /api/ai/history/clear` | Chỉ xóa lịch sử của tài khoản hiện tại. |
| `POST /api/ai/alerts/:id/review` | Ghi nhận kiểm tra cảnh báo được phép xem. |
| `POST /api/extensions/B05` | Chưa có provider, trả HTTP 501. |

Module B03 hiện hành: `meter-assisted-reader.mjs`, `meter-assistance.mjs`, `meter-ocr-gap.mjs`, `meter-slot-vision.mjs`, `meter-frame-reader.mjs`, `meter-frame-check.mjs`, `meter-ocr-reader.mjs`, cùng các module OCR/định dạng/Ollama. `meter-reconciled-reader.mjs`, `meter-reconciliation.mjs`, `meter-partial-observation.mjs`, `meter-guided-reader.mjs`, `meter-vision.mjs` và `meter-consensus.mjs` giữ luồng lịch sử. Kiểm tra/lưu lịch sử ở `src/backend/ai-service.mjs`; UI ở `ai-ui.tsx`, `meter-submissions-panel.tsx` và form nghiệp vụ. Schema: [AI-B01-B04-CONTRACT.md](AI-B01-B04-CONTRACT.md).

Provider nhận bản sao dữ liệu đã lọc theo chủ trọ/tenant, không có DB handle/hàm sửa tiền/hợp đồng. ID được kiểm tra trên dữ liệu được cấp; B03 chỉ chủ trọ gọi và chỉ đọc bytes từ file qua ACL. Ngữ cảnh mô hình được giới hạn, loại trường riêng tư không cần thiết. Câu chữ trong tài liệu/câu hỏi không cấp thêm quyền. Native `/api/chat` dùng JSON schema, `stream:false`, `think:false`, timeout và giới hạn request/response; kết quả sai schema/nguồn không được chấp nhận.

Không cộng mọi `payments.amount` như thu mới: `receipt` là nhận tiền, `credit_apply` phân bổ tiền đã nhận, `refund` hoàn tiền. `appliedAmount` và `creditAmount` ghi tăng/giảm từng sổ; cọc có sổ riêng, không tự thành doanh thu. B01 giữ những phân biệt này.

Lịch sử AI chứa câu hỏi/kết quả vận hành; chỉ tài khoản sở hữu đọc/xóa và backup SQLite đầy đủ cũng chứa lịch sử đó. Bản AI cục bộ không gửi câu hỏi, tài liệu hoặc ảnh ra dịch vụ AI bên ngoài; các tích hợp khác như SMTP/VietQR có phạm vi riêng đã ghi ở hướng dẫn.

## Giới hạn và kiểm chứng

B05 chưa có dự báo. B02 là cảnh báo từ lịch sử, không phải dự báo tương lai. Chưa có tập đánh giá đại diện đủ lớn để công bố độ chính xác OCR/phân loại; dữ liệu seed không phải bằng chứng chất lượng thực tế. Model/OCR có mã triển khai không đồng nghĩa đã kiểm thử trên mọi ảnh/cách hỏi. Đối chiếu các kết quả chạy thật và giới hạn UI ở [IMPLEMENTATION-VERIFICATION.md](../test/IMPLEMENTATION-VERIFICATION.md).
