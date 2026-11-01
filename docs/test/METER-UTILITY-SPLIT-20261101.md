# Kiểm chứng tách bộ đọc điện/nước — 01/11/2026

Đã thực hiện yêu cầu: điện dùng PaddleOCR PP-OCRv6 small; nước giữ YOLOv8-OBB + VisionState wheels-v2. Luồng gửi ảnh, job nền, cấu hình một lần, chọn vùng dự phòng và chủ nhà xác minh giữ nguyên. Tenant chỉ gửi ảnh; nhận dạng không tự ghi chỉ số hoặc hóa đơn.

## Runtime và kết quả phần mềm

- PaddleOCR3.7.0/PaddleX3.7.2 cùng thư viện riêng nằm trong `.runtime/paddleocr/site-packages`; hai ONNX/config/model card chính thức khóa revision/hash tại `.runtime/paddleocr/models`. Dùng lại Python3.12.10/ONNX Runtime1.23.2 từ nhánh nước. Không thay NumPy/OpenCV của nước hoặc chạy source ngoài dự án.
- `scripts/setup-paddle-meter.ps1 -Offline` đạt, tái dùng runtime/model và kiểm hash. Kiểm chứng Python chặn ghi ngoài dự án và socket network; ảnh tổng hợp đọc `012345 kWh`. Manifest/lock cùng giấy phép giữ trong dự án. Model cần tải lại vì runtime Paddle cũ đã được gỡ theo yêu cầu trước đó.
- `npm.cmd test`: **149/149**, không lỗi/bỏ qua. Có model thật, định tuyến utility, bằng chứng OCR, scope/phân quyền/CAS/TTL/profile/ảnh, nhận dạng nước giữ nguyên, lifecycle và Vite.
- `npm.cmd run check:ai-ui`: **41/41**, gồm engine đúng loại, dữ liệu OCR khác bằng chứng từng bánh, scope tự động/thủ công, áp dụng chủ động và tenant photo-only.
- Python production **5/5**, automatic **6/6**, Paddle **8/8**: tổng 19. Bộ thử ngoại tuyến lịch sử không đổi.
- `npm.cmd run check:pages`: **132** lượt render. TypeScript/Vite build đạt; Vite vẫn cảnh báo bundle trên 500 kB, không có lỗi build.

## Model thật qua HTTP trên SQLite RAM

[Báo cáo live](METER-UTILITY-SPLIT-LIVE-20261101.json) lưu 24 hash nguồn/model, kiểm đầu/cuối không đổi. Không mở database ứng dụng thật.

| Trường hợp | Kết quả | Thay đổi dữ liệu |
| --- | --- | --- |
| Tenant gửi electric-clear, đọc nền Paddle | `needs_review`, không đề xuất; OCR toàn ảnh bỏ sót bánh đỏ | Chỉ số/hóa đơn không đổi |
| Chủ nhà chọn vùng electric-clear đã khóa trước thử | `00766.4 kWh`, confidence 0,965; scope `owner-region`, hai lượt `region/crop`, `cells:[]` | Chỉ ghi 766 sau mô phỏng xác nhận ảnh/phần lẻ trong RAM; nguồn `paddleocr-and-human`; kỳ chưa chốt, hóa đơn không đổi |
| Tenant gửi water-blue, đọc nền | `00001.056 m³`, VisionState; 8 cells, không có bằng chứng Paddle | Không áp dụng/xác minh, dữ liệu giữ nguyên |
| Chủ nhà gửi ảnh điện tổng hợp | `01234.5 kWh`, Paddle; scope `automatic`, hai lượt `full/crop` | Không áp dụng/xác minh; chỉ kiểm tra kỹ thuật, không chấm độ chính xác |

