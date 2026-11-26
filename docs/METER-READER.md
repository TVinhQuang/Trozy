# Đọc công tơ: PaddleOCR cho điện, YOLO + VisionState cho nước

Phiên bản ngày 05/11/2026 giữ model cục bộ đang có và luồng **gửi ảnh → đọc nền → chỉ số/lượng dùng dự kiến → chủ nhà xác minh**. Ảnh mới được xử lý ngay cả khi chưa thiết lập số bánh/phần lẻ; không cần mở màn hình chủ nhà để khởi chạy. Bố cục có thể suy ra từ bằng chứng trên ảnh, được ghi nhớ sau khi chủ nhà duyệt. Ảnh chưa đọc được vẫn có bước chọn vùng hoặc nhập tay. Hỗ trợ hiện tại dành cho công tơ cơ có bánh số; LCD/LED và mặt kim dùng nhập tay.

| Loại công tơ | Bộ tìm vùng và đọc số |
| --- | --- |
| Điện | PaddleOCR PP-OCRv6 small det/rec đã fine-tune, chạy CPU qua ONNX Runtime; không dùng YOLO hoặc Wheel Reader. |
| Nước | `trozy_water_yolov8_obb.pt` đã fine-tune tìm hàng số, VisionState wheels-v2 đọc bánh; không dùng PaddleOCR. |

Kết quả huấn luyện và các mẫu trong báo cáo trước đây là bằng chứng lịch sử, chưa phải độ chính xác chung cho mọi loại đồng hồ. Lệnh `npm run ai:meter-zero-setup-check` kiểm tra nhánh không cấu hình qua HTTP và SQLite RAM bằng ảnh mẫu/model thật; không tải model, không mở dữ liệu nghiệp vụ. Không bổ sung chữ số bị thiếu để ép ra kết quả.

## Dùng trên web

Khởi động lại backend bằng `npm.cmd run dev`, hoặc `npm.cmd run build` rồi `npm.cmd start`; tải lại trang. Không chạy hai backend trên cùng cổng.

`npm.cmd run dev` kiểm tra API sẵn sàng trước khi mở Vite ở `http://127.0.0.1:5173`. Nếu đã có API Trozy hoạt động, lệnh dùng lại API đó và không mở thêm backend. Proxy lấy đúng `HOST`/`PORT` cấu hình (mặc định API `http://127.0.0.1:3001`). Lệnh `npm.cmd run dev:web` chỉ mở giao diện, cần backend chạy riêng.

1. Vào **Chỉ số điện nước → Ảnh công tơ cần xác minh**. Mở bộ ảnh người thuê gửi, hoặc bấm **Đọc ảnh công tơ** để tải ảnh của chủ nhà cho đúng phòng, kỳ và loại điện/nước.
2. Danh sách chủ nhà hiển thị chỉ số đề xuất và lượng dùng dự kiến khi đã đọc xong. Hệ thống lấy đầu kỳ đã xác minh hoặc biên bản nhận phòng đã xác nhận để tính theo phần nguyên dùng để ghi sổ. Thiếu đầu kỳ thì báo thiếu dữ liệu; đề xuất thấp hơn đầu kỳ thì báo cần kiểm tra, không hiển thị lượng dùng âm.
3. Ảnh mới của người thuê hoặc chủ nhà tự xếp hàng xử lý ngay sau khi gửi, kể cả chưa có cấu hình. Không cần mở màn hình chủ nhà, bấm tìm vùng hoặc kéo góc để khởi chạy. Khi có kết quả, chủ nhà nhận thông báo trong ứng dụng; màn hình đang mở tự cập nhật. **Bổ sung cách đọc công tơ** chỉ là lựa chọn dự phòng, không tự mở hoặc chặn hàng đợi.
4. Đề xuất hiện đầy đủ phần nguyên/phần lẻ, ví dụ `00001.056 m³` hoặc `00766.4 kWh`. Giao diện cho biết bộ đọc được dùng. Điện có mục **Văn bản đã nhận dạng** để đối chiếu hai quan sát OCR. Không có đề xuất nếu thiếu chữ số, sai cấu hình, mâu thuẫn hoặc ảnh chưa rõ. Bấm **Chỉnh vùng / đọc thủ công** để dùng bộ chọn bốn góc, hoặc nhập số sau khi xem ảnh gốc. **Đọc tự động lại** thử lại tác vụ; đề xuất từ engine cũ phải được đọc lại.
5. Bấm **Dùng chỉ số đề xuất** khi đã đối chiếu. Chỉ phần nguyên được điền vào ô xác minh; ghi chú xác minh có mẫu sẵn và vẫn sửa được. Nếu có phần lẻ, xác nhận cách ghi phần nguyên; tiếp tục xác nhận đã xem ảnh gốc trước khi lưu. Sửa số bằng tay sẽ chuyển nguồn xác minh sang thủ công. Sau khi duyệt thành công một đề xuất suy từ ảnh, hệ thống ghi nhớ số ô/phần lẻ cho các kỳ sau mà không cần biểu mẫu thiết lập riêng.

