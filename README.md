# Trozy — Smart Rental Management System

Trozy là ứng dụng web quản lý nhà trọ của **Nhóm 11**, môn **Nhập môn Công nghệ phần mềm — 24C01**. Chủ trọ quản lý cơ sở, phòng, hợp đồng, điện nước và thu chi. Người thuê xem thông tin phòng, gửi ảnh công tơ, báo thanh toán và theo dõi yêu cầu ngay trên web.

| Nội dung | Địa chỉ và tình trạng ngày 27/11/2026 |
| --- | --- |
| Demo PA4 | [Mở Trozy trên Cloudflare](https://trozy.nhom11.workers.dev) |
| Mã nguồn | Nhánh [`main`](https://github.com/TVinhQuang/Trozy/tree/main) |
| Phiên bản ứng dụng đang chạy | [`68f9714`](https://github.com/TVinhQuang/Trozy/commit/68f97146478d1f6df2c85bae916511d1a7a80d7a), gồm các bổ sung sau khi đối chiếu PA1–PA3 và chính sách UC67 đã chốt |
| Phạm vi theo đặc tả | [23 module và 73 use case](docs/requirements/FEATURE-COVERAGE.md), kèm mã nguồn, kiểm thử và điều kiện vận hành |
| Theo dõi công việc | [Jira của Nhóm 11](https://projectse-1.atlassian.net/welcome/software?projectId=10001) |

## Chức năng đang có

| Module | Chủ trọ và người thuê có thể làm gì |
| --- | --- |
| **M01 · Tài khoản** | Đăng ký, xác thực email, liên kết tài khoản người thuê bằng lời mời, cập nhật hồ sơ và tùy chọn thông báo, đổi mật khẩu hoặc khôi phục qua OTP email. Dữ liệu được giới hạn theo vai trò, cơ sở và hồ sơ thuê. |
| **M02–M03 · Cơ sở và phòng** | Quản lý nhiều cơ sở, khu/dãy, nội quy, trạng thái và lịch sử phòng. Nhớ cơ sở đang chọn theo tài khoản, lọc danh sách phòng, xuất Excel và ghi nhận bảo trì khi phòng còn người ở. |
| **M04–M05 · Hồ sơ và hợp đồng** | Quản lý người đại diện và thành viên phòng, nhập tay số CCCD, mã hóa khi lưu và che khi hiển thị theo quyền. Lập hợp đồng nháp, kích hoạt lưu trú theo ngày, chuyển phòng có lịch sử, lập phụ lục đổi giá có ngày hiệu lực, tải PDF và ghi nhận đã đọc theo phiên bản. Người thuê gửi, theo dõi hoặc rút đề nghị gia hạn hay trả phòng. |
| **M06–M07 · Điện nước và dịch vụ** | Cấu hình giá theo công tơ, theo người hoặc cố định. Tách sản lượng theo từng thiết bị khi thay công tơ giữa kỳ. Người thuê gửi ảnh gốc, chủ trọ mở ảnh, xác minh từng loại và chốt kỳ. Phí dịch vụ áp dụng theo phòng hoặc hợp đồng và có lịch sử giá. |
| **M08–M09 · Hóa đơn, thanh toán và công nợ** | Lập nháp theo kỳ, kiểm tra dòng tiền, phát hành, điều chỉnh có lịch sử và tải PDF. Người thuê yêu cầu rà soát, dùng VietQR theo số còn nợ và báo đã chuyển khoản. Chủ trọ xác nhận tiền thực nhận, xử lý thu thiếu hoặc thu thừa, xuất biên nhận PDF và nhắc nợ theo bộ lọc. |
| **M10–M11 · Cọc và thu chi** | Đối chiếu công nợ, khấu trừ hư hỏng có căn cứ và ghi chi khi hoàn cọc thực tế. Điều chỉnh biên nhận cập nhật hóa đơn và sổ thu chi có lưu lịch sử. Sổ hỗ trợ lọc, tổng hợp theo tháng, xuất Excel và in hoặc lưu PDF qua trình duyệt. |
| **M12–M13 · Cổng người thuê và sửa chữa** | Xem phòng, hợp đồng, nội quy, dịch vụ, hóa đơn và biên nhận. Gửi phiếu sửa chữa kèm minh chứng rồi theo dõi, xác nhận kết quả, đánh giá hoặc phản hồi. Chủ trọ xem gợi ý phân loại sau khi phiếu đã được lưu. |
| **M14–M15 · Tài sản và bàn giao** | Quản lý tài sản theo phòng. Biên bản nhận và trả phòng lưu tình trạng, chỉ số và danh sách tài sản tại thời điểm lập. Hai bên đối chiếu hư hỏng và quyết toán trước khi đóng lượt thuê. |
| **M16–M17 · Thông báo và hỗ trợ** | Gửi thông báo theo cơ sở hoặc phòng, nhận nhắc theo hạn và xem trạng thái gửi. Người thuê mở phiếu hỗ trợ, chủ trọ phản hồi và hai bên theo dõi theo quyền. Gửi email cần cấu hình dịch vụ của môi trường. |
| **M18–M19 · Tài liệu, phương tiện và tiện ích** | Tra cứu nội quy và tài liệu theo phiên bản, tải tài liệu đúng phạm vi phòng hoặc hợp đồng, xác nhận phương tiện trước khi tính phí và đặt tiện ích theo sức chứa. |
| **M20–M21 · Báo cáo và dữ liệu** | Xem tổng quan theo cơ sở và chi phí cá nhân theo kỳ. Thiết lập mặc định theo cơ sở, xem trước khi nhập Excel/CSV, xuất hoặc sao lưu bản ghi JSON theo phạm vi. Có nhật ký nghiệp vụ và nhật ký truy cập riêng, cùng quy trình UC67 cho yêu cầu xóa dữ liệu. |
| **M22–M23 · Phân tích và trợ lý** | So sánh tiêu thụ điện nước, xem và rà soát cảnh báo. Trợ lý trả lời theo dữ liệu được cấp quyền, giải thích hóa đơn và soạn nháp thông báo để người dùng kiểm tra trước khi gửi. |

Luồng chính đi từ thiết lập cơ sở và phòng, tiếp nhận người thuê, lập hợp đồng và ghi cọc đến xác minh chỉ số, lập hóa đơn, xác nhận thu tiền, bàn giao và quyết toán. [Bảng đối chiếu chức năng](docs/requirements/FEATURE-COVERAGE.md)

### UC67 — Xuất, sao lưu và yêu cầu xóa dữ liệu

- Chủ trọ chọn cơ sở và loại bản ghi, xem trước rồi xuất JSON. JSON chứa tham chiếu tệp, ảnh và tài liệu vẫn được lưu ở kho tệp riêng.
- Người thuê có tài khoản liên kết gửi yêu cầu của mình trong **Tài khoản** và xem kết quả từng trường. Với người gửi bên ngoài hoặc thành viên chưa có tài khoản, chủ trọ chọn đúng hồ sơ, ghi nhận việc đối chiếu danh tính và quyền đại diện nếu có.
- Phạm vi xóa là **số điện thoại và email liên hệ trong hồ sơ thuê**. Trozy xét từng trường khi người đó đã rời phòng, đã tất toán nghĩa vụ và trường liên hệ đã hết mục đích sử dụng cho yêu cầu đang xử lý. Email đăng nhập, hợp đồng, hóa đơn, biên nhận, cọc, bàn giao, minh chứng và nhật ký được giữ cùng lý do.
- Chủ trọ xem trước kết quả, xác nhận rồi máy chủ kiểm tra lại điều kiện trong giao dịch. Có thể xử lý một phần, giữ dữ liệu, hủy hoặc từ chối. Nhật ký lưu người xử lý và kết quả. Với người gửi bên ngoài, chủ trọ có thể tải phiếu kết quả để giao trực tiếp và ghi nhận đã giao. [Quyết định UC67](docs/requirements/FEATURE-COVERAGE.md#uc67--quyết-định-ngày-27112026) · [Kiểm thử UC67](tests/privacy-requests.test.mjs)

## Bản demo trên Cloudflare

Bản demo PA4 dùng **Cloudflare Workers** cho API và giao diện, **D1** cho dữ liệu nghiệp vụ, **Workers KV** cho tệp riêng tư. Ảnh công tơ giới hạn 5 MiB mỗi ảnh và được giữ một tháng. Bản ghi xác minh và hóa đơn lưu ở D1. Worker chạy mỗi giờ để xử lý nhắc hạn và hàng đợi thư. Trang đăng nhập cho phép bắt đầu đăng ký chủ trọ qua email. Ngày 27/11/2026, API health xác nhận D1 hoạt động và bản demo có cấu hình gửi thư. [Mở Trozy](https://trozy.nhom11.workers.dev) · [Đăng ký chủ trọ](https://trozy.nhom11.workers.dev/?action=register-landlord) · [Hướng dẫn Cloudflare](docs/CLOUDFLARE.md)

### Cài Trozy trên điện thoại

Mở demo bằng **Safari trên iPhone** hoặc **Chrome trên Android**. Sau khi đăng nhập, làm theo bảng **Thêm Trozy vào màn hình chính**. Có thể mở lại hướng dẫn từ trang đăng nhập hoặc **Tài khoản của tôi**. PWA dùng mạng để tải dữ liệu và gửi ảnh công tơ.

### AI, OCR và các điều kiện vận hành

| Khả năng | Cloudflare | Node/SQLite trên máy |
| --- | --- | --- |
| **B01 · Trợ lý**, **B02 · Cảnh báo điện nước**, **B04 · Gợi ý phân loại sửa chữa** | Tra cứu theo quyền, quy tắc nghiệp vụ và thống kê. | Cùng luồng nghiệp vụ. B01/B04 có thể dùng Ollama cục bộ hoặc Gemini theo cấu hình và có cơ chế dự phòng. |
| **B03 · Đọc công tơ** | Nhận ảnh và chủ trọ đối chiếu, nhập chỉ số thủ công. | OCR thử nghiệm cho công tơ cơ. Nhánh điện dùng PaddleOCR PP-OCRv6 small, nhánh nước dùng YOLO + VisionState Wheel Reader. Ảnh được đọc nền khi có runtime và model tương ứng. Có thể cấu hình Gemini Vision hỗ trợ khi kết quả cục bộ chưa rõ. |
| **UC16 · Hợp đồng giấy** | Nhập dữ liệu hợp đồng bằng tay. | OCR bằng PaddleOCR khi có runtime. Chủ trọ xem trước kết quả và chọn từng trường để đưa vào biểu mẫu. |

Người thuê chỉ gửi ảnh công tơ. Chủ trọ đối chiếu ảnh gốc và xác nhận trước khi ghi chỉ số. Kết quả đọc ảnh chỉ là đề xuất. OCR công tơ vẫn ở giai đoạn thử nghiệm, với lựa chọn chỉnh vùng hoặc nhập tay khi ảnh khó đọc. Ảnh CCCD được quản lý bên ngoài Trozy. [Quy trình công tơ](docs/METER-READER.md) · [Danh mục model và SHA-256](MODELS-OCR/README.md) · [Tích hợp AI](<docs/analysis and design/AI-INTEGRATION.md>)

**UC64/B05** về dự báo công nợ, doanh thu và phòng trống là đề tài nghiên cứu tùy chọn. VietQR cung cấp thông tin chuyển khoản và chủ trọ xác nhận khoản thu. Ký số hợp đồng, đối soát ngân hàng tự động và ứng dụng native nằm ngoài phạm vi phát hành hiện tại.

## Chạy trên máy

Cần **Node.js 24 trở lên** và npm. Từ thư mục gốc của repo, chạy:

```powershell
npm ci
npm run dev
```

Mở `http://127.0.0.1:5173`. API mặc định chạy ở cổng `3001`, SQLite lưu trong `data/trozy.sqlite`. Khi dữ liệu người dùng đang trống và seed demo được bật, bản Node tạo các tài khoản mẫu dưới đây.

| Vai trò | Email | Mật khẩu mẫu trên máy |
| --- | --- | --- |
| Chủ trọ | `chu@trozy.vn` | `Trozy@2026` |
| Người thuê | `thue@trozy.vn` | `Trozy@2026` |
| Chủ trọ độc lập để kiểm tra phân quyền | `khac@trozy.vn` | `Trozy@2026` |

Chép `.env.example` thành `.env` khi cần cấu hình môi trường riêng. Có thể đặt `TROZY_DB_PATH` tới một tệp SQLite mới để thử với dữ liệu độc lập. Thư xác thực trên máy vào outbox cục bộ khi chưa thiết lập SMTP. Dependency, runtime, model, cache, tệp tạm và dữ liệu riêng của Trozy đặt trong thư mục dự án. [Cấu hình bản Node](docs/IMPLEMENTATION.md) · [Biến môi trường mẫu](.env.example)

Để chạy bản đã build, dừng tiến trình dev rồi dùng `npm run build` và `npm start`. Mở `http://127.0.0.1:3001`. Để chạy Worker bằng D1/KV mô phỏng hoặc phát hành lên Cloudflare, làm theo hướng dẫn riêng. [Hướng dẫn Worker](docs/CLOUDFLARE.md)

## Kiểm thử và phát hành

```powershell
npm test
npm run check:pages
npm run build
npm run cf:check
```

GitHub Actions chạy kiểm thử Node, render trang, build production và đóng gói thử Cloudflare Worker khi có PR hoặc push vào `main`. Bản ứng dụng `68f9714` qua cả ba job ở thời điểm phát hành. Trên máy, bản tích hợp có **272/272 ca kiểm thử đạt** và **134 lượt render**. Build hiện có cảnh báo kích thước một số gói JavaScript. [Workflow CI](.github/workflows/ci.yml) · [Kết quả CI của bản ứng dụng](https://github.com/TVinhQuang/Trozy/actions/runs/45996008533) · [Chỉ mục kiểm thử](docs/test/README.md)

Sau khi phát hành lên Cloudflare ngày 27/11/2026, trang chủ và các tệp JavaScript/CSS chính khớp bản build, `/api/health` xác nhận D1 hoạt động và API dữ liệu yêu cầu đăng nhập. Độ chính xác OCR trên tập ảnh thực tế, giao thư tới hộp thư và nghiệm thu từng luồng use case cần minh chứng riêng. [API health](https://trozy.nhom11.workers.dev/api/health)

## Mã nguồn và tài liệu PA

| Vị trí | Nội dung |
| --- | --- |
| [`src/frontend/`](src/frontend/) · [`public/`](public/) | Giao diện React/TypeScript, manifest và biểu tượng PWA. |
| [`src/backend/`](src/backend/) · [`src/shared/`](src/shared/) | API Node/SQLite, quyền truy cập, nghiệp vụ và các quy tắc dùng chung. |
| [`src/cloudflare/`](src/cloudflare/) · [`cloudflare/migrations/`](cloudflare/migrations/) | Worker, xác thực, email, D1, KV và migration. |
| [`src/ai/`](src/ai/) · [`scripts/`](scripts/) · [`tests/`](tests/) | Trợ lý, OCR, lệnh chạy dự án và bộ kiểm thử. |
| [`docs/`](docs/) | Yêu cầu, thiết kế, hướng dẫn và kiểm thử. [Mốc tiến độ 26/11](docs/PROJECT-STATUS.md) lưu kết quả lịch sử. |
| [PA0](pa/PA0/) · [PA1](pa/PA1/) · [PA2](pa/PA2/) | Thiết lập nhóm, kế hoạch, Vision, đặc tả, prototype và báo cáo. Kế hoạch v2.0 ở [Project Plan PA2](<pa/PA2/rup_sdpln_sp (2.0).docx>). |
| [PA3](pa/PA3/) · [PA4](pa/PA4/) | Kiến trúc, sơ đồ, UI và báo cáo PA3. Đề PA4 và hướng dẫn demo. [Thay đổi đặc tả PA3 v2](pa/PA3/Changes.md) · [Hướng dẫn demo](docs/CLOUDFLARE.md) |

Jira dùng để quản lý sprint và truy vết module, use case, task, test case. GitHub lưu mã nguồn, Pull Request và kết quả CI. Khi sửa tài liệu hoặc mã nguồn, ghi rõ phạm vi và minh chứng kiểm tra trong PR. Giữ dữ liệu demo ở dạng giả lập và để secret, `.env`, dữ liệu thật, ảnh định danh và runtime ngoài Git.

## Nhóm 11

| Thành viên | Vai trò theo Project Plan v2.0 |
| --- | --- |
| Trần Vinh Quang | PM / Scrum Master / AI Lead |
| Phạm Đặng Thiên Quốc | PO / Business Analyst |
| Phạm Nguyễn Trường Huy | Architect / Backend Developer |
| Nguyễn Đức Dũng | Frontend / UI/UX Developer |
| Đặng Biên Phúc Lâm | QA / Documentation |
