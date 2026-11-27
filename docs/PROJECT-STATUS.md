# Tiến độ triển khai Trozy

Cập nhật **27/11/2026**. Phạm vi hiện hành dựa trên PA1, PA2, PA3 v2 và các quyết định sau PA3 của nhóm, gồm chính sách UC67 ngày 27/11. Bảng đối chiếu liên kết từng module với use case, mã nguồn và kiểm thử. [Phạm vi M01–M23 và UC01–UC73](requirements/FEATURE-COVERAGE.md)

## Bản đang chạy

| Môi trường | Trạng thái |
| --- | --- |
| Cloudflare | Demo PA4 phục vụ bản ứng dụng [`68f9714`](https://github.com/TVinhQuang/Trozy/commit/68f97146478d1f6df2c85bae916511d1a7a80d7a) bằng Workers, D1 và KV. Worker version `6e9ae22b-9c80-4caf-bc4a-d1cf716e996b` nhận 100% lưu lượng khi phát hành. D1 không còn migration chờ. [Demo](https://trozy.nhom11.workers.dev) · [Hướng dẫn vận hành](CLOUDFLARE.md) |
| Node/SQLite | Chạy trên máy với Node 24, SQLite và thư mục dữ liệu cục bộ. Thư xác thực dùng outbox khi chưa có SMTP. Có thể chuẩn bị runtime OCR và Ollama theo nhu cầu. [Chạy trên máy](../README.md#chạy-trên-máy) · [Cấu hình Node](IMPLEMENTATION.md) |
| Điện thoại | PWA có hướng dẫn thêm vào màn hình chính cho iPhone và Android. Tải dữ liệu và gửi ảnh cần mạng. [Cài Trozy](../README.md#cài-trozy-trên-điện-thoại) |

Kiểm tra sau phát hành ngày 27/11 xác nhận HTML, JavaScript chính và CSS khớp bản build. `/api/health` trả HTTP 200 và xác nhận truy vấn D1 thành công. API dữ liệu trả HTTP 401 khi chưa đăng nhập. Worker báo có cấu hình gửi thư. [Health](https://trozy.nhom11.workers.dev/api/health)

## Phạm vi đã triển khai

| Nhóm | Luồng hiện có |
| --- | --- |
| Tài khoản, cơ sở, phòng | Hai vai trò chủ trọ và người thuê. Đăng ký, xác thực email, khôi phục mật khẩu qua OTP, mời liên kết hồ sơ thuê. Quản lý nhiều cơ sở, khu/dãy, nội quy, hồ sơ và lịch sử phòng. |
| Lưu trú và hợp đồng | Hồ sơ người đại diện và thành viên, số CCCD nhập tay được mã hóa và che theo quyền. Hợp đồng nháp, nhận phòng theo ngày hiệu lực, chuyển phòng có lịch sử, phụ lục giá thuê và xác nhận đã đọc theo phiên bản. Người thuê gửi hoặc rút đề nghị gia hạn, trả phòng. |
| Điện nước, hóa đơn | Tính điện nước theo phân đoạn khi thay công tơ, phí theo người hoặc cố định. Người thuê gửi ảnh gốc, chủ trọ xác minh chỉ số rồi chốt kỳ. Hóa đơn theo kỳ có xem trước, phát hành, điều chỉnh và tải PDF. |
| Thanh toán, cọc, thu chi | VietQR theo số còn nợ. Chủ trọ đối chiếu và xác nhận thực thu, cấp biên nhận PDF, điều chỉnh có lịch sử. Sổ thu chi liên kết chứng từ. Quyết toán công nợ, hư hỏng và hoàn cọc trước khi đóng lượt thuê. |
| Vận hành và cổng người thuê | Dashboard và chi phí theo kỳ, sửa chữa, hỗ trợ, tài sản, bàn giao, tài liệu, phương tiện và đặt tiện ích. Nhắc hạn trong ứng dụng theo người nhận, có kênh email khi môi trường bật dịch vụ. |
| Báo cáo và quản trị | Bộ lọc theo cơ sở hoặc kỳ, Excel/CSV có xem trước khi nhập, xuất và sao lưu bản ghi JSON có tham chiếu tệp, nhật ký nghiệp vụ và nhật ký truy cập. |
| AI hỗ trợ | B01 tra cứu theo quyền, giải thích hóa đơn và soạn nháp thông báo. B02 phân tích tiêu thụ và cảnh báo. B04 gợi ý phân loại sau khi phiếu sửa chữa đã được lưu. Worker dùng quy tắc và thống kê. Bản Node có thể cấu hình Ollama hoặc Gemini cho B01/B04. |

### UC67 và dữ liệu cá nhân

Quy trình UC67 có trên Node và Worker. Người thuê đã liên kết gửi yêu cầu cho hồ sơ của mình. Với thành viên chưa có tài khoản hoặc yêu cầu bên ngoài, chủ trọ chọn đúng hồ sơ và ghi nhận việc xác minh danh tính, thẩm quyền. Ảnh CCCD được quản lý bên ngoài Trozy.

Chủ trọ xem trước kết quả từng trường rồi xác nhận xử lý. Phạm vi xét xóa gồm số điện thoại và email liên hệ của hồ sơ thuê. Mỗi trường chỉ được xóa khi người đó đã rời phòng, đã tất toán và trường đó đã hết mục đích sử dụng cho yêu cầu đang xử lý. Máy chủ kiểm tra lại trước khi ghi và lưu kết quả. Hồ sơ đăng nhập, chứng từ và nhật ký được giữ kèm lý do. [Quyết định UC67](requirements/FEATURE-COVERAGE.md#uc67--quyết-định-ngày-27112026) · [Kiểm thử UC67](../tests/privacy-requests.test.mjs)

## Điều kiện vận hành và phạm vi còn lại

- **B03 OCR công tơ** đang thử nghiệm trên máy. PaddleOCR PP-OCRv6 small dùng cho công tơ điện cơ và YOLO + VisionState Wheel Reader cho công tơ nước cơ. Chủ trọ xem đề xuất và đối chiếu ảnh trước khi ghi chỉ số. Trên Cloudflare, chủ trọ xem ảnh và nhập chỉ số thủ công. [Quy trình công tơ](METER-READER.md) · [Danh mục model và SHA-256](../MODELS-OCR/README.md)
- **UC16 OCR hợp đồng giấy** dùng PaddleOCR khi bản Node có runtime. Chủ trọ chọn từng trường sau khi đối chiếu. Bản Cloudflare hỗ trợ nhập tay hợp đồng giấy.
- **UC64/B05** dự báo công nợ, doanh thu và phòng trống thuộc nghiên cứu tùy chọn. Ký số, đối soát ngân hàng tự động, chat thời gian thực và ứng dụng native nằm ngoài phạm vi phát hành hiện tại.
- Nghiệm thu từng luồng thay thế của 73 use case, việc giao email đến hộp thư, độ chính xác OCR và thao tác trên các thiết bị thực tế cần minh chứng theo từng môi trường. Build có cảnh báo kích thước một số gói JavaScript.

## Kiểm thử và CI

Bản ứng dụng `68f9714` đạt **272/272** kiểm thử Node và **134** lượt render trên máy. Ba job Node tests, Render pages và Production build đã đạt trên GitHub tại thời điểm phát hành. [Kết quả CI của bản ứng dụng](https://github.com/TVinhQuang/Trozy/actions/runs/45996008533) · [Chỉ mục kiểm thử](test/README.md)

Workflow chạy bốn job trên Ubuntu với Node 24 khi mở hoặc cập nhật PR vào `main` và khi push vào `main`.

| Job | Lệnh và phạm vi |
| --- | --- |
| Node tests | `npm test` kiểm tra nghiệp vụ và API với dữ liệu cô lập. |
| Render pages | `npm run check:pages` kiểm tra đầu ra trang theo vai trò và cơ sở. |
| Production build | `npm run build` kiểm tra TypeScript và build React/Vite. |
| Cloudflare Worker dry-run | `npm run cf:check` build tài nguyên tĩnh rồi chạy `wrangler deploy --dry-run`. Wrangler đóng gói backend và kiểm tra cấu hình, bindings được khai báo cùng tài nguyên tĩnh. Job chạy trên runner bằng cấu hình trong repo, không cần token Cloudflare. |

Việc xác nhận quyền trên tài khoản Cloudflare, tình trạng migration D1 và hành vi sau phát hành thuộc bước triển khai và kiểm tra bản chạy. [Workflow CI](../.github/workflows/ci.yml) · [Tài liệu Wrangler](https://developers.cloudflare.com/workers/wrangler/commands/workers/#deploy)

## Minh chứng lịch sử

Ngày 26/11, tại `66b9daef`, build và render trang đạt. Bộ Node có 223 ca, gồm 210 đạt, 4 lỗi và 9 bỏ qua. Bốn lỗi nằm ở hai tệp kiểm thử API trạng thái bộ đọc công tơ. Kết quả ngày 27/11 ở trên thuộc bản ứng dụng mới. [Kết quả CI ngày 26/11](https://github.com/TVinhQuang/Trozy/actions/runs/45858902967)

### Các kiểm thử ngày 01/11/2026


Mốc quản lý cơ sở đã ghi nhận **156 kiểm tra Node đạt**, **18 nhóm App shell**, **10 nhóm quản lý cơ sở**, **132 lượt render route/role/property**, **39 cặp tương phản token** và build TypeScript/Vite đạt. Các lần kiểm tra dùng fixture cô lập hoặc dữ liệu trong bộ nhớ, không thay đổi database/ảnh kinh doanh thật. Đây là bằng chứng kiểm tra tự động của bản cục bộ, không phải chứng nhận sản phẩm hoàn thiện hoặc triển khai production.

Mốc tách luồng hỗ trợ theo vai trò bổ sung kiểm tra quyền tạo ticket: **157/157 Node**, **21 nhóm App shell**, **5 nhóm UI hỗ trợ** và build TypeScript/Vite đạt. Các nhóm UI kiểm tra cả đường dẫn sidebar trên desktop/mobile, quyền tạo của khách và khả năng xem/phản hồi của chủ trọ.

Mốc đổi theme xanh dương bổ sung **67 cặp tương phản token** cho nút theo chức năng, gồm trạng thái thường/hover/active/disabled; build và các nhóm kiểm tra UI liên quan đạt. Đã xem trực tiếp dashboard và trang phòng trên Chrome ở cửa sổ desktop; kiểm tra zoom/thiết bị và mọi trạng thái vẫn cần hoàn thiện.

Mốc làm rõ chữ và màu nền nút bổ sung **87 cặp tương phản token**: chữ nút dùng cùng màu đen đậm, phần phụ xám đậm; nhãn trạng thái giữ chữ tối và dấu/nền màu riêng. Ba nút tổng quan dùng nền khác nhau, áp dụng nhất quán cho thao tác tương tự ở các trang.

- [Biên bản quản lý cơ sở](test/reports/PROPERTY-MANAGEMENT-20261101.md)
- [Biên bản hỗ trợ theo vai trò](test/archive/ui/UI-SUPPORT-ROLES-20261101.md)
- [Biên bản theme xanh dương](test/archive/ui/UI-BLUE-THEME-20261101.md)
- [Biên bản chữ tối và màu nút](test/archive/ui/UI-DARK-INK-ACTIONS-20261101.md)
- [Biên bản nhập lượng tiêu thụ](test/reports/METER-CONSUMPTION-ENTRY-20261101.md)
- [Biên bản màu giao diện](test/archive/ui/UI-COLOR-CLARITY-20261101.md)
- [Đối chiếu module và giới hạn](requirements/FEATURE-COVERAGE.md).