Chỉ bước nhận dạng chạy tự động. Người thuê chỉ chụp/chọn và gửi ảnh, xem biên nhận/trạng thái, không nhận đề xuất hay nút xác minh. Chỉ số và hóa đơn không đổi cho tới khi chủ nhà chủ động xác minh. Mỗi kỳ chỉ được chốt sau khi chủ nhà xác minh cả điện và nước. Các ràng buộc chỉ số kỳ trước, phiên bản bản ghi, hợp đồng còn hiệu lực và hóa đơn tiếp tục được kiểm tra.

### Phân biệt chỉ số công tơ và lượng tiêu thụ

Ở **Ghi chỉ số / Chỉnh sửa chỉ số**, chủ nhà chọn cách nhập:

- **Chỉ số trên công tơ:** nhập số tích lũy đầu kỳ và cuối kỳ; lượng dùng = cuối kỳ − đầu kỳ.
- **Lượng tiêu thụ kỳ này:** nhập lượng điện/nước đã dùng; đầu kỳ giữ nguyên, cuối kỳ được tính = đầu kỳ + lượng dùng và chỉ đọc. Ví dụ đầu kỳ 9.000 kWh, dùng 1.200 kWh thì cuối kỳ được tính 10.200 kWh. Lượng 1.200 có thể nhỏ hơn lượng dùng tháng trước.

Đầu kỳ vẫn phải là số tích lũy đã chốt, không phải lượng dùng của tháng trước. Chủ nhà đối chiếu số cuối kỳ được tính với công tơ/ảnh rồi xác nhận lưu. Đổi cách nhập hoặc giá trị sẽ bỏ xác nhận cũ. Ô trống/âm không được lưu; lượng dùng 0 hợp lệ. Mở modal hoặc đổi phòng/kỳ trở về cách nhập chỉ số công tơ.

Đây là công cụ nhập thủ công có tính toán rõ ràng, không phải kết quả OCR được tự xác minh. Dữ liệu/API/hóa đơn vẫn lưu và dùng chỉ số tích lũy; lịch sử không bị diễn giải lại. Không bỏ ràng buộc liên tục và không giả định quay vòng/thay/reset công tơ. Luồng người thuê gửi ảnh và chủ nhà xác minh ảnh không thay đổi.

Thiết lập chỉ lưu số bánh và phần lẻ; mỗi ảnh phải tìm lại vùng, không tái dùng tọa độ của ảnh cũ. Đổi cấu hình làm mất hiệu lực đề xuất cũ. Đổi ảnh/phiên bản/tài khoản hoặc đóng hộp thoại hủy yêu cầu UI cũ và xóa đề xuất đã áp dụng; job nền vẫn độc lập với việc mở hộp thoại. Đề xuất nền giữ tối đa 31 ngày để chủ nhà có thể quay lại sau; chọn vùng thủ công giữ hạn 30 phút. Mọi lần mở/duyệt vẫn kiểm ảnh, phiên bản, baseline, cấu hình và model hiện tại. Bộ chọn vùng thủ công có cạnh **1 → 2** theo chiều đọc, hỗ trợ xoay 90°/180°, bàn phím và nhập tọa độ.

## Runtime và vận hành

