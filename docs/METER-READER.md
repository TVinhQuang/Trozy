# Đọc công tơ: PaddleOCR cho điện, YOLO + VisionState cho nước

Phiên bản thử ngày 01/11/2026 tách bộ đọc theo loại công tơ, giữ luồng **gửi ảnh → đọc nền → đề xuất → chủ nhà xác minh**. Sau thiết lập một lần, ảnh mới được xử lý tự động; ảnh chưa đọc được vẫn có bước chọn vùng hoặc nhập tay. Hỗ trợ hiện tại dành cho công tơ cơ có bánh số; LCD/LED và mặt kim dùng nhập tay.

| Loại công tơ | Bộ tìm vùng và đọc số |
| --- | --- |
| Điện | PaddleOCR PP-OCRv6 small, chạy CPU qua ONNX Runtime; không dùng YOLO hoặc Wheel Reader. |
| Nước | YOLOv8-OBB tìm hàng số, VisionState wheels-v2 đọc bánh; không dùng PaddleOCR. |

Đây là bản thử cách tách engine, chưa chứng minh PaddleOCR tự động đọc tốt hơn trên ảnh điện của Trozy. Trong ba ảnh điện thật đã thử, cả ba chưa đủ bằng chứng để tạo đề xuất tự động; một ảnh đọc được `00766.4 kWh` sau khi chọn vùng. Không bổ sung chữ số bị thiếu để ép ra kết quả.

## Dùng trên web

Khởi động lại backend bằng `npm.cmd run dev`, hoặc `npm.cmd run build` rồi `npm.cmd start`; tải lại trang. Không chạy hai backend trên cùng cổng.

`npm.cmd run dev` kiểm tra API sẵn sàng trước khi mở Vite ở `http://127.0.0.1:5173`. Nếu đã có API Trozy hoạt động, lệnh dùng lại API đó và không mở thêm backend. Proxy lấy đúng `HOST`/`PORT` cấu hình (mặc định API `http://127.0.0.1:3001`). Lệnh `npm.cmd run dev:web` chỉ mở giao diện, cần backend chạy riêng.

1. Vào **Chỉ số điện nước → Ảnh công tơ cần xác minh**. Mở bộ ảnh người thuê gửi, hoặc bấm **Đọc ảnh công tơ** để tải ảnh của chủ nhà cho đúng phòng, kỳ và loại điện/nước.
2. Mục **Đọc công tơ tự động** hiện ngay khi mở bộ ảnh đang chờ xác minh. Nếu chưa có cấu hình, nhập tổng số bánh (kể cả bánh đỏ) và số chữ số phần lẻ theo mặt công tơ, tích kiểm tra rồi bấm **Lưu thiết lập & đọc tự động**. Thiết lập dùng riêng cho từng phòng và điện/nước, được tái dùng ở các kỳ sau; không đoán vị trí thập phân.
3. Với cấu hình đã xác nhận, ảnh mới của người thuê hoặc chủ nhà tự được xếp hàng xử lý ngay sau khi gửi. Không cần mở màn hình chủ nhà, bấm tìm vùng hoặc kéo góc để khởi chạy. Khi có kết quả, chủ nhà nhận thông báo trong ứng dụng; màn hình đang mở tự cập nhật.
4. Đề xuất hiện đầy đủ phần nguyên/phần lẻ, ví dụ `00001.056 m³` hoặc `00766.4 kWh`. Giao diện cho biết bộ đọc được dùng. Điện có mục **Văn bản đã nhận dạng** để đối chiếu hai quan sát OCR. Không có đề xuất nếu thiếu chữ số, sai cấu hình, mâu thuẫn hoặc ảnh chưa rõ. Bấm **Chỉnh vùng / đọc thủ công** để dùng bộ chọn bốn góc, hoặc nhập số sau khi xem ảnh gốc. **Đọc tự động lại** thử lại tác vụ; đề xuất từ engine cũ phải được đọc lại.
5. Bấm **Dùng chỉ số đề xuất** khi đã đối chiếu. Chỉ phần nguyên được điền vào ô xác minh. Nếu có phần lẻ, xác nhận cách ghi phần nguyên; tiếp tục xác nhận đã xem ảnh gốc và ghi chú tối thiểu 10 ký tự trước khi lưu. Sửa số bằng tay sẽ chuyển nguồn xác minh sang thủ công.

