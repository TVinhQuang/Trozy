# Trozy — Smart Rental Management System

Trozy là ứng dụng web quản lý nhà trọ của **Nhóm 11**, môn **Nhập môn Công nghệ phần mềm — 24C01**. Hệ thống kết nối chủ trọ và người thuê trong các nghiệp vụ quản lý phòng, hợp đồng, điện nước, hóa đơn, thanh toán và sửa chữa.

Repository lưu mã nguồn, tài liệu dự án, minh chứng kiểm thử và bài nộp PA. **Jira quản lý công việc theo sprint; GitHub quản lý phiên bản và review thay đổi.**

## Liên kết và tình trạng hiện tại

| Nội dung | Địa chỉ / tình trạng |
| --- | --- |
| Repository | [TVinhQuang/Trozy](https://github.com/TVinhQuang/Trozy) |
| Nhánh tích hợp | `main` |
| Jira của nhóm | Chưa bổ sung đường dẫn trong README; PM cập nhật khi chia sẻ board |
| Kế hoạch tham chiếu | [Project Plan v2.0](<pa/PA2/rup_sdpln_sp (2.0).docx>) |
| Prototype mới nhất | [UI PA2](pa/PA2/Trozy_UI_PA2_Team11.html) — tải file hoặc clone repo để chạy |

**Trạng thái nội dung tại ngày 25/10/2026:** repository có tài liệu yêu cầu, Vision v1.0, Project Plan v1.0/v2.0 và hai prototype HTML. Bản PA2 có dữ liệu mẫu và thao tác phía trình duyệt, lưu bằng LocalStorage. `src/frontend`, `src/backend` và `src/ai` mới là khung thư mục; chưa có backend, database, xác thực thật hoặc tích hợp AI/ngân hàng. Framework, database và quy trình build sẽ được cập nhật sau khi nhóm chốt kiến trúc.

Các mốc Build trong README là **kế hoạch**, không phải xác nhận đã hoàn thành. Prototype PA2 không thay thế Build 0 và không có nghĩa là đã đủ toàn bộ bài nộp PA2.

## Thành viên và trách nhiệm

Theo Project Plan v2.0, mỗi thành viên có vai trò chính và cùng tham gia review, phát triển, kiểm thử.

| Thành viên | Vai trò chính | Phạm vi phụ trách |
| --- | --- | --- |
| Trần Vinh Quang | PM / Scrum Master / AI Lead | Kế hoạch, Jira, tiến độ, báo cáo, phối hợp nhóm; B01–B04 và nghiên cứu B05 |
| Phạm Đặng Thiên Quốc | PO / Business Analyst | Yêu cầu, Vision, quy tắc nghiệp vụ, use case và ưu tiên tính năng |
| Phạm Nguyễn Trường Huy | Architect / Backend Developer | Kiến trúc, database, API, xác thực, phân quyền và nghiệp vụ backend |
| Nguyễn Đức Dũng | Frontend / UI/UX Developer | Giao diện chủ trọ, cổng người thuê, responsive và tích hợp API |
| Đặng Biên Phúc Lâm | QA / Documentation | Test plan, test case, kiểm thử, ghi nhận lỗi và rà soát tài liệu |

## Phạm vi sản phẩm

Trozy phục vụ đúng hai vai trò nghiệp vụ:

- **Chủ trọ:** quản lý nhiều cơ sở, phòng, người thuê, hợp đồng, chỉ số điện nước, hóa đơn, công nợ, tiền cọc và vận hành.
- **Người thuê:** xem dữ liệu được cấp quyền của mình, theo dõi hóa đơn/thanh toán, nhận thông báo và gửi yêu cầu sửa chữa, gia hạn hoặc trả phòng.

Danh mục chức năng chính sử dụng mã **M01–M23**, chia thành năm nhóm:

| Nhóm | Module | Nội dung |
| --- | --- | --- |
| A | M01–M05 | Tài khoản, cơ sở, phòng, người thuê, hợp đồng |
| B | M06–M11 | Điện nước, dịch vụ, hóa đơn, thanh toán/công nợ, tiền cọc, thu chi |
| C | M12–M19 | Cổng người thuê, bảo trì, tài sản, bàn giao, thông báo, yêu cầu hỗ trợ, tài liệu, phương tiện |
| D | M20–M21 | Dashboard, báo cáo, cấu hình và quản trị dữ liệu |
| E | M22–M23 | Smart Utility Insights và AI Rental Assistant |

Luồng nghiệp vụ xuyên suốt: **thiết lập phòng → thêm người thuê → hợp đồng và tiền cọc → ghi chỉ số → phát hành hóa đơn → xác nhận thu tiền → bảo trì → trả phòng và quyết toán**.

Các hướng mở rộng AI được tích hợp vào nghiệp vụ hiện có:

| Mã | Tính năng | Ưu tiên theo kế hoạch PA2 |
| --- | --- | --- |
| B01 | AI Operations Copilot | MVP giới hạn, chỉ làm khi Build 2 ổn định và còn nguồn lực |
| B02 | Cảnh báo tiêu thụ điện nước bất thường | Dự kiến Build 2 |
| B03 | OCR hỗ trợ nhập chỉ số công tơ / tài liệu | OCR công tơ dự kiến Build 2; phạm vi giấy tờ cần BA/PM thống nhất |
| B04 | AI phân loại yêu cầu sửa chữa | Dự kiến Build 3 |
| B05 | Dự báo công nợ, doanh thu, phòng trống | Nghiên cứu tính khả thi; triển khai đầy đủ thuộc hướng phát triển sau |

Chỉ số OCR cần người dùng kiểm tra trước khi tính tiền. VietQR hỗ trợ thông tin chuyển khoản; chủ trọ xác nhận đã nhận tiền trong bản cơ bản. AI không tự quyết định thanh toán, hợp đồng hoặc khấu trừ tiền cọc.

Phạm vi hiện tại không gồm đăng tin/tìm phòng, môi giới, nhân viên, cổng thanh toán thật, ký số hợp đồng hoặc chat thời gian thực. Sản phẩm chính là web, chưa triển khai ứng dụng native. Kế hoạch PA2 loại trừ lưu ảnh CCCD; phần OCR giấy tờ trong tài liệu chức năng cần được đối chiếu lại trước khi triển khai. Tài liệu chức năng còn một số tham chiếu M24; BA sẽ thống nhất mã module khi chốt baseline yêu cầu.

## Cấu trúc repository

Cấu trúc tuân theo đề PA0 và kế hoạch quản lý cấu hình của nhóm:

```text
Trozy/
├── README.md
├── .gitignore
├── src/
│   ├── frontend/            # Mã giao diện ứng dụng — chưa triển khai
│   ├── backend/             # API và nghiệp vụ — chưa triển khai
│   └── ai/                  # Tích hợp/thuật toán AI — chưa triển khai
├── docs/
│   ├── management/          # Tài liệu làm việc: kế hoạch, báo cáo tuần, biên bản
│   ├── requirements/        # Chức năng, Vision, use case, yêu cầu bổ sung
│   ├── analysis and design/ # Kiến trúc, mô hình dữ liệu, thiết kế và API
│   ├── test/                # Test plan, test case, test report, minh chứng
│   └── templates/           # Biểu mẫu được cung cấp; chưa phải kết quả của nhóm
└── pa/
    ├── PA0/                 # Đề bài và tài liệu PA0 hiện có
    ├── PA1/                 # Đề bài và artifact PA1 hiện có
    └── PA2/                 # Đề bài và artifact PA2 hiện có
```

Các thư mục chưa có nội dung sử dụng `.gitkeep` để được lưu trên GitHub. Khung thư mục không thể hiện tính năng hoặc tài liệu đã hoàn thành. Tạo thư mục PA3–PA5 khi có artifact tương ứng.

- `docs/`: nơi duy trì tài liệu làm việc, có version và revision history.
- `pa/PAx/`: lưu riêng bản chốt phục vụ từng lần nộp; không ghi đè bản đã nộp bằng bản đang chỉnh sửa. Các file PA1/PA2 hiện được giữ nguyên vị trí để nhóm tiếp tục đối chiếu và chốt bài.
- Mẫu trong `docs/templates/` cần được điền và review trước khi tính là deliverable.

## Tài liệu và sản phẩm hiện có

| Artifact | Vị trí |
| --- | --- |
| Đề PA0 — đăng ký nhóm và thiết lập công cụ | [PA0 specification](<pa/PA0/PA0-24C01-Group registration-Tools setup.pdf>) |
| Tài liệu PA0 của nhóm | [PA0.pdf](pa/PA0/PA0.pdf) |
| Đề PA1 | [PA1 specification](pa/PA1/PA1-24C01.pdf) |
| Project Plan v1.0 | [Kế hoạch PA1](<pa/PA1/rup_sdpln_sp (1.0).docx>) |
| Vision v1.0 | [Vision Document](<pa/PA1/Vision_Document (1.0).docx>) |
| UI phác thảo PA1 | [UI.html](pa/PA1/UI.html) |
| Đề PA2 | [PA2 specification](pa/PA2/PA2-24C01.pdf) |
| Project Plan v2.0 | [Kế hoạch PA2](<pa/PA2/rup_sdpln_sp (2.0).docx>) |
| UI tương tác PA2 | [Trozy_UI_PA2_Team11.html](pa/PA2/Trozy_UI_PA2_Team11.html) |
| Tổng hợp chức năng | [Chức năng chi tiết của web](<docs/requirements/Chức năng chi tiết của web.docx>) |
| Biểu mẫu Word và Excel | [docs/templates](docs/templates/) |

## Chạy prototype PA2

Cần Git để clone và một trình duyệt hiện đại. Prototype tự chứa HTML/CSS/JavaScript, không cần cài package, database hay API key.

```bash
git clone https://github.com/TVinhQuang/Trozy.git
cd Trozy
```

Trên Windows PowerShell, mở demo bằng:

```powershell
Start-Process ".\pa\PA2\Trozy_UI_PA2_Team11.html"
```

Hoặc mở trực tiếp file `pa/PA2/Trozy_UI_PA2_Team11.html` bằng trình duyệt. Trang xem mã HTML trên GitHub không chạy demo.

Ba luồng trình bày chính:

1. **UC01 — Quản lý phòng:** chọn vai trò Chủ trọ, thêm/sửa phòng; thử mã phòng trùng để xem xử lý lỗi.
2. **UC02 — Lập hóa đơn tháng:** chọn phòng và kỳ, nhập điện nước, xem trước rồi phát hành; thử tạo trùng kỳ và ghi nhận thu một phần.
3. **UC03 — Gửi yêu cầu sửa chữa:** chuyển sang Người thuê để tạo phiếu; chuyển sang Chủ trọ để tiếp nhận và báo đã sửa; quay lại Người thuê để xác nhận hoàn tất.

Dữ liệu demo lưu trên trình duyệt/máy đang dùng, không đồng bộ giữa các thành viên. Có thể khôi phục dữ liệu mẫu trong **Hướng dẫn demo → Đặt lại dữ liệu mẫu**. OCR, vai trò và thông tin thanh toán trong prototype là mô phỏng; chỉ dùng dữ liệu giả.

## Lộ trình và mốc PA

Theo Project Plan v2.0, dự án gồm năm sprint, mỗi sprint hai tuần, từ 05/10 đến 13/12/2026.

| Sprint | Thời gian | Mốc | Mục tiêu dự kiến |
| --- | --- | --- | --- |
| 1 | 05/10–18/10/2026 | PA1 — 18/10 | Khởi tạo dự án, Plan/Vision v1, UI phác thảo, báo cáo tuần |
| 2 | 19/10–01/11/2026 | PA2 / Build 0 — 01/11 | Yêu cầu/use case, kiến trúc ban đầu, prototype, nền tảng kỹ thuật và smoke test |
| 3 | 02/11–15/11/2026 | PA3 / Build 1 — 15/11 | Thiết kế chi tiết, test plan, nghiệp vụ thuê cốt lõi và hóa đơn từ chỉ số nhập tay |
| 4 | 16/11–29/11/2026 | PA4 / Build 2 — 29/11 | OCR, hóa đơn, VietQR, theo dõi thanh toán, cảnh báo bất thường, test case/report |
| 5 | 30/11–13/12/2026 | PA5 / Build 3 — 13/12 | Sửa chữa có AI, dashboard/báo cáo, kiểm thử cuối, hướng dẫn sử dụng và demo |

Phạm vi và thời hạn nộp chính thức phải đối chiếu đề PA và thông báo Moodle. Bảng trên phản ánh kế hoạch nội bộ; tiến độ thực tế được cập nhật trên Jira và báo cáo tuần. Tên Build 0–3 và mục tiêu kỹ thuật đi kèm do nhóm xác định trong Project Plan; đề PA2 không liệt kê riêng Build 0 là một mục bài nộp.

### Đối chiếu yêu cầu bài nộp

- **PA1:** Project Plan và Vision bản đầu; 3–6 màn hình UI chính; hai báo cáo tuần của Sprint 1; minh chứng thiết lập công cụ, phân công và theo dõi tiến độ.
- **PA2:** cập nhật Plan/Vision theo phản hồi TA; ghi Revision History và tô xanh phần thay đổi theo đề; use-case diagram/model và đặc tả **mọi use case trên diagram**; UI cho ít nhất ba use case quan trọng, nhất quán với đặc tả; báo cáo tuần và minh chứng theo dõi dự án.
- Đặc tả use case cần tên, basic/main flow, alternative flows, preconditions và postconditions theo template được cung cấp.
- Execution and Tracking chiếm **20 điểm** ở cả PA1 và PA2: cần thể hiện hoạt động của các thành viên, task/sprint, tiến độ, báo cáo và phối hợp thực tế. README hoặc một lần upload file không thay thế các minh chứng này.
- Khi nộp, đóng gói theo tên đề bài: `PA1-Group11.zip`, `PA2-Group11.zip` (hoặc RAR nếu dùng định dạng được đề cho phép), rồi nộp qua Moodle. GitHub lưu bản đối chiếu và lịch sử, không thay thế thao tác nộp Moodle.

Theo đề PA0, nhóm còn cần ít nhất năm cuộc phỏng vấn người dùng/khách hàng tiềm năng và bằng chứng. Proposal hiện có mô tả kế hoạch phỏng vấn; repository chưa có kết quả phỏng vấn để xác nhận đã hoàn thành.

## Theo dõi công việc và quản lý phiên bản

### Jira và báo cáo

- Dùng một board Jira của nhóm, tổ chức công việc theo sprint. Mỗi task/bug/change request có người phụ trách, hạn hoàn thành và trạng thái **To Do → In Progress → Done**.
- Gắn mã module `Mxx`, tính năng `Bxx`, use case `UCxx` khi phù hợp. Đưa liên kết Jira vào PR để truy ngược từ yêu cầu đến thay đổi mã/tài liệu.
- Duy trì truy vết **module/tính năng → use case → Jira task → test case**, cập nhật tại sprint review. Có thể lưu bảng truy vết trong `docs/requirements/` khi nhóm lập tài liệu này.
- PM tổng hợp báo cáo tuần vào `docs/management/`: việc đã làm, việc đang làm, khó khăn và kế hoạch tuần sau. Các thành viên cập nhật Jira trước buổi họp nhóm.
- Theo kế hoạch: sprint planning ở đầu sprint, hai buổi họp ngắn mỗi tuần, review/retrospective cuối sprint. Sau baseline yêu cầu ngày 01/11/2026, thay đổi phạm vi được ghi nhận trên Jira và BA/PM đánh giá tác động trước khi nhóm thống nhất.

GitHub cung cấp lịch sử commit, PR và release làm minh chứng. GitHub Issues/Projects không phải board đã được thiết lập cho dự án và không thay thế Jira trong kế hoạch hiện tại.

### Branch, commit và pull request

Theo Project Plan, thay đổi mã nguồn đi qua **branch → pull request → review → `main`**. Nhóm áp dụng cùng cách này cho tài liệu để dễ đối chiếu. Sau lần khởi tạo repository, thành viên làm trên nhánh riêng; PM/BE cấu hình bảo vệ `main` và yêu cầu review trên GitHub. Các thiết lập bảo vệ nhánh, CI và staging cần được thiết lập riêng, không được bật chỉ bằng README.

Quy ước tên dưới đây là hướng dẫn nhóm đề xuất, không phải quy định riêng của giảng viên:

- Nhánh: `feature/<jira-key>-<mo-ta>`, `fix/<jira-key>-<mo-ta>`, `docs/<jira-key>-<mo-ta>`; thay `<jira-key>` bằng mã task thật.
- Commit nhỏ, mô tả đúng thay đổi; ví dụ `docs: update PA2 project plan` hoặc `feat: add monthly invoice validation`. Khi có task Jira, ghi mã task để truy vết.
- PR nêu mục đích, liên kết task/use case, nội dung thay đổi, cách kiểm tra và ảnh minh chứng nếu đổi giao diện. Người thực hiện gửi review trước khi merge.
- Với Word/Excel, phân công rõ người đang sửa để hạn chế xung đột; PR cần tóm tắt phần nội dung đã thay đổi.

Ví dụ bắt đầu một thay đổi sau khi đã clone repository:

```bash
git switch main
git pull --ff-only origin main
git switch -c docs/update-weekly-report
# Chỉnh sửa và kiểm tra các file thuộc task của mình
git add <duong-dan-file>
git commit -m "docs: update weekly report"
git push -u origin docs/update-weekly-report
```

Sau đó mở pull request về `main` trên GitHub. Không dùng tài khoản Git chung cho cả nhóm; mỗi thành viên đóng góp bằng tài khoản của mình để lưu được lịch sử tham gia.

### Build và bản nộp

- Build 0–3 được kiểm tra theo phạm vi đã thống nhất, có phiên bản/tag nhận diện trên GitHub. Đề xuất dùng `build-0`, `build-1`, `build-2`, `build-3` khi build tương ứng được xác nhận; hiện chưa có build/release được xác nhận trong repository.
- Khi có ứng dụng chạy được, phối hợp triển khai staging và smoke test theo kế hoạch; lỗi được ghi trên Jira, kết quả kiểm thử lưu trong `docs/test/`.
- Trước khi chốt PA, đối chiếu tài liệu, mã, kiểm thử và yêu cầu đề bài; giữ bản nộp chính thức trong `pa/PAx/`. ZIP bài nộp không bị loại bởi `.gitignore`.
- Cập nhật version/revision history của tài liệu và ghi commit/tag liên quan trong báo cáo để xác định đúng trạng thái đã nộp.

## Các việc nhóm cần cập nhật tiếp

- [ ] Bổ sung đường dẫn Jira và xác nhận quyền truy cập của các thành viên/giảng viên theo yêu cầu môn học.
- [ ] Thiết lập bảo vệ `main` và quy trình review PR trên GitHub.
- [ ] Bổ sung báo cáo tuần, biên bản và tài liệu làm việc vào đúng thư mục `docs/`.
- [ ] Rà soát PA2: cập nhật Vision, use-case model/specifications, yêu cầu bổ sung, kiến trúc/thiết kế ban đầu và các artifact theo đề bài.
- [ ] Chốt stack, xây dựng nền tảng kỹ thuật và kiểm tra Build 0; bổ sung hướng dẫn cài đặt/build/test khi có mã ứng dụng.
- [ ] Thống nhất các tham chiếu M23/M24 và phạm vi OCR giấy tờ giữa tài liệu chức năng, Vision và kế hoạch.

## Dữ liệu và file đưa lên Git

Chỉ sử dụng dữ liệu giả cho test/demo. Không commit mật khẩu, API key, file `.env`, thông tin cá nhân thật hoặc ảnh giấy tờ tùy thân. Dùng `.env.example` với giá trị mẫu khi cần chia sẻ cấu hình.

`.gitignore` loại file tạm, cache, dependencies, output build và cấu hình riêng. Tài liệu Word/PDF/Excel, lockfile của trình quản lý package, ảnh minh chứng và ZIP bài nộp vẫn có thể được theo dõi. Kiểm tra `git status` và diff trước mỗi commit; `.gitignore` không tự loại file đã được Git theo dõi.