### Khi giao diện báo lỗi kết nối

Nếu giao diện vẫn mở nhưng báo máy chủ chưa sẵn sàng, kiểm tra cửa sổ `npm.cmd run dev` và hai địa chỉ `/api/health` trên cổng API và giao diện. API khỏe trả JSON có `ok: true`; nếu API không chạy, Vite không thể chuyển tiếp yêu cầu đọc ảnh. Đây là lỗi kết nối, chưa phải kết quả nhận dạng.

Dev launcher chờ API khi khởi động, cho phép khoảng 15 giây khi backend đang tải lại mã và thử khởi động lại tối đa hai lần với backend do chính nó mở. Nếu API vẫn không hoạt động, launcher dừng giao diện do nó quản lý và in nguyên nhân trong terminal. API được dùng lại không bị launcher dừng. Khi cần chạy lại, dùng `npm.cmd run dev` rồi tải lại trang; không mở thêm backend thủ công trên cùng cổng.

Vite trả lỗi JSON503 rõ ràng khi mất kết nối API. Giao diện cũng phân biệt lỗi kết nối với lỗi nghiệp vụ hoặc phiên đăng nhập, thay vì báo chung “Không thể thực hiện yêu cầu”. Chỉ số/hóa đơn không được ghi khi một yêu cầu đọc ảnh thất bại.

### Runtime cục bộ

Nhánh nước dùng lại runtime/model CPU tại `.runtime/meter-digits/visionstate-yolo/`; không tải hoặc cài lại nhánh nước trong lượt này. Mọi cache, runtime và dữ liệu riêng của Trozy nằm trong dự án. Không gửi ảnh tới dịch vụ AI từ xa.

Máy hiện tại đã có cả hai nhánh cùng model đã fine-tune. PaddleOCR/PaddleX nằm trong `.runtime/paddleocr/site-packages`; Python portable và ONNX Runtime được dùng lại. Thư viện riêng của Paddle được nạp trước ở tiến trình đọc điện, không thay NumPy/OpenCV của nhánh nước. Worker bỏ các biến `TROZY_USE_TRAIN_GPU`/`TROZY_TRAIN_GPU_SITE` từ tiến trình cha để không nạp thư viện huấn luyện vào OCR sản xuất.

Trên máy Windows mới, chạy `npm.cmd run ai:setup-meter-reader` rồi `npm.cmd run ai:setup-paddle-meter` để chuẩn bị thư viện và model gốc. Sau đó cần chép bộ model đã fine-tune cùng cấu hình/bảng ký tự vào đúng đường dẫn bên dưới; chỉ chạy setup chưa đủ để OCR hiện tại sẵn sàng. Script Paddle dùng Python trong `.runtime/meter-digits/visionstate-yolo/python/`, lưu cache và thư viện trong dự án; không đổi PATH hoặc cài dịch vụ hệ thống. Kiểm tra model gốc ngoại tuyến: `npm.cmd run ai:setup-paddle-meter -- -Offline`. Không dùng script Paddle lịch sử hoặc đường dẫn ngoài dự án làm runtime.

| Artifact đang dùng | Đường dẫn trong dự án |
| --- | --- |
| Tìm vùng nước đã fine-tune | `.runtime/meter-digits/visionstate-yolo/models/water/trozy_water_yolov8_obb.pt` |
| Nhận dạng bánh nước | `.runtime/meter-digits/visionstate-yolo/models/water/wheels-v2.onnx` |
| Phát hiện chữ điện đã fine-tune | `.runtime/paddleocr/models/electric/PP-OCRv6_small_det_trozy_onnx_infer/inference.onnx` |
| Nhận dạng chữ điện đã fine-tune | `.runtime/paddleocr/models/electric/PP-OCRv6_small_rec_trozy_onnx_infer/inference.onnx` |

Hai thư mục Paddle đã fine-tune phải có cả `inference.yml` và `inference.json` tương ứng. Mã nguồn kiểm SHA-256 của trọng số lẫn cấu hình/bảng ký tự; thiếu hoặc sai hash sẽ tắt nhánh liên quan và giữ nhập tay. Mã hash chuẩn nằm ở phần 5 của [báo cáo huấn luyện](test/reports/METER-OCR-TRAINING-20261103.md). Giữ nguyên model gốc để setup ngoại tuyến tiếp tục hoạt động. Không chạy huấn luyện lại chỉ để khởi động ứng dụng.