Chỉ bước nhận dạng chạy tự động. Người thuê chỉ chụp/chọn và gửi ảnh, xem biên nhận/trạng thái, không nhận đề xuất hay nút xác minh. Chỉ số và hóa đơn không đổi cho tới khi chủ nhà chủ động xác minh. Mỗi kỳ chỉ được chốt sau khi chủ nhà xác minh cả điện và nước. Các ràng buộc chỉ số kỳ trước, phiên bản bản ghi, hợp đồng còn hiệu lực và hóa đơn tiếp tục được kiểm tra.

### Phân biệt chỉ số công tơ và lượng tiêu thụ

Ở **Ghi chỉ số / Chỉnh sửa chỉ số**, chủ nhà chọn cách nhập:

- **Chỉ số trên công tơ:** nhập số tích lũy đầu kỳ và cuối kỳ; lượng dùng = cuối kỳ − đầu kỳ.
- **Lượng tiêu thụ kỳ này:** nhập lượng điện/nước đã dùng; đầu kỳ giữ nguyên, cuối kỳ được tính = đầu kỳ + lượng dùng và chỉ đọc. Ví dụ đầu kỳ 9.000 kWh, dùng 1.200 kWh thì cuối kỳ được tính 10.200 kWh. Lượng 1.200 có thể nhỏ hơn lượng dùng tháng trước.

Đầu kỳ vẫn phải là số tích lũy đã chốt, không phải lượng dùng của tháng trước. Chủ nhà đối chiếu số cuối kỳ được tính với công tơ/ảnh rồi xác nhận lưu. Đổi cách nhập hoặc giá trị sẽ bỏ xác nhận cũ. Ô trống/âm không được lưu; lượng dùng 0 hợp lệ. Mở modal hoặc đổi phòng/kỳ trở về cách nhập chỉ số công tơ.

Đây là công cụ nhập thủ công có tính toán rõ ràng, không phải kết quả OCR được tự xác minh. Dữ liệu/API/hóa đơn vẫn lưu và dùng chỉ số tích lũy; lịch sử không bị diễn giải lại. Không bỏ ràng buộc liên tục và không giả định quay vòng/thay/reset công tơ. Luồng người thuê gửi ảnh và chủ nhà xác minh ảnh không thay đổi.

Thiết lập chỉ lưu số bánh và phần lẻ; mỗi ảnh phải tìm lại vùng, không tái dùng tọa độ của ảnh cũ. Đổi cấu hình làm mất hiệu lực đề xuất cũ. Đổi ảnh/phiên bản/tài khoản hoặc đóng hộp thoại hủy yêu cầu UI cũ và xóa đề xuất đã áp dụng; job nền vẫn độc lập với việc mở hộp thoại. Đề xuất hết hạn sau 30 phút. Bộ chọn vùng thủ công có cạnh **1 → 2** theo chiều đọc, hỗ trợ xoay 90°/180°, bàn phím và nhập tọa độ.

## Runtime và vận hành

### Khi giao diện báo lỗi kết nối

Nếu giao diện vẫn mở nhưng báo máy chủ chưa sẵn sàng, kiểm tra cửa sổ `npm.cmd run dev` và hai địa chỉ `/api/health` trên cổng API và giao diện. API khỏe trả JSON có `ok: true`; nếu API không chạy, Vite không thể chuyển tiếp yêu cầu đọc ảnh. Đây là lỗi kết nối, chưa phải kết quả nhận dạng.

Dev launcher chờ API khi khởi động, cho phép khoảng 15 giây khi backend đang tải lại mã và thử khởi động lại tối đa hai lần với backend do chính nó mở. Nếu API vẫn không hoạt động, launcher dừng giao diện do nó quản lý và in nguyên nhân trong terminal. API được dùng lại không bị launcher dừng. Khi cần chạy lại, dùng `npm.cmd run dev` rồi tải lại trang; không mở thêm backend thủ công trên cùng cổng.

Vite trả lỗi JSON503 rõ ràng khi mất kết nối API. Giao diện cũng phân biệt lỗi kết nối với lỗi nghiệp vụ hoặc phiên đăng nhập, thay vì báo chung “Không thể thực hiện yêu cầu”. Chỉ số/hóa đơn không được ghi khi một yêu cầu đọc ảnh thất bại.