Tenant không được xem status/proposal hoặc gọi đọc/xác minh. Chủ khác bị chặn; bootstrap/export tenant không có bằng chứng OCR. Thiếu xác nhận ảnh hoặc phần lẻ bị từ chối. Bằng chứng phải giữ đầy đủ số 0 đầu, đúng cấu hình, hai quan sát cùng chữ số và cùng vùng nguồn; không ghép mảnh hoặc bỏ ký tự lạ để tạo số.

## Kết quả trên ảnh tái sử dụng

[Báo cáo mẫu/đối chứng](METER-UTILITY-SPLIT-SAMPLES-20261101.json) lưu 7 hash mã AI. Nhãn tham chiếu do tác nhân xem ảnh và đã khóa trước thử nghiệm cũ, chưa được người dùng xác nhận; không phải benchmark đại diện.

| Ảnh | Tự động | Chọn vùng đã khóa |
| --- | --- | --- |
| electric-clear | Không đề xuất | Paddle `00766.4` |
| electric-26762 | Không đề xuất | Không đề xuất; bánh cuối còn ký tự chưa rõ |
| electric-screenshot | Không đề xuất | Không đề xuất; OCR thiếu/mâu thuẫn chữ số |
| water-blue | VisionState `00001.056` | VisionState `00001.056` |
| water-weathered | Không tìm window | VisionState `1303.8`, khớp nhãn tạm |

Ảnh trống ở cả hai nhánh và ảnh chỉ có số sê-ri không sinh chỉ số. Điện tổng hợp tự động đạt là kiểm tra luồng kỹ thuật, không chứng minh khả năng đọc ảnh chụp. Cả ba ảnh điện thật hiện chưa tạo đề xuất tự động; chỉ một ảnh điện đọc được qua chọn vùng. Chưa có bằng chứng hướng Paddle tự động tốt hơn, dù việc tách engine đã hoạt động đúng yêu cầu. Không nới ngưỡng hoặc điền bánh đỏ thiếu để làm đẹp kết quả.

## Lỗi vận hành được sửa trong lượt này

Vite theo dõi toàn bộ `.runtime` sau khi cài thư viện Paddle, gặp `EBUSY` khi đọc tệp notice bị khóa và thoát; supervisor dừng API theo đúng thiết kế. Log bằng chứng `.runtime/logs/dev-20261101-utility-split-065dbd4e/stderr.log`.

Đã bỏ theo dõi `.runtime`, `.cache`, `data`, `tmp` và chặn phục vụ trực tiếp các thư mục riêng qua HTTP, giữ quy tắc deny mặc định của Vite. Kiểm tra Vite thật xác nhận file riêng trả403 qua cả URL thường và `@fs`, source frontend vẫn200. Chạy lại setup Paddle `-Offline` khi dev đang chạy không làm API/Vite dừng. Đây là sửa đổi vận hành, không đổi ngưỡng nhận dạng.

## Trạng thái ứng dụng

Web **http://127.0.0.1:5173**, API3001 đều health200 sau kiểm chứng cuối; frontend phục vụ đúng mã tách engine. Dev đang trong PTY session33667, launcher PID67956, API PID56148 và Vite PID56676. Thông tin tại `.runtime/logs/dev-20261101-utility-split-pty-065dbd4e/process.json`; phải xác minh identity trước khi dừng. Manifest launcher53000 là lịch sử của phiên đã dừng, không dùng nó để dừng phiên mới.

Người dùng tải lại trang và bấm **Đọc tự động lại** cho ảnh cũ khi cần chuyển engine; không tự xử lý lại hàng loạt hoặc xác minh ảnh nghiệp vụ thật. Chưa kiểm camera/bố cục trên điện thoại hay browser thật; UI kiểm bằng DOM/render, API/model kiểm trực tiếp.

Chạy kiểm chứng RAM: `npm.cmd run ai:meter-split-check`. Hồi quy: `node scripts/run-project.mjs scripts/evaluate-meter-utility-split.mjs`. Hướng dẫn hiện hành: [METER-READER.md](../METER-READER.md).