Mở [MODELS-OCR](../MODELS-OCR/README.md) để xem danh mục model đang dùng cùng đường dẫn tương đối và hướng dẫn xác minh SHA-256. Chỉ model đang dùng được tách vào `electric/` và `water/`; model gốc, runtime, thư viện và các run/checkpoint giữ vị trí cũ.

Khi chủ động cần huấn luyện lại, `npm.cmd run ai:train-water` và `npm.cmd run ai:train-electric` gọi đúng Python portable qua launcher `--python`. Thư viện GPU dùng riêng cho training; mỗi lượt có thư mục tạm riêng trong dự án và được dọn sau khi kết thúc. Model xuất lại phải được đánh giá và cập nhật hash đã ghim trong mã nguồn trước khi dùng; ứng dụng không tự chấp nhận trọng số mới chỉ vì trùng tên file.

Hai cấu hình độc lập với trợ lý văn bản:

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `TROZY_METER_READER_ENABLED` | `true` | Tắt bằng `false`/`0`; xem ảnh và nhập tay vẫn hoạt động (có thể dùng dự phòng Gemini Vision nếu cấu hình). |
| `TROZY_METER_READER_TIMEOUT_MS` | `30000` | Thời gian một lượt đọc/tìm vùng cục bộ; giới hạn cấu hình 2–60 giây. |
| `TROZY_AI_PROVIDER` | `auto` | `auto` tự dùng Gemini khi có `GEMINI_API_KEY`/`GEMINI_API_KEYS`, ngược lại giữ Ollama cục bộ; có thể ép `gemini` hoặc `ollama`. |
| `GEMINI_API_KEY` / `GEMINI_API_KEYS` | *(trống)* | Khóa API miễn phí từ Google AI Studio (chỉ lưu trong `.env`, gửi qua header `x-goog-api-key`, không đưa lên URL hoặc giao diện). |
| `GEMINI_MODELS` | `gemini-3.1-flash-lite,gemini-3.5-flash-lite,gemini-flash-lite-latest,gemini-3.5-flash,gemini-3.8-flash,gemini-flash-latest` | Danh sách model miễn phí tự động xoay vòng khi model đang dùng gặp `429` (hết token/RPM/RPD), `503` (quá tải) hoặc `404` (model ngừng hỗ trợ). |
| `TROZY_GEMINI_ROTATION_MODE` | `failover` | `failover` giữ model khỏe cho đến khi chạm hạn mức rồi xoay vòng tròn; `round_robin` xoay model sau mỗi lượt gọi. |
| `TROZY_GEMINI_COOLDOWN_MS` | `65000` | Thời gian nghỉ mặc định của một model sau lỗi `429` trước khi được xoay lại (lỗi hạn mức ngày tự nghỉ 15 phút). |
| `TROZY_METER_VISION_FALLBACK` | `auto` | Dự phòng tầng 2 bằng Gemini Vision khi bộ đọc cục bộ chưa chắc chắn (`needs_review`/`retake`) hoặc khi triển khai web không chạy runtime Python cục bộ (`auto\|gemini\|off`). |

### Dự phòng tầng 2 bằng Gemini Vision & Vòng dữ liệu thực tế