### Runtime cục bộ

Nhánh nước dùng lại runtime/model CPU tại `.runtime/meter-digits/visionstate-yolo/`; không tải hoặc cài lại nhánh nước trong lượt này. Mọi cache, runtime và dữ liệu riêng của Trozy nằm trong dự án. Không gửi ảnh tới dịch vụ AI từ xa.

Máy hiện tại đã có cả hai nhánh. Paddle trước đây đã được gỡ, nên lần này tải lại đúng hai model chính thức đã khóa hash và cài PaddleOCR/PaddleX vào `.runtime/paddleocr/site-packages`; Python portable và ONNX Runtime được dùng lại. Thư viện riêng của Paddle được nạp trước ở tiến trình đọc điện, không thay NumPy/OpenCV của nhánh nước.

Trên máy Windows mới, chạy `npm.cmd run ai:setup-meter-reader` rồi `npm.cmd run ai:setup-paddle-meter`. Script Paddle dùng Python trong `.runtime/meter-digits/visionstate-yolo/python/`, cài thư viện và model vào `.runtime/paddleocr/`, cache trong dự án; không đổi PATH hoặc cài dịch vụ hệ thống. Model cùng cấu hình/bảng ký tự đều được kiểm SHA-256. Kiểm tra lại không tải: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/setup-paddle-meter.ps1 -Offline`. Không dùng script Paddle lịch sử hoặc đường dẫn ngoài dự án làm runtime.

Hai cấu hình độc lập với trợ lý văn bản:

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `TROZY_METER_READER_ENABLED` | `true` | Tắt bằng `false`/`0`; xem ảnh và nhập tay vẫn hoạt động. |
| `TROZY_METER_READER_TIMEOUT_MS` | `30000` | Thời gian một lượt đọc/tìm vùng; giới hạn cấu hình 2–60 giây. |

Bộ đọc xử lý một tác vụ model tại một thời điểm trong backend. Hàng đợi nền được lưu trong SQLite, có khóa tác vụ, tối đa ba lượt thử khi runtime bận/lỗi tạm thời và nút thử lại thủ công. Khi khởi động lại, chỉ các job đã lưu được tiếp tục; không quét lại toàn bộ ảnh lịch sử. Đóng dịch vụ bằng `app.close()` hủy worker đang chạy và giữ job để tiếp tục; nếu tiến trình bị ngắt đột ngột, job được nhận lại sau khi khóa ba phút hết hạn. Worker bị dừng khi hết thời gian. Mỗi tác vụ dùng thư mục tạm riêng dưới `.runtime/tmp/`, chỉ thư mục đó được dọn sau khi worker đóng. Các model không được tải trong lúc nhận dạng.

Nguồn trọng số giữ nguyên từ phép thử: [YOLO stage1](https://huggingface.co/ntarekp/watermeter-yolov8-obb) revision `c00b2752e3ad762eb269a05e1dceb28f48c1f27b` và [VisionState wheels-v2](https://huggingface.co/oleost/visionstate-wheel-reader) revision `563f365a5b377c10c7248517ef2576ac5cee3cbf`. Mã ứng dụng dùng bản preprocessing/giải mã đã kiểm chứng trong `src/ai/meter_wheels.py` và hình học trong `meter_geometry.py`; bản thử trong `scripts/meter-trial/` được giữ nguyên để tái lập báo cáo cũ. Ghi công/giấy phép ở `THIRD-PARTY-NOTICES.md`.

## Giới hạn và ràng buộc dữ liệu

Confidence là điểm nội bộ, không phải xác suất đọc đúng được hiệu chuẩn. Nhánh nước giữ ngưỡng 0,7 và giải mã truyền số/làm tròn bánh cuối của VisionState. Nhánh điện dùng ngưỡng 0,85 cho mỗi quan sát OCR, không tạo confidence giả cho từng bánh và không dùng decoder của VisionState. Số chữ số phần lẻ do chủ nhà xác nhận; không dùng lịch sử tiêu thụ để sửa chữ số.

Hai nhánh vẫn kiểm tra độ phân giải, sáng, tương phản và nét trên vùng gốc. Năng lượng cạnh xét sau khi chỉ thu nhỏ tới tối đa 32×48 pixel mỗi ô; không phóng lớn để vượt kiểm tra độ phân giải. Các ngưỡng này chưa được hiệu chuẩn riêng cho mọi kiểu vùng Paddle, vì vậy có thể từ chối ảnh người nhìn vẫn đọc được.

Nhánh nước tự động yêu cầu đúng một window và một lưới đủ bánh, gần cách đều; giá trị chữ số YOLO không dùng làm chỉ số. Hai hướng 0°/180° được đọc độc lập: nhận một hướng đủ rõ với khoảng cách confidence tối thiểu 0,15, hoặc hai hướng cho cùng kết quả đầy đủ. Mâu thuẫn cần kiểm tra thủ công.

Nhánh điện giữ nguyên văn bản/polygon/điểm OCR. Tự động cần một dòng đủ chữ số theo cấu hình, ngữ cảnh kWh và vùng bộ đếm tối; đọc toàn ảnh và crop phải khớp toàn chuỗi. Bộ chọn vùng thủ công dùng hai lượt trên vùng chủ nhà đã chọn: vùng có ngữ cảnh và hàng cắt sát. Hai lượt này có phạm vi riêng (`automatic` hoặc `owner-region`) và cùng phải chỉ đúng vùng nguồn. Chỉ bỏ khoảng trắng hoặc dấu chấm đúng vị trí cấu hình; không bỏ chữ lạ, ghép dòng, thay O thành 0, điền bánh đỏ bị thiếu hay dùng số sê-ri làm đáp án. Hai lượt trên cùng ảnh vẫn có thể cùng sai, nên luôn cần đối chiếu ảnh.

Backend chỉ đọc ảnh PNG/JPEG/WebP tĩnh tối đa 5 MB, 12 triệu pixel, 8000 pixel mỗi cạnh, phù hợp giới hạn ảnh người thuê được gửi. Màn hình tải ảnh riêng của chủ nhà vẫn giới hạn 3 MB. Ảnh được xoay theo EXIF và chuẩn hóa màu trên server; ảnh trong bộ chọn vùng và ảnh đưa vào worker có cùng hệ tọa độ. PNG sau giải mã bị giới hạn 40 MB. Ảnh gốc không đổi.

API mới tách khỏi các API B03 nhận dạng cũ:

| API | Quyền và tác dụng |
| --- | --- |
| `POST /api/meter/owner-evidence` | Chủ nhà tạo bộ ảnh cho đúng phòng/kỳ, chưa đổi chỉ số. |
| `GET /api/meter/reader/status?utility=electric\|water` | Chủ nhà xem runtime của đúng loại công tơ; tương thích cũ mặc định nước. |
| `GET /api/meter/profile?roomId=...&utility=...` | Chủ nhà xem thiết lập đã xác nhận của công tơ. |
| `PUT /api/meter/profile` | Chủ nhà xác nhận số bánh/phần lẻ; cần version khi sửa, xếp hàng lại ảnh đang chờ của công tơ này. |
| `GET /api/meter/submissions/:id/automatic?fileId=...` | Chủ nhà lấy trạng thái và đề xuất nền của ảnh đang chọn. |
| `POST /api/meter/submissions/:id/automatic/retry` | Chủ nhà thử lại với `{fileId,version}`; không ghi chỉ số. |
| `GET /api/meter/submissions/:id/image/:fileId` | Chủ nhà xem ảnh chuẩn hóa đã được kiểm tra quyền. |
| `POST /api/meter/submissions/:id/locate` | Chủ nhà nhận gợi ý vùng; không đọc/ghi số. |
| `POST /api/meter/submissions/:id/read` | Chủ nhà đọc vùng đã xác nhận; chỉ tạo đề xuất riêng. |
| `POST /api/meter/submissions/:id/review` | Chủ nhà đối chiếu và quyết định lưu hoặc yêu cầu chụp lại. |

Job và đề xuất gắn owner, bộ gửi, phiên bản, ảnh, SHA-256, phiên bản cấu hình và engine được server chọn theo utility. Profile mới đánh dấu `meter-reader-v3`; số bánh/phần lẻ đã xác nhận bằng `visionstate-v2` vẫn được dùng lại. Profile OCR cũ chưa xác nhận không được tự tin dùng. Job/proposal sai engine bị chặn; không quét lại toàn bộ ảnh nghiệp vụ sau khi nâng cấp. Bấm đọc lại cho ảnh cũ nếu cần. Tenant không nhận profile hoặc bằng chứng AI.

Khi xác minh, server kiểm tra lại ảnh/phiên bản/cấu hình/engine, hạn dùng và vùng bằng chứng. Nguồn điện là `paddleocr-and-human`, nước là `wheel-reader-and-human`; nhập tay vẫn là thủ công. Đổi baseline, hợp đồng hoặc chốt kỳ/lập hóa đơn chặn đề xuất. Chỉ số và hóa đơn không tự đổi.

## Kiểm chứng

- [Live hai nhánh qua HTTP trên SQLite RAM](test/METER-UTILITY-SPLIT-LIVE-20261101.json): Paddle chọn vùng đọc điện thật `00766.4`; nước tự động `00001.056`; điện tổng hợp tự động `01234.5` chỉ kiểm tra kỹ thuật. Kiểm tra quyền và xác minh ảnh/phần lẻ; không mở DB thật.
- [Năm ảnh và đối chứng của hai nhánh](test/METER-UTILITY-SPLIT-SAMPLES-20261101.json): ba ảnh điện thật chưa đề xuất tự động; crop tay đọc được một ảnh. Nước xanh đọc tự động, nước cũ cần crop tay. Ảnh trống/số sê-ri riêng không sinh chỉ số. Đây là ảnh tái sử dụng có nhãn tạm của tác nhân, không phải benchmark đại diện.
- `npm.cmd run ai:meter-split-check` kiểm chứng HTTP RAM; `node scripts/run-project.mjs scripts/evaluate-meter-utility-split.mjs` chạy hồi quy model hiện tại. [Biên bản tích hợp](test/METER-UTILITY-SPLIT-20261101.md).

- Lịch sử trước khi tách engine: [báo cáo tự động 31/10](test/METER-AUTOMATIC-LIVE-20261031.json) kiểm chứng nước `00001.056 m³` qua HTTP RAM; [năm ảnh 31/10](test/METER-AUTOMATIC-SAMPLES-20261031.json) dùng YOLO + VisionState cho cả điện/nước, có hai đề xuất. Giữ nguyên làm bằng chứng, không coi là kết quả engine điện hiện tại hoặc độ chính xác đại diện.
- [Báo cáo chọn vùng thủ công trước đó](test/METER-READER-PRODUCTION-LIVE-20261031.json) được giữ nguyên làm bằng chứng lịch sử.
- `npm.cmd test`: kiểm tra backend, phân quyền, provenance, phiên bản/hạn dùng/ảnh thay đổi, timeout/hủy worker, ảnh thật với model cục bộ và fallback.
- `npm.cmd run check:ai-ui`, `npm.cmd run check:pages`, `npm.cmd run build`: tương tác DOM, render theo quyền và TypeScript/Vite.
- `.runtime/meter-digits/visionstate-yolo/python/python.exe -I -B tests/meter-reader-production.test.py`, `tests/meter-automatic.test.py`, `tests/meter-paddle.test.py`: chất lượng ảnh, giải mã chuyển số, không đoán cấu hình, chia engine và bằng chứng OCR.
- `npm.cmd run ai:meter-reader-check`: chạy lại phép kiểm chứng HTTP/model trên database RAM, không dùng database ứng dụng thật.
- `npm.cmd run ai:meter-auto-check`: kiểm chứng upload → job nền → polling → review trên database RAM. Hồi quy năm ảnh: `node scripts/run-project.mjs scripts/evaluate-meter-automatic.mjs`.

Các kết quả thử ngoại tuyến trước đó được giữ tại [báo cáo tính khả thi](test/VISIONSTATE-YOLO-TRIAL-20261031.md); không coi vài ảnh đó là độ chính xác đại diện. Camera thật trên điện thoại và bố cục trình duyệt thật cần kiểm tra trên thiết bị người dùng; phiên này công cụ browser không có host truy cập nên chỉ kiểm chứng giao diện bằng DOM/render.
