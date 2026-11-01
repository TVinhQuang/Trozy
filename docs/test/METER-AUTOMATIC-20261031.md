# Kiểm chứng đọc công tơ tự động — 31/10/2026

Đã triển khai luồng ảnh mới → job nền → YOLO tìm hàng → VisionState đề xuất → chủ nhà xác minh. Dùng lại runtime/model CPU trong dự án, không cài/tải thêm hoặc tích hợp PaddleOCR. Người thuê vẫn chỉ gửi ảnh; chỉ số và hóa đơn không tự thay đổi.

## Kết quả

- `npm.cmd test`: **123/123**, không lỗi/bỏ qua. Có xử lý model thật, phân quyền, tenant không nhận AI, lưu bộ ảnh/job nguyên tử, retry, khởi động lại, khóa job, shutdown, ảnh/cấu hình/baseline thay đổi, hóa đơn và lượt thuê, ảnh nguồn 5 MB, kết quả sai schema, hết hạn và xác nhận ảnh/phần lẻ.
- `npm.cmd run check:ai-ui`: **37/37** nhóm tương tác DOM. Tự lấy/poll kết quả, thiết lập một lần, áp dụng chủ động, hủy kết quả cũ, trạng thái từ thiết bị khác, đóng/ẩn tab, fallback và tenant photo-only.
- `npm.cmd run check:pages`: **132** lượt render vai trò/route/cơ sở.
- `npm.cmd run build`: TypeScript/Vite đạt. Còn cảnh báo chunk ExcelJS lớn có sẵn.
- Python production: **5/5**; automatic worker: **6/6**. Kiểm tra hình học độc lập, không đoán layout, không đọc broad window khi thiếu grid, phân biệt chiều đọc, giữ cấu hình đã xác nhận, kiểm tra nét ở tỷ lệ của reader và độ phân giải gốc.
- Syntax/whitespace nguồn đã đổi đạt. Không sửa các thử nghiệm/báo cáo lịch sử.

## Model thật qua HTTP

[JSON live](METER-AUTOMATIC-LIVE-20261031.json) giữ 14 SHA-256 nguồn; các hash được đo đầu/cuối phép kiểm chứng, phải trùng nhau. Database là SQLite RAM, không mở database ứng dụng thật.

1. Người thuê tải ảnh nước mẫu và gửi bộ ảnh, nhận HTTP202. Chưa có cấu hình trả `needs_setup`, chưa có đề xuất.
2. Chủ nhà xác nhận 8 bánh/3 số lẻ một lần; job tự chạy. Chỉ polling GET, **không gọi locate/read/retry**. Kết quả `00001.056 m³`, confidence 0,95445. Các số 0 đầu được giữ nguyên. Job khoảng 5,4 giây trong lần ghi bằng chứng này; không phải cam kết hiệu năng.
3. Chỉ số/hóa đơn không đổi khi gửi ảnh, lưu cấu hình và model chạy. Tenant/chủ khác bị chặn; export tenant không có đề xuất/cấu hình AI.
4. Mô phỏng xác minh fixture RAM: thiếu xác nhận ảnh hoặc phần lẻ đều bị từ chối. Sau xác minh tường minh chỉ ghi phần nguyên 1; kỳ chưa chốt khi điện chưa xác minh, hóa đơn không đổi.
5. Chủ nhà lưu cấu hình cho phòng thử thứ hai rồi gửi ảnh riêng, HTTP201. Job tự chạy với cấu hình đã lưu, không thao tác đọc; cùng kết quả sau khoảng 6,2 giây. Chỉ số và hóa đơn giữ nguyên.

Bridge còn kiểm tra ảnh nước xoay 180° qua model thật: hai hướng được đánh giá độc lập, đề xuất vẫn `00001.056`. Không truyền crop tay, nhãn đáp án hoặc kỳ trước vào chế độ tự động.

## Năm ảnh hồi quy và giới hạn

[JSON năm ảnh và đối chứng](METER-AUTOMATIC-SAMPLES-20261031.json) giữ 6 hash nguồn cùng kết quả đầy đủ. Layout được cấu hình trước theo fixture; đây là ảnh đã tái sử dụng và nhãn xem ảnh của tác nhân, chưa phải benchmark độc lập hay chỉ số người dùng xác nhận.

| Ảnh | Kết quả tự động | Giới hạn/chứng cứ |
| --- | --- | --- |
| electric-clear | `needs_review`, không số | Có hơn một lưới đủ bánh, không tự chọn đáp án. Chọn vùng tay vẫn có kết quả ở phép kiểm chứng trước. |
| electric-26762 | `needs_review`, không số | Nhiều window; không tự chọn vùng lớn nhất. |
| electric-screenshot | `13624.0 kWh` | Phần nguyên khớp nhãn; bánh cuối chưa có nhãn độc lập, không chấm đúng toàn chuỗi. |
| water-blue | `00001.056 m³` | Khớp toàn chuỗi nhãn tạm khóa trước dự đoán. |
| water-weathered | `needs_review`, không số | Không tìm được window. |
| Ảnh trống, ảnh nước làm mờ | `needs_review`, không số | Không tạo chỉ số hoặc số 0 thay thế. |

Hai trong năm ảnh tạo đề xuất, ba ảnh cần thao tác bổ sung. Trong ba ảnh có nhãn toàn chuỗi, chỉ một ảnh được tự động đề xuất. Không suy ra độ chính xác đại diện từ nhóm này. Model hiện tại chưa tự động đọc tốt mọi ảnh điện/nước; cần tiếp tục thu thập và gán nhãn ảnh thực tế để đánh giá độ bao phủ trước khi chọn nâng cấp detector. Không huấn luyện mới trong lượt triển khai này.

## Vận hành

Ứng dụng đã build và khởi động lại ở `http://127.0.0.1:3001`. Health HTTP200, HTML/bundle trùng bản build hiện tại và route profile mới trả401 khi chưa đăng nhập. Launcher PID73592; manifest/log `.runtime/logs/local-app-20261031-meter-automatic-d644e834/`. Phải đọc manifest và xác minh process trước khi dừng. Chỉ dừng launcher/backend cũ đã xác minh, không dừng Node/Ollama của ứng dụng khác.

Không quét lại hay xác minh ảnh nghiệp vụ thật. Server mới chỉ tiếp tục job đã lưu; ảnh lịch sử chưa có job cần chủ nhà bấm thử lại. Chưa kiểm chứng camera/hiển thị trên điện thoại hoặc browser thật trong phiên này; UI kiểm tra bằng DOM/render.

Chạy lại khi có thay đổi liên quan: `npm.cmd run ai:meter-auto-check`. Hồi quy: `node scripts/run-project.mjs scripts/evaluate-meter-automatic.mjs`. Hướng dẫn dùng/API tại [METER-READER.md](../METER-READER.md).