- **Tầng 1 (cục bộ, 0 token):** Ảnh luôn chạy qua bộ đọc cục bộ trước (PaddleOCR PP-OCRv6 cho điện, đã tối ưu nhận `kW.h`, tự xoay ảnh ngang/ngược `90°/270°/180°`, cache session; YOLO-OBB + VisionState cho nước, có crop theo thân đồng hồ và xoay thẳng crop dọc). Khi camera chụp trực tiếp từ web, khung vàng `guideBox` được chuyển thành gợi ý vùng ROI cho bộ đọc (không lộ trong biên nhận người thuê).
- **Tầng 2 (Gemini Vision xoay vòng model miễn phí):** Chỉ kích hoạt khi tầng 1 chưa đủ chắc chắn hoặc khi tắt runtime cục bộ trên server web nhỏ. Chỉ gửi ảnh PNG chuẩn hóa và loại công tơ (không gửi chỉ số cũ hay thông tin cá nhân). Đề xuất từ Gemini Vision vẫn bị kiểm tra định dạng/đơn vị/cấu hình phòng chặt chẽ, ghi nguồn xác minh `gemini-vision-and-human`, và **chủ nhà vẫn bắt buộc đối chiếu ảnh gốc (`imageChecked`) + xác nhận phần lẻ (`fractionalChecked`)** trước khi lưu chỉ số.
- **Data Flywheel (`scripts/meter-gold.mjs`):** Lệnh `export-verified --consent-confirmed` tự động đánh dấu các ca cần dùng Gemini Vision hoặc nhập tay là ca khó (`hard: true`) kèm chuỗi chữ số đầy đủ (`digitsText`) để ưu tiên huấn luyện lại model cục bộ. Lệnh `evaluate` hỗ trợ `--mode profiled|zero-setup` và `--fallback gemini`, đo độ trễ `p50/p95` và chấm khớp toàn chuỗi `strictOverall`; lệnh `label` hỗ trợ `--suggest gemini` (chỉ trên tập `train`, `val`/`test` luôn chấm mù).

Bộ đọc xử lý một tác vụ model tại một thời điểm trong backend. Hàng đợi nền được lưu trong SQLite, có khóa tác vụ, tối đa ba lượt thử khi runtime bận/lỗi tạm thời và nút thử lại thủ công. Khi khởi động lại, chỉ các job đã lưu được tiếp tục; không quét lại toàn bộ ảnh lịch sử. Đóng dịch vụ bằng `app.close()` hủy worker đang chạy và giữ job để tiếp tục; nếu tiến trình bị ngắt đột ngột, job được nhận lại sau khi khóa ba phút hết hạn. Worker bị dừng khi hết thời gian. Mỗi tác vụ dùng thư mục tạm riêng dưới `.runtime/tmp/`, chỉ thư mục đó được dọn sau khi worker đóng. Các model không được tải trong lúc nhận dạng.

Model nước sản xuất là bản fine-tune từ [YOLO stage1](https://huggingface.co/ntarekp/watermeter-yolov8-obb) revision `c00b2752e3ad762eb269a05e1dceb28f48c1f27b`; [VisionState wheels-v2](https://huggingface.co/oleost/visionstate-wheel-reader) revision `563f365a5b377c10c7248517ef2576ac5cee3cbf` giữ nguyên. Mã ứng dụng dùng preprocessing/giải mã trong `src/ai/meter_wheels.py` và hình học trong `meter_geometry.py`; bản thử trong `scripts/meter-trial/` được giữ nguyên để tái lập báo cáo cũ. Ghi công/giấy phép ở `THIRD-PARTY-NOTICES.md`.

## Giới hạn và ràng buộc dữ liệu

Confidence là điểm nội bộ, không phải xác suất đọc đúng được hiệu chuẩn. Nhánh nước giữ ngưỡng 0,7 và giải mã truyền số/làm tròn bánh cuối của VisionState. Nhánh điện dùng ngưỡng 0,85 cho mỗi quan sát OCR, không tạo confidence giả cho từng bánh và không dùng decoder của VisionState. Khi chưa có bố cục đã xác nhận, hệ thống cần lưới số đầy đủ và nhóm ô đỏ liên tiếp ở cuối, hoặc hai quan sát OCR cùng dấu chấm thập phân rõ. Không có màu đỏ không có nghĩa là không có phần lẻ. Bằng chứng màu/ranh giới chưa rõ thì cần đối chiếu hoặc nhập tay; không dùng lịch sử tiêu thụ để sửa chữ số hay đặt dấu thập phân.

Hai nhánh vẫn kiểm tra độ phân giải, sáng, tương phản và nét trên vùng gốc. Năng lượng cạnh xét sau khi chỉ thu nhỏ tới tối đa 32×48 pixel mỗi ô; không phóng lớn để vượt kiểm tra độ phân giải. Các ngưỡng này chưa được hiệu chuẩn riêng cho mọi kiểu vùng Paddle, vì vậy có thể từ chối ảnh người nhìn vẫn đọc được.

Nhánh nước tự động yêu cầu đúng một window và một lưới đủ bánh, gần cách đều; giá trị chữ số YOLO không dùng làm chỉ số. Khi chưa có bố cục đã xác nhận, lượt định vị cận cảnh trên pixel gốc giúp kiểm lại số ô, kèm kiểm hai đầu hàng số để tránh mất số 0 đầu. Hai hướng 0°/180° được đọc riêng: nhận một hướng đủ rõ với khoảng cách confidence tối thiểu 0,15, hoặc hai hướng cho cùng kết quả đầy đủ. Đề xuất suy bố cục từ ảnh còn cần hai vùng đọc giữ nguyên số ô và khớp toàn chuỗi; `waterEvidence` giữ tọa độ, chuỗi và điểm của cả hai. Mâu thuẫn cần kiểm tra thủ công.

Nhánh điện giữ nguyên văn bản/polygon/điểm OCR. Tự động cần ngữ cảnh kWh và vùng bộ đếm tối; hai quan sát toàn ảnh/crop hoặc vùng có ngữ cảnh/crop phải khớp toàn chuỗi. Khi chữ kWh dính vào hàng số, ảnh gốc có thể dùng để tìm lại đầy đủ hàng số rồi đọc hai vùng; chuỗi dính chữ chỉ là gợi ý vùng, không được cắt chữ để làm đáp án. Bộ chọn vùng thủ công dùng hai lượt trên vùng chủ nhà đã chọn. Hai lượt có phạm vi riêng (`automatic` hoặc `owner-region`) và cùng phải chỉ đúng vùng nguồn. Chỉ bỏ khoảng trắng hoặc dấu chấm đúng vị trí; không ghép dòng, thay O thành 0, điền bánh đỏ bị thiếu hay dùng số sê-ri làm đáp án. Hai lượt trên cùng ảnh vẫn có thể cùng sai, nên luôn cần đối chiếu ảnh.

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

Job và đề xuất gắn owner, bộ gửi, phiên bản, ảnh, SHA-256, phiên bản cấu hình và engine được server chọn theo utility. Proposal giữ `modelDigest` của bộ đọc; proposal tự động giữ thêm `locatorDigest` của bộ tìm vùng. `profileSource:'image'` cần `layoutEvidence` hợp lệ, dấu chấm phải đến từ hai quan sát OCR thật; số ô/phần lẻ khớp cấu hình đã lưu nếu có. Chủ nhà duyệt thành công mới tạo profile `source:'image-and-review'`, trong cùng giao dịch xác minh; không ghi đè profile đã xác nhận. Các job khác của cùng công tơ được đọc lại theo phiên bản mới. Profile mới đánh dấu `meter-reader-v3`; số bánh/phần lẻ đã xác nhận bằng `visionstate-v2` vẫn được dùng lại. Profile OCR cũ chưa xác nhận không được tự tin dùng. Đề xuất thiếu/sai digest hoặc sai engine bị ẩn và bị chặn khi xác minh. Chỉ các job từng bị chặn `needs_setup` được tiếp tục sau nâng cấp; không quét lại toàn bộ ảnh nghiệp vụ. Tenant không nhận profile, lượng dùng dự kiến hoặc bằng chứng AI.

Khi xác minh, server kiểm tra lại ảnh/phiên bản/cấu hình/engine, hạn dùng và vùng bằng chứng. Nguồn điện là `paddleocr-and-human`, nước là `wheel-reader-and-human`; nhập tay vẫn là thủ công. Đổi baseline, hợp đồng hoặc chốt kỳ/lập hóa đơn chặn đề xuất. Chỉ số và hóa đơn không tự đổi.

## Kiểm chứng

- [Luồng không cấu hình trước, đọc nền và lượng dùng dự kiến ngày 05/11](test/reports/METER-ZERO-SETUP-20261105.md), [HTTP CPU thật trên SQLite RAM](test/METER-ZERO-SETUP-LIVE-20261105.json). Hai ảnh rõ điện/nước có đề xuất tự động trước khi chủ nhà mở; ảnh mờ và các đối chứng không có đề xuất. Đây là ca hồi quy phát triển, chưa phải benchmark độ chính xác.

- [Thiết lập và kiểm chứng model sau fine-tune ngày 03/11](test/reports/METER-OCR-CONFIGURATION-20261103.md), [năm ảnh và đối chứng](test/METER-OCR-CONFIGURATION-SAMPLES-20261103.json), [HTTP trên SQLite RAM](test/METER-OCR-CONFIGURATION-LIVE-20261103.json). Các báo cáo lưu riêng, giữ nguyên bằng chứng huấn luyện và kết quả lịch sử bên dưới.
- [Live hai nhánh qua HTTP trên SQLite RAM](test/METER-UTILITY-SPLIT-LIVE-20261101.json): Paddle chọn vùng đọc điện thật `00766.4`; nước tự động `00001.056`; điện tổng hợp tự động `01234.5` chỉ kiểm tra kỹ thuật. Kiểm tra quyền và xác minh ảnh/phần lẻ; không mở DB thật.
- [Năm ảnh và đối chứng của hai nhánh](test/METER-UTILITY-SPLIT-SAMPLES-20261101.json): ba ảnh điện thật chưa đề xuất tự động; crop tay đọc được một ảnh. Nước xanh đọc tự động, nước cũ cần crop tay. Ảnh trống/số sê-ri riêng không sinh chỉ số. Đây là ảnh tái sử dụng có nhãn tạm của tác nhân, không phải benchmark đại diện.
- `npm.cmd run ai:meter-split-check` kiểm chứng HTTP RAM; `node scripts/run-project.mjs scripts/evaluate-meter-utility-split.mjs` chạy hồi quy model hiện tại. [Biên bản tích hợp](test/reports/METER-UTILITY-SPLIT-20261101.md).

- Lịch sử trước khi tách engine: [báo cáo tự động 31/10](test/METER-AUTOMATIC-LIVE-20261031.json) kiểm chứng nước `00001.056 m³` qua HTTP RAM; [năm ảnh 31/10](test/METER-AUTOMATIC-SAMPLES-20261031.json) dùng YOLO + VisionState cho cả điện/nước, có hai đề xuất. Giữ nguyên làm bằng chứng, không coi là kết quả engine điện hiện tại hoặc độ chính xác đại diện.
- [Báo cáo chọn vùng thủ công trước đó](test/METER-READER-PRODUCTION-LIVE-20261031.json) được giữ nguyên làm bằng chứng lịch sử.
- `npm.cmd test`: kiểm tra backend, phân quyền, provenance, phiên bản/hạn dùng/ảnh thay đổi, timeout/hủy worker, ảnh thật với model cục bộ và fallback.
- `npm.cmd run check:ai-ui`, `npm.cmd run check:pages`, `npm.cmd run build`: tương tác DOM, render theo quyền và TypeScript/Vite.
- `.runtime/meter-digits/visionstate-yolo/python/python.exe -I -B tests/meter-reader-production.test.py`, `tests/meter-automatic.test.py`, `tests/meter-paddle.test.py`: chất lượng ảnh, giải mã chuyển số, không đoán cấu hình, chia engine và bằng chứng OCR.
- `npm.cmd run ai:meter-reader-check`: chạy lại phép kiểm chứng HTTP/model trên database RAM, không dùng database ứng dụng thật.
- `npm.cmd run ai:meter-auto-check`: kiểm chứng upload → job nền → polling → review trên database RAM. Hồi quy năm ảnh: `node scripts/run-project.mjs scripts/evaluate-meter-automatic.mjs`.

Các kết quả thử ngoại tuyến trước đó được giữ tại [báo cáo tính khả thi](test/reports/VISIONSTATE-YOLO-TRIAL-20261031.md); không coi vài ảnh đó là độ chính xác đại diện. Camera thật trên điện thoại và bố cục trình duyệt thật cần kiểm tra trên thiết bị người dùng; phiên này công cụ browser không có host truy cập nên chỉ kiểm chứng giao diện bằng DOM/render.
