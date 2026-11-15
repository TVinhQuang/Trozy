# Báo cáo so sánh chi tiết thay đổi: Bản 1.0 vs Bản mới nhất (Version 2.0 - PA3)

Tài liệu này ghi lại toàn bộ sự khác biệt giữa phiên bản gốc **`Use case model, specifications 1.0`** (Version 1.0) và phiên bản mới nhất **`Use case model, specifications 2.0`** (Version 2.0).

## 1. Tổng quan thay đổi

| Hạng mục so sánh | Bản cũ (`1.0`) | Bản mới nhất (`2.0`) | Ghi chú thay đổi | 
| ----- | ----- | ----- | ----- | 
| **Tên hệ thống** | TROZY – Rental Management System | TROZY – Rental Management System | Không đổi | 
| **Phiên bản (Version)** | `1.0` | `2.0` | Phiên bản 2.0 (PA3) hợp nhất toàn bộ các cập nhật sau bản 1.0 | 
| **Tổng số nhóm nghiệp vụ** | 5 nhóm (Group A – Group E) | 5 nhóm (Group A – Group E) | Không đổi | 
| **Tổng số Module** | 23 Module (`M01` – `M23`) | 23 Module (`M01` – `M23`) | Không đổi | 
| **Tổng số Use Case** | 73 Use Case (`UC01` – `UC73`) | 73 Use Case (`UC01` – `UC73`) | Không đổi cấu trúc và mã định danh | 
| **Số UC thay đổi nội dung** | — | **29 Use Case** | Bổ sung ràng buộc nghiệp vụ, xử lý ngoại lệ, kiểm tra quyền và luồng liên kết | 
| **Số UC giữ nguyên nội dung** | — | **44 Use Case** | Giữ nguyên hoàn toàn nội dung đặc tả (UC34 chỉ thêm số thứ tự `1.` ở AF1) | 

### Các nhóm thay đổi nghiệp vụ & kỹ thuật trọng tâm ở bản mới nhất (v2.0):

1. **Xác thực & Quản lý tài khoản (`UC02`, `UC05`, `UC06`):** Chuẩn hóa cơ chế xác thực email dùng một lần có thời hạn gắn với từng mục đích (đăng ký mới vs. đổi email), tách luồng đổi email chờ xác nhận (`pending replacement email`), và chuyển khôi phục mật khẩu sang dùng **mã OTP qua email** thay cho đường dẫn đặt lại mật khẩu.

2. **Bảo mật dữ liệu cá nhân & OCR (`UC15`, `UC16`):** Quyết định phạm vi PA3 — quản lý thành viên phòng không yêu cầu điều kiện tiên quyết về thu thập sự đồng ý (`consent`) tại UC15; **loại bỏ hoàn toàn tính năng quét/tải ảnh CCCD** khỏi hệ thống (chủ trọ tự giữ ảnh CCCD bên ngoài Trozy và nhập tay số CCCD để mã hóa/che giấu), giới hạn **UC16 OCR chỉ áp dụng cho hợp đồng giấy**.

3. **Vòng đời phòng, Hợp đồng & Chuyển phòng (`UC12`, `UC17`, `UC20`, `UC21`, `UC22`):** Bảo toàn trạng thái vòng đời phòng khi sửa thông tin phòng (`UC12`); bổ sung luồng chuyển phòng có truy vết dữ liệu, tài khoản liên kết và lịch sử (`UC17`); bổ sung luồng tiếp tục chỉnh sửa hợp đồng nháp (`UC20`); quy định tiền thuê kỳ lẻ do hai bên tự thỏa thuận và chủ trọ nhập tay vào hóa đơn thay vì hệ thống tự chia theo ngày (`UC21`, `UC32`, `UC33`, `UC52`); chuyển trạng thái hợp đồng sang `Terminating` và phòng sang `Awaiting handover` ngay tại thời điểm chủ trọ phê duyệt chấm dứt hợp đồng (`UC22`).

4. **Công tơ điện nước theo phân đoạn (`UC26`, `UC27`, `UC29`):** Bổ sung logic thay công tơ giữa kỳ, tính sản lượng theo từng phân đoạn (`meter segment` của công tơ cũ và mới) và hiển thị tách bạch theo phương thức tính phí (theo công tơ, theo đầu người, cố định).

5. **Hóa đơn, Thanh toán QR, Cọc & Sổ thu chi (`UC30`, `UC32`, `UC33`, `UC36`–`UC39`, `UC41`, `UC42`):** Ràng buộc tổng tiền hóa đơn hiệu lực phải $\ge 0$ và xử lý hóa đơn $0\text{ đ}$ (`Settled - no amount due`); tạo mã VietQR theo đúng số tiền còn nợ thực tế; bắt buộc tất toán toàn bộ hóa đơn trước khi tất toán tiền cọc; quy định chi phí hư hỏng trong thời gian thuê tính vào hóa đơn kỳ kế tiếp, còn hư hỏng phát sinh khi trả phòng sẽ trừ vào tiền cọc và xuất hóa đơn phụ cho phần vượt cọc (`UC41`, `UC47`, `UC51`, `UC52`); tự động ghi nhận khoản thu khi xác nhận thanh toán và bắt buộc sửa sai sót khoản thu thông qua giao dịch thanh toán gốc (`UC42`).

6. **Xử lý sự cố với AI sau khi gửi phiếu (`UC45`, `UC46`):** Thay đổi thứ tự luồng — người thuê gửi phiếu yêu cầu sửa chữa (`New`) trước, sau đó hệ thống mới gọi AI phân loại/đề xuất mức ưu tiên gắn vào chính phiếu đó để chủ trọ xem xét phê duyệt.

7. **Quản trị dữ liệu & Nhật ký truy cập (`UC67`, `UC68`):** Hoàn thiện quy trình xác minh danh tính/thẩm quyền và kiểm tra quy tắc lưu trữ trước khi xóa dữ liệu theo yêu cầu (`UC67`); bổ sung màn hình xem **Nhật ký truy cập (`Access log`) chỉ đọc** tách biệt với nhật ký thay đổi nghiệp vụ (`UC68`).

## 2. So sánh Phần đầu tài liệu & Mục 1: Use-case Model

### 2.1. Tiêu đề & Lịch sử sửa đổi (Revision History)

* **Phiên bản tài liệu:** Đổi từ `Version 1.0` thành `Version 2.0`.

* **Bảng Revision History:** Bản `1.0` chỉ có 1 dòng (`23/Oct/26 | 1.0`). Bản mới nhất hợp nhất toàn bộ các cập nhật thành **Version 2.0 (`11/Nov/26 – 13/Nov/26` – Phạm Đặng Thiên Quốc, Trần Vinh Quang)** với các nhóm thay đổi chính:

  * **Quản lý tài khoản & định danh (`UC02`, `UC05`, `UC06`, `UC15`, `UC16`):** Chuẩn hóa xác thực và OTP email; quyết định phạm vi PA3 bỏ điều kiện tiên quyết về `consent` tại `UC15`, nhập tay số CCCD (mã hóa/che giấu), lưu ảnh CCCD bên ngoài Trozy và giới hạn `UC16` OCR chỉ áp dụng cho hợp đồng giấy.

  * **Vòng đời phòng, hợp đồng & công tơ (`UC12`, `UC17`, `UC20`, `UC21`, `UC22`, `UC26`, `UC27`, `UC29`):** Bảo toàn trạng thái phòng khi sửa thông tin; chuyển phòng có truy vết; tiếp tục chỉnh sửa hợp đồng nháp; nhập tay tiền thuê kỳ lẻ tự thỏa thuận; chuyển phòng sang `Awaiting handover` ngay khi duyệt chấm dứt hợp đồng; quản lý phân đoạn công tơ khi thay công tơ và hiển thị tách bạch theo phương thức tính phí.

  * **Hóa đơn, thanh toán QR, tiền cọc & sổ thu chi (`UC30`, `UC32`, `UC33`, `UC36`–`UC39`, `UC41`, `UC42`):** Ràng buộc tổng hóa đơn hiệu lực $\ge 0$ và xử lý hóa đơn $0\text{ đ}$; tạo mã VietQR theo đúng số dư thực tế; bắt buộc tất toán mọi hóa đơn trước khi tất toán cọc; khấu trừ cọc và lập hóa đơn phụ phần vượt cọc khi trả phòng; tự động ghi nhận khoản thu từ `UC37` và sửa khoản thu thông qua giao dịch thanh toán gốc.

  * **Bảo trì AI, bàn giao trả phòng & quản trị dữ liệu (`UC45`–`UC47`, `UC51`, `UC52`, `UC67`, `UC68`):** Đánh giá AI trên một phiếu sau khi người thuê xác nhận gửi; tính phí hư hỏng trong kỳ vào hóa đơn kỳ tới; đồng bộ quy trình bàn giao – quyết toán – đóng hợp đồng; hoàn thiện xác minh/xác nhận xóa dữ liệu theo yêu cầu (`UC67`) và bổ sung màn hình Nhật ký truy cập chỉ đọc (`UC68`).

### 2.2. Mục lục (Table of Contents)

* Danh sách 23 Module và 73 Use Case giữ nguyên hoàn toàn tên gọi và đánh số.

* Số trang trong mục lục được cập nhật lại do nội dung đặc tả mở rộng (tổng số trang tăng từ 58 trang ở bản 1.0 lên 70 trang ở bản 2.0).

### 2.3. Mục 1.1 – Actors

* **Bảng định nghĩa Actor (`Landlord` và `Tenant`):** Giữ nguyên 100%.

* **Đoạn ghi chú (`Note:`) ngay dưới bảng Actors — THAY ĐỔI:**

  * **Bản 1.0:** Giải thích về các tác vụ chạy tự động theo lịch (không phải Actor thứ 3) và khẳng định AI, OCR, dự báo chỉ mang tính hỗ trợ, quyền quyết định thuộc về Chủ trọ.

  * **Bản mới nhất:** Thay thế bằng quy ước ký hiệu biểu đồ (*Diagram conventions*): hình elip màu xanh dương dùng cho 1 Actor, elip màu vàng dùng chung cho cả Landlord và Tenant, elip nét đứt là Use Case nằm ở sơ đồ khác, mũi tên nét đứt là quan hệ `include` hoặc `extend`.

### 2.4. Mục 1.2 – 1.10 (Các sơ đồ Use-case Diagram – Figure 1 đến Figure 9)

* **Không thay đổi:** Toàn bộ 9 sơ đồ (tổng quan và chi tiết từng nhóm module) và chú thích hình giữ nguyên.

### 2.5. Mục 1.11 – Use-case List

* **Không thay đổi:** Toàn bộ bảng danh sách 73 Use Case (`ID`, `Use case`, `Actors`, `Module`) giữ nguyên.

## 3. So sánh chi tiết Mục 2: Use-case Specifications

### Module M01: Account and Authentication Management

#### UC01 – Register Account

* **Không thay đổi.**

#### UC02 – Verify Email *(Thay đổi toàn diện)*

* **Brief description:** Mở rộng phạm vi từ việc chỉ xác minh email khi đăng ký (`UC01`) sang bao gồm cả **xác minh email thay thế đang chờ xử lý (`pending replacement email`)** từ `UC06`. Quy định rõ mỗi mã/liên kết xác thực đều được ràng buộc chặt chẽ với tài khoản, mục đích xác thực và địa chỉ email đích.

* **Basic Flow:** Viết lại thành 6 bước chi tiết:

  * Xác định liên kết/mã xác thực có giới hạn thời gian, dùng một lần, gắn với tài khoản, mục đích đăng ký và email đã đăng ký từ `UC01`.

  * Bổ sung kiểm tra: tài khoản, mục đích, email đích, thời hạn hiệu lực, trạng thái chưa sử dụng và giới hạn số lần thử.

  * Xác nhận địa chỉ email đích vẫn thuộc về lần đăng ký đó và chưa bị tài khoản khác sử dụng.

  * Đánh dấu cả email đã đăng ký và tài khoản sang trạng thái `"Verified"`, tiêu hủy mã hiện tại (`consumes the challenge`) và vô hiệu hóa các mã đăng ký cũ trước đó.

* **Alternative Flows (Mở rộng từ 2 luồng lên 5 luồng):**

  * **AF1 – Verify a pending replacement email *(Mới)*:** Xử lý khi người dùng đổi email tại `UC06`. Lưu email mới ở trạng thái chờ (`pending`), gửi mã/link dùng một lần tới đúng email mới trong khi giữ nguyên email cũ đang hiệu lực và trạng thái tài khoản `"Verified"`. Khi xác nhận thành công, áp dụng email mới, xóa trạng thái chờ và vô hiệu hóa các mã cũ. Nêu rõ mã đặt lại mật khẩu chỉ có thẩm quyền đặt lại mật khẩu.

  * **AF2 – Invalid, expired or previously used challenge *(Mở rộng từ AF1 cũ)*:** Áp dụng cho cả đăng ký và đổi email; giữ nguyên email hiệu lực và trạng thái tài khoản; cho phép gửi lại mã mới trong giới hạn cấu hình và vô hiệu hóa mã cũ.

  * **AF3 – Email unavailable or pending request replaced *(Mới)*:** Từ chối thao tác nếu email đã bị gán cho tài khoản khác hoặc mã xác thực thuộc về yêu cầu đổi email cũ đã bị thay thế.

  * **AF4 – Registration already verified *(Cập nhật từ AF2 cũ)*:** Đảm bảo tính lũy đẳng (thao tác chỉ hoàn tất một lần), thông báo đã xác minh và chuyển hướng đăng nhập.

  * **AF5 – Cancel, delivery failure or processing failure *(Mới)*:** Cho phép hủy yêu cầu đổi email đang chờ qua `UC06` (vô hiệu hóa mã); báo lỗi thực tế khi gửi email hoặc xử lý thất bại và giữ nguyên trạng thái hiện tại.

* **Pre-conditions & Post-conditions:** Tách bạch điều kiện và kết quả đầu ra cho cả hai trường hợp (xác minh đăng ký mới vs. xác minh đổi email), đảm bảo hủy/lỗi không làm thay đổi email hiệu lực hiện tại.

#### UC03 – Log In & UC04 – Log Out

* **Không thay đổi.**

#### UC05 – Change and Reset Password *(Thay đổi toàn diện)*

* **Brief description:** Thay đổi cơ chế khôi phục mật khẩu từ việc bấm vào liên kết đặt lại mật khẩu sang **xác minh quyền kiểm soát email đã xác thực hiện tại bằng mã OTP** trước khi hiển thị biểu mẫu nhập mật khẩu mới.

* **Basic Flow:** Đánh số 1–5, bổ sung kiểm tra phiên đăng nhập, quyền sở hữu tài khoản và quy tắc độ mạnh mật khẩu theo cấu hình trước khi lưu và đăng xuất các phiên khác.

* **Alternative Flows (Mở rộng từ 2 luồng lên 5 luồng):**

  * **AF1 – Recover a forgotten password with email OTP *(Thay thế AF1 cũ)*:** 9 bước chi tiết. Hiển thị thông báo xác nhận chung (không tiết lộ email có tồn tại hay không); gửi mã OTP dùng một lần, có thời hạn, gắn với tài khoản, email xác thực hiện tại và mục đích đặt lại mật khẩu; xác thực OTP hợp lệ trước khi cấp quyền đặt lại mật khẩu tạm thời; sau khi lưu mật khẩu mới, tiêu hủy OTP, vô hiệu hóa các mã khôi phục khác, chấm dứt toàn bộ phiên đăng nhập hiện có và yêu cầu đăng nhập lại.

  * **AF2 – Invalid password or confirmation *(Mở rộng từ AF2 cũ)*:** Xử lý lỗi nhập sai cho cả luồng đổi mật khẩu và luồng OTP (cho phép nhập lại mật khẩu mới nếu quyền đặt lại từ OTP còn hiệu lực, nếu hết hạn phải xác thực OTP lại).

  * **AF3 – OTP invalid, expired or used, or attempt limit reached *(Mới)*:** Từ chối cấp quyền đặt lại mật khẩu, giữ nguyên mật khẩu cũ, cho phép nhập lại trong giới hạn hoặc yêu cầu OTP mới (vô hiệu hóa OTP cũ).

  * **AF4 – No eligible verified recovery email *(Mới)*:** Vẫn hiển thị thông báo chung ra bên ngoài nhưng không cấp quyền đặt lại mật khẩu; làm rõ rằng email thay thế đang chờ xác minh (`pending`) chỉ trở thành email khôi phục sau khi hoàn tất `UC02`.

  * **AF5 – Authorization expires, delivery fails or user cancels *(Mới)*:** Xử lý khi hết hạn phiên/quyền đặt lại, lỗi gửi OTP (ghi log và áp dụng giới hạn thử lại), lỗi lưu mật khẩu hoặc người dùng hủy thao tác.

* **Pre-conditions & Post-conditions:** Làm rõ yêu cầu xác thực OTP trước khi mở form đặt lại mật khẩu và đảm bảo mật khẩu cũ không thay đổi nếu quy trình bị hủy hoặc lỗi.

#### UC06 – Manage Personal Information *(Thay đổi đáng kể)*

* **Brief description:** Bổ sung rõ quyền yêu cầu đổi sang một địa chỉ email thay thế đã qua xác minh (`verified replacement email`).

* **Basic Flow:** Đánh số 1–6:

  * Bước 2 hiển thị thêm địa chỉ email thay thế đang chờ xác minh (nếu có).

  * Bước 5 kiểm tra quyền truy cập chính chủ và kiểm tra định dạng, tính khả dụng của email thay thế.

  * Bước 6 lưu các thông tin hồ sơ hợp lệ khác ngay lập tức, trong khi email mới chỉ có hiệu lực sau khi hoàn tất xác minh riêng.

* **Alternative Flows:**

  * **AF1 – Invalid input:** Đánh số bước, giữ nguyên logic báo lỗi tại trường không hợp lệ.

  * **AF2 – Request or complete an email change *(Mở rộng)*:** 4 bước. Ghi nhận email mới ở trạng thái chờ (`pending`) và gọi luồng đổi email của `UC02`; giữ nguyên email hiện tại trong thời gian chờ; cập nhật email hiệu lực và xóa trạng thái chờ sau khi `UC02` thành công; cho phép người dùng hủy hoặc thay thế yêu cầu đổi email đang chờ.

* **Post-conditions:** Khẳng định chỉ email thay thế đã xác minh thành công mới có hiệu lực; trường hợp chờ xác minh hoặc thất bại vẫn giữ nguyên email và trạng thái tài khoản hiện tại.

#### UC07 – Configure Notification Preferences

* **Không thay đổi.**

### Module M02: Property and Building Management

#### UC08, UC09, UC10, UC11

* **Không thay đổi.**

### Module M03: Room Management

#### UC12 – Manage Rooms *(Thay đổi đáng kể)*

* **Basic Flow:** Đánh số 1–6; bổ sung bước kiểm tra quyền truy cập khu trọ (`verifies property access`) ở bước 2; làm rõ khái niệm giá thuê niêm yết (`listed rent`) ở bước 3.

* **Alternative Flows:**

  * **AF1 – Edit room information *(Mở rộng)*:** 3 bước. Làm rõ việc sửa giá thuê niêm yết giữ nguyên điều khoản hợp đồng hiện tại và chỉ áp dụng cho hợp đồng mới hoặc phụ lục được duyệt. Bổ sung quy tắc quan trọng: **lưu thông tin chỉnh sửa và lịch sử nhưng phải bảo toàn trạng thái vòng đời hiện tại của phòng, hợp đồng hiện có và liên kết cư trú** (trạng thái khởi tạo `Vacant` chỉ áp dụng khi tạo mới phòng; việc chuyển đổi trạng thái vòng đời phải thực hiện qua `UC13` hoặc quy trình hợp đồng/bàn giao).

  * **AF2 – Deactivate a room *(Mở rộng)*:** 3 bước. Bổ sung kiểm tra quyền sở hữu, hợp đồng hiệu lực và tình trạng cư trú trước khi vô hiệu hóa và ghi lịch sử.

  * **AF3 – Duplicate code, invalid data or access denied *(Mở rộng)*:** 2 bước. Bổ sung xử lý từ chối khi lỗi phân quyền trước lúc lưu; đảm bảo thao tác lỗi hoặc bị hủy giữ nguyên dữ liệu phòng, trạng thái và các bản ghi liên kết.

* **Post-conditions:** Cập nhật tương ứng để khẳng định việc chỉnh sửa không làm thay đổi trạng thái vòng đời hiện tại của phòng.

#### UC13 – Update Room Status & UC14 – Search Rooms and View Rental History

* **Không thay đổi.**

### Module M04: Tenant and Room Member Management

#### UC15 – Manage Tenant Profiles *(Thay đổi toàn diện theo quyết định PA3)*

* **Brief description:** Viết lại hoàn toàn:

  * Xác định quy trình quản lý **người thuê đại diện (`representative tenant`)** và **các thành viên khác cùng phòng**, bao gồm cả người chưa có tài khoản Trozy.

  * Khẳng định **tư cách thành viên phòng là cơ sở của luồng nghiệp vụ này; việc thu thập sự đồng ý (`collecting consent`) không phải là điều kiện tiên quyết trong UC15** (việc thu thập consent khi đăng ký tài khoản thuộc `UC01`).

  * Quy định thông tin định danh được **nhập thủ công**: Trozy lưu **số CCCD dưới dạng văn bản, mã hóa khi lưu trữ và che giấu (`mask`) khi hiển thị**. **Ảnh chụp CCCD do chủ trọ tự lưu giữ riêng bên ngoài Trozy; ứng dụng không tải lên, chụp, lưu trữ hay xử lý ảnh CCCD.**

* **Basic Flow:** Viết lại thành 8 bước chi tiết:

  * Bước 1–2: Chọn khu trọ và phòng thuộc quyền quản lý; hệ thống kiểm tra quyền truy cập phòng và hiển thị người đại diện cùng các thành viên hiện có của phòng đó để tránh tạo nhóm phòng rời rạc.

  * Bước 3–4: Nhập thông tin người thuê đại diện (họ tên, ngày sinh, SĐT, email nếu có, số CCCD nhập tay) và thêm từng người ở cùng như một thành viên định danh của cùng phòng đó (phân biệt rõ người đại diện với thành viên khác; thành viên không bắt buộc có tài khoản).

  * Bước 5: Kiểm tra trường bắt buộc, định dạng số CCCD, liên kết phòng và cảnh báo trùng lặp số CCCD hoặc số điện thoại trong phạm vi được phép.

  * Bước 6–8: Lưu hồ sơ với trạng thái `"No account"` nếu chưa liên kết tài khoản, mã hóa và che giấu số CCCD. Nêu rõ việc tạo hồ sơ không tự động kích hoạt hợp đồng, không thay đổi ngày ở hay cấp quyền truy cập phòng (các thao tác nhận phòng/trả phòng/chuyển phòng thuộc `UC17`).

* **Alternative Flows (Mở rộng từ 3 luồng lên 6 luồng):**

  * **AF1 – Edit an existing profile:** Giữ nguyên mã định danh hồ sơ, liên kết tài khoản và lịch sử thuê; việc chuyển phòng hoặc đổi ngày ở phải thực hiện qua `UC17` thay vì ghi đè lịch sử; lưu chỉnh sửa không làm mất trạng thái liên kết tài khoản hiện có.

  * **AF2 – Possible duplicate profile:** Hiển thị thông tin trong phạm vi cho phép để chủ trọ phân biệt người trùng; cho phép chọn hồ sơ cũ hoặc xác nhận tạo hồ sơ mới riêng biệt; cảnh báo trùng không tự tạo bản sao định danh hay vượt qua kiểm tra quyền phòng.

  * **AF3 – Fill information from a paper contract *(Thay đổi từ "Enter information from a document image")*:** Chỉ gọi `UC16` cho **ảnh hợp đồng giấy** (không chấp nhận ảnh CCCD); chủ trọ tự bổ sung các trường còn thiếu bằng tay.

  * **AF4 – Invalid data or inconsistent room association *(Mới)*:** Báo lỗi và không lưu nếu thiếu dữ liệu bắt buộc, sai định dạng CCCD hoặc thành viên đang gắn với phòng/hợp đồng khác mà chưa có cập nhật cư trú hợp lệ.

  * **AF5 – Access is denied or changes before saving *(Mới)*:** Từ chối thao tác nếu phòng hoặc hồ sơ nằm ngoài phạm vi quản lý của chủ trọ mà không làm lộ dữ liệu được bảo vệ.

  * **AF6 – Cancel or saving fails *(Mới)*:** Hủy bỏ các chỉnh sửa chưa xác nhận khi người dùng hủy; không ghi dữ liệu dở dang khi lưu lỗi.

* **Pre-conditions & Post-conditions:** Làm rõ tài khoản người thuê, hợp đồng hiệu lực và bản ghi consent không phải điều kiện bắt buộc để tạo hồ sơ; khẳng định tuyệt đối không có ảnh CCCD đi vào hệ thống Trozy.

#### UC16 – Extract Document Information with OCR *(Thay đổi toàn diện theo quyết định PA3)*

* **Brief description:** Giới hạn phạm vi OCR **chỉ áp dụng cho hợp đồng giấy (`paper contract only`)**. Loại bỏ hoàn toàn việc quét ảnh CCCD hoặc tra cứu tự động thông tin cá nhân từ số CCCD nhập tay.

* **Basic Flow:** Viết lại thành 9 bước:

  * Bước 1–2: Khi đang sửa hồ sơ hoặc hợp đồng nháp, chủ trọ chọn `"Enter from paper contract"`; hệ thống kiểm tra quyền truy cập và hiển thị khung tải ảnh hợp đồng giấy kèm **thông báo không được gửi ảnh CCCD**.

  * Bước 3–5: Tải lên/chụp ảnh hợp đồng giấy -> kiểm tra định dạng, dung lượng, độ rõ nét -> gửi OCR trích xuất các trường có thực trên hợp đồng (các bên, phòng, giá thuê, tiền cọc, thời hạn, ngày tháng); đánh dấu các trường thiếu hoặc không chắc chắn để kiểm tra chứ không tự suy diễn.

  * Bước 6–8: Hiển thị đối chiếu song song ảnh hợp đồng và dữ liệu trích xuất -> chủ trọ sửa lỗi, chọn trường áp dụng và xác nhận -> hệ thống kiểm tra lại quyền và điền vào biểu mẫu đang chỉnh sửa (chưa lưu chính thức hay kích hoạt hợp đồng).

  * Bước 9: Ảnh hợp đồng giấy gốc chỉ có thể được lưu dưới dạng tài liệu hợp đồng được phân quyền; kết quả OCR chưa xác nhận không được lưu thành dữ liệu hồ sơ/hợp đồng.

* **Alternative Flows (Mở rộng từ 2 luồng lên 6 luồng):**

  * **AF1 – Unsupported, oversized or unreadable contract image:** Báo lỗi cụ thể về tệp/độ mờ, không áp dụng dữ liệu trích xuất, cho phép tải ảnh rõ hơn hoặc nhập tay.

  * **AF2 – OCR unavailable or extraction fails:** Báo lỗi dịch vụ OCR, giữ nguyên dữ liệu hiện có, không suy diễn danh tính từ số CCCD.

  * **AF3 – Partial or uncertain results:** Cho phép chủ trọ sửa thủ công các trường đọc thiếu/sai hoặc chụp lại ảnh rõ hơn; không tự động chấp nhận giá trị thiếu chắc chắn.

  * **AF4 – Reject or cancel the extraction:** Xóa bỏ kết quả OCR chưa xác nhận và bản sao xử lý tạm thời.

  * **AF5 – CCCD image input is attempted *(Mới)*:** Hệ thống không cung cấp tùy chọn tải lên/chụp ảnh CCCD; nếu phát hiện nguồn ảnh là CCCD sẽ từ chối ngay thay vì gửi OCR hay lưu trữ, đồng thời hướng dẫn quay lại `UC15` để nhập số CCCD thủ công.

  * **AF6 – Authorization is denied or changes during processing *(Mới)*:** Từ chối thao tác và không tiết lộ dữ liệu nếu mất quyền truy cập trong quá trình xử lý.

* **Pre-conditions & Post-conditions:** Khẳng định ảnh CCCD không bao giờ được lưu trữ hay xử lý tạm thời bởi Trozy, và không thực hiện tra cứu danh tính từ số CCCD nhập tay.

#### UC17 – Manage Occupancy *(Thay đổi đáng kể)*

* **Brief description:** Bổ sung mô tả chi tiết cho nghiệp vụ **chuyển phòng có truy vết (`traceable transfer`)**: chuyển hồ sơ hiện có của những người được chọn, liên kết tài liệu được phép và ngữ cảnh tài khoản liên kết sang phòng mới từ ngày hiệu lực, đồng thời bảo toàn lịch sử phòng và quá trình thuê trước đó.

* **Basic Flow:** Đánh số 1–5; bổ sung kiểm tra quyền sở hữu, hợp đồng hiệu lực, sức chứa phòng, ngày tháng và liên kết cư trú trước khi lưu kỳ ở với trạng thái `"Currently renting"`.

* **Alternative Flows (Mở rộng từ 3 luồng lên 5 luồng):**

  * **AF1 – Record move-out:** Đóng kỳ cư trú từ ngày rời đi, chuyển trạng thái sang `"Left"`, lưu lịch sử theo ngày và hướng dẫn sang quy trình trả phòng nếu phòng không còn người ở.

  * **AF2 – Transfer room with information and documents *(Mở rộng chi tiết thành 10 bước)*:**

    * Hiển thị phòng nguồn, hợp đồng, người đại diện và thành viên; chủ trọ chọn những người chuyển đi, phòng trống đích (cùng chủ trọ) và ngày hiệu lực chuyển phòng.

    * Kiểm tra quyền, tình trạng cư trú hiện tại, sức chứa phòng đích và ngày hợp đồng; xem xét phụ lục/phiên bản hợp đồng chuyển phòng (`UC21`) hoặc hợp đồng phòng đích (`UC20`).

    * Nếu vẫn còn người ở lại phòng nguồn, bắt buộc phải thiết lập người đại diện và hợp đồng hợp lệ cho cả hai phòng trước khi kích hoạt.

    * Hiển thị màn hình xem trước (`preview`) đầy đủ thông tin chuyển phòng; kiểm tra lại điều kiện ngay trước khi thực thi; thực hiện ghi nhận đồng bộ toàn bộ (kỳ cư trú, liên kết thành viên, hợp đồng, ngữ cảnh tài khoản liên kết, liên kết tài liệu, trạng thái hai phòng và lịch sử chuyển phòng) tại ngày hiệu lực; thông báo cho người thuê liên kết.

  * **AF3 – Capacity, contract or occupancy conflict:** Báo xung đột (sức chứa, ngày, quyền sở hữu, hợp đồng) và không ghi thay đổi.

  * **AF4 – Future effective transfer date *(Mới)*:** Cho phép lên lịch chuyển phòng cho ngày trong tương lai trong khi giữ nguyên phòng và ngữ cảnh tài khoản hiện tại; tự động kiểm tra lại điều kiện vào đúng ngày hiệu lực trước khi áp dụng (nếu không còn hợp lệ thì giữ nguyên hiện trạng và báo chủ trọ xác nhận lại).

  * **AF5 – Cancel, authorization change or execution failure *(Mới)*:** Cho phép hủy lịch chuyển phòng tương lai; hoàn tác toàn bộ (`rollback`) nếu lỗi thực thi giữa chừng và chỉ gửi thông báo hoàn tất sau khi ghi nhận thành công.

* **Pre-conditions & Post-conditions:** Đảm bảo hóa đơn, biên lai, thanh toán, bằng chứng công tơ và phiên bản hợp đồng cũ vẫn giữ nguyên phòng gốc, ngày tháng và ý nghĩa tài chính ban đầu; số dư nợ và tiền cọc vẫn truy vết được về bản ghi gốc.

#### UC18 & UC19

* **Không thay đổi.**

### Module M05: Rental Contract Management

#### UC20 – Create Rental Contract *(Thay đổi đáng kể)*

* **Basic Flow:** Đánh số 1–7; làm rõ ở bước 3 và bước 7 rằng hợp đồng ghi nhận **điều khoản tiền cọc trên hợp đồng (`contractual deposit terms`)**, còn **việc thu tiền cọc thực tế được ghi nhận riêng qua `UC40`**.

* **Alternative Flows (Mở rộng từ 3 luồng lên 5 luồng):**

  * **AF1, AF2, AF3:** Chuẩn hóa đánh số bước cho các luồng trùng thời gian hợp đồng, lưu bản nháp (`Draft`) và tạo hồ sơ người thuê trước qua `UC15`.

  * **AF4 – Open and continue a saved draft *(Mới – 5 bước)*:** Cho phép chủ trọ mở lại hợp đồng ở trạng thái `"Draft"`, tải lại mã định danh, thông tin phòng, người thuê, mẫu và lịch sử nháp để chỉnh sửa; kiểm tra lại tính khả dụng của phòng và ngày tháng (loại trừ chính bản nháp đang sửa khỏi kiểm tra trùng lặp, nhưng vẫn chặn nếu có hợp đồng hiệu lực khác trùng thời gian); cho phép lưu nháp tiếp hoặc hoàn tất trên cùng mã định danh hợp đồng.

  * **AF5 – Cancel or saving fails *(Mới)*:** Bảo toàn dữ liệu đã lưu trước đó (giữ nguyên bản nháp ở lần lưu thành công gần nhất) nếu hủy hoặc lưu lỗi.

* **Pre-conditions & Post-conditions:** Phân biệt rõ điều khoản cọc trong hợp đồng với giao dịch thu cọc thực tế (`UC40`); bổ sung điều kiện và kết quả cho việc tiếp tục chỉnh sửa hợp đồng nháp.

#### UC21 – Extend Contract and Create Addendum *(Thay đổi ở luồng thay thế)*

* **Alternative Flows:**

  * **AF1 – Handle an extension request submitted by the Tenant:** Đánh số 3 bước, giữ nguyên nội dung.

  * **AF2 – Rent or terms change during a billing period *(Viết lại từ AF2 cũ)*:** 3 bước. Quy định rõ khi ngày hiệu lực của phụ lục đổi giá thuê rơi vào giữa kỳ thanh toán, chủ trọ ghi nhận thỏa thuận và ngày hiệu lực vào phụ lục; **chủ trọ và người thuê tự thỏa thuận riêng số tiền thuê cho kỳ lẻ đó và chủ trọ nhập tay số tiền đã thỏa thuận thông qua `UC33` khi lập hóa đơn kỳ bị ảnh hưởng. Hệ thống lưu ngày hiệu lực làm lịch sử thỏa thuận và không tự động chia tiền thuê theo ngày (`no system-generated daily proration`)**. Điện nước và dịch vụ vẫn tính theo phương thức đã cấu hình.

#### UC22 – Terminate Contract *(Thay đổi toàn diện)*

* **Brief description:** Quy định rõ khi chủ trọ phê duyệt chấm dứt hợp đồng hiệu lực, hệ thống **chuyển ngay hợp đồng sang trạng thái `Terminating` và chuyển phòng sang trạng thái `Awaiting handover`**, sau đó mới tiếp tục quy trình kiểm tra hiện trạng và quyết toán.

* **Basic Flow:** Viết lại thành 6 bước chi tiết:

  * Mở hợp đồng hiệu lực hoặc yêu cầu chấm dứt từ người thuê; nhập ngày kết thúc thỏa thuận và lý do; kiểm tra quyền sở hữu, trạng thái hợp đồng và tính hợp lệ của ngày kết thúc.

  * Hiển thị thông tin đề xuất chấm dứt để chủ trọ xác nhận phê duyệt.

  * Ngay khi phê duyệt, đồng thời chuyển hợp đồng sang `"Terminating"`, chuyển phòng sang `"Awaiting handover"`, và tạo mới hoặc dùng lại biên bản trả phòng (`move-out record`) gắn với lần chấm dứt này.

  * Ghi lịch sử phê duyệt, thông báo cho người thuê và hướng dẫn tiếp tục quy trình kiểm tra/bàn giao/quyết toán qua `UC51` và `UC52`.

* **Alternative Flows (Mở rộng từ 2 luồng lên 4 luồng):**

  * **AF1 – Review a Tenant termination request:** Làm rõ bản thân yêu cầu của người thuê chưa làm thay đổi trạng thái hợp đồng hay phòng cho tới khi chủ trọ phê duyệt ở bước 4.

  * **AF2 – Reject or cancel before approval *(Mới)*:** Cho phép chủ trọ từ chối yêu cầu (kèm lý do) hoặc hủy thao tác trước khi duyệt mà không làm thay đổi trạng thái hợp đồng/phòng.

  * **AF3 – Termination already approved or contract ineligible *(Cập nhật từ AF2 cũ)*:** Nếu đợt chấm dứt này đã được duyệt trước đó, hệ thống mở lại hợp đồng `Terminating` và biên bản trả phòng hiện có thay vì lặp lại chuyển trạng thái hay tạo trùng bản ghi; từ chối nếu hợp đồng ở trạng thái không hợp lệ khác.

  * **AF4 – Invalid date, authorization change or save failure *(Mới)*:** Báo lỗi kiểm tra/phân quyền và đảm bảo không ghi cập nhật dở dang lên hợp đồng, phòng hoặc biên bản trả phòng nếu lưu thất bại.

* **Pre-conditions & Post-conditions:** Làm rõ hợp đồng chỉ chuyển sang `Ended` và phòng chuyển sang `Vacant` sau khi hoàn tất quy trình `UC52`.

#### UC23, UC24, UC25

* **Không thay đổi.**

### Module M06: Utility Meter Management

#### UC26 – Configure Meters and Utility Rates *(Thay đổi đáng kể)*

* **Basic Flow:** Viết lại thành 6 bước, nêu rõ khi xác nhận thay công tơ, hệ thống **đóng phân đoạn công tơ cũ (`old meter segment`) và mở phân đoạn công tơ mới (`new meter segment`) đồng thời trong cùng lần lưu**.

* **Alternative Flows:**

  * **AF1 – Replace a meter *(Mở rộng thành 4 bước)*:** Chủ trọ nhập ngày thay công tơ, chỉ số chốt của công tơ cũ, mã và chỉ số đầu của công tơ mới kèm bằng chứng ảnh -> hệ thống kiểm tra chỉ số chốt công tơ cũ so với các chỉ số đã xác nhận của chính công tơ đó, kiểm tra chỉ số đầu công tơ mới và thứ tự ngày thay -> chủ trọ xem trước và xác nhận ranh giới thay công tơ -> hệ thống lưu đồng thời cả hai phân đoạn và lịch sử thay thế để `UC27` tính tiêu thụ từng phân đoạn.

  * **AF2 – Invalid configuration or replacement data *(Mở rộng)*:** Báo lỗi cụ thể trường/thiết bị/ngày không hợp lệ và giữ nguyên cấu hình đã lưu gần nhất nếu thao tác bị từ chối, lỗi hoặc hủy.

* **Post-conditions:** Bổ sung việc lưu giữ chỉ số chốt công tơ cũ, chỉ số đầu công tơ mới và ngày thay để tính toán theo từng phân đoạn công tơ.

#### UC27 – Record and Finalize Meter Readings *(Thay đổi đáng kể)*

* **Basic Flow:** Viết lại thành 7 bước hỗ trợ tính toán theo **phân đoạn công tơ (`meter segment`)**:

  * Hiển thị mã công tơ và chỉ số đầu kỳ của từng phòng, bao gồm cả phân đoạn công tơ cũ và mới nếu có thay công tơ trong kỳ.

  * Kiểm tra chỉ số cuối kỳ $\ge$ chỉ số đầu kỳ của **cùng phân đoạn công tơ đó**, tính sản lượng từng phân đoạn (`chỉ số cuối - chỉ số đầu`), cộng tổng các phân đoạn hợp lệ và nhân đơn giá.

  * Lưu chỉ số đề xuất, công tơ nguồn, người ghi, thời gian và chi tiết tính toán; khóa số liệu sau khi chủ trọ chọn `"Finalize readings"`.

* **Alternative Flows:**

  * **AF1 – Lower reading or genuine replacement *(Mở rộng thành 3 bước)*:** Xác định chính xác công tơ có chỉ số lỗi; nếu là thay công tơ thực tế, chuyển sang `UC26` để lưu ranh giới thay thế rồi tải lại các phân đoạn công tơ của kỳ đó; định nghĩa rõ công thức tính từng phân đoạn (`công tơ cũ = chỉ số chốt - chỉ số đầu kỳ`, `công tơ mới = chỉ số cuối kỳ - chỉ số khởi tạo`) và kiểm tra hợp lệ độc lập từng phân đoạn.

  * **AF2, AF3, AF4:** Chuẩn hóa đánh số bước cho quét OCR theo phân đoạn công tơ (`UC28`), sửa số liệu đã chốt kèm lịch sử và hóa đơn điều chỉnh (`UC33`), và cảnh báo bất thường (`UC70`).

* **Post-conditions:** Khẳng định số liệu và bằng chứng được lưu theo từng phân đoạn công tơ.

#### UC28 – Recognize Meter Readings with OCR

* **Không thay đổi.**

#### UC29 – View Utility Readings and Charges *(Thay đổi đáng kể)*

* **Basic Flow:** Viết lại thành 4 bước, phân tách thông tin hiển thị theo từng phương thức tính phí điện/nước:

  * **Tính theo công tơ:** Hiển thị mã công tơ, chỉ số đầu/cuối, ảnh chụp, đơn giá, **sản lượng từng phân đoạn sau thay công tơ**, tổng sản lượng và thành tiền.

  * **Tính theo đầu người:** Hiển thị số người áp dụng, đơn giá và thành tiền.

  * **Tính phí cố định:** Hiển thị mức phí cố định áp dụng và thành tiền.

* **Alternative Flows:**

  * **AF1 – Meter-based period awaiting finalization *(Mở rộng thành 2 bước)*:** Chỉ ẩn số tiền và gắn nhãn `"Readings not finalized"` đối với các khoản **tính theo công tơ** chưa chốt số; làm rõ **các khoản tính theo đầu người và phí cố định vẫn hiển thị cơ sở tính toán độc lập với việc chốt công tơ**, và các trường chỉ số công tơ chỉ hiển thị khi áp dụng phương thức theo công tơ.

### Module M07: Service and Surcharge Management

#### UC30 – Manage Services and Surcharges *(Thay đổi ở luồng thay thế)*

* **Alternative Flows:**

  * **AF1 & AF3:** Chuẩn hóa đánh số bước cho sửa giá dịch vụ và ngừng áp dụng dịch vụ.

  * **AF2 – Add an extra charge or deduction *(Mở rộng thành 3 bước)*:** Bổ sung quy định chi tiết cho **khoản bồi thường hư hỏng của người thuê (`Tenant damage charge`)**: tham chiếu tới sự cố, hợp đồng thuê chịu trách nhiệm, số tiền đã duyệt và bằng chứng ghi nhận tại `UC47`; được gán vào **hóa đơn hàng tháng kế tiếp** và giữ nguyên **cùng một mã tham chiếu khoản phí (`charge reference`)** xuyên suốt quá trình lập nháp và phát hành; nếu nhập lặp lại sẽ dùng lại mã tham chiếu gốc; sửa khoản phí chưa phát hành sẽ cập nhật bản nháp hiện có, còn sửa khoản phí đã phát hành phải qua lịch sử điều chỉnh của `UC33`.

#### UC31 – View Services and Applicable Charges

* **Không thay đổi.**

### Module M08: Invoice Management

#### UC32 – Generate Periodic Invoices *(Thay đổi toàn diện)*

* **Brief description:** Làm rõ việc tổng hợp hóa đơn nháp định kỳ từ tiền thuê, điện nước, dịch vụ và các khoản phí một lần đã duyệt, kết hợp bước chủ trọ rà soát **tiền thuê kỳ lẻ tự thỏa thuận** trước khi phát hành.

* **Basic Flow:** Viết lại thành 6 bước:

  * Kiểm tra phương thức tính điện nước (theo công tơ cần chốt số; theo đầu người/cố định dùng số lượng/đơn giá cấu hình).

  * Chống tạo trùng hóa đơn định kỳ cho cùng đối tượng và kỳ thanh toán.

  * Tổng hợp tiền phòng, điện, nước, dịch vụ, phụ thu và giảm trừ; **mỗi khoản phí hư hỏng của người thuê đang chờ thu trong kỳ được đưa vào đúng một lần** kèm tham chiếu sự cố, số tiền, ghi chú và bằng chứng.

  * Kiểm tra **các khoản thu và giảm trừ đều không âm (**$\ge 0$**) và tổng tiền hóa đơn sau cùng không âm (**$\ge 0$**)** trước khi lưu trạng thái `Draft`; liên kết mã nguồn của từng khoản phí để việc chạy lại không gây trùng lặp.

  * Hiển thị bản nháp để chủ trọ rà soát (và nhập số tiền thuê kỳ lẻ tự thỏa thuận nếu có) trước khi phát hành qua `UC33`.

* **Alternative Flows (Mở rộng từ 3 luồng lên 5 luồng):**

  * **AF1, AF2, AF3:** Chuẩn hóa đánh số bước cho trường hợp thiếu chốt số công tơ (vẫn tạo hóa đơn cho phòng đủ dữ liệu hoặc dùng phương thức theo người/cố định), hóa đơn định kỳ đã tồn tại (mở hóa đơn cũ thay vì tạo trùng), và tạo hóa đơn cho 1 phòng.

  * **AF4 – Privately agreed partial-period rent *(Mới – 2 bước)*:** Chủ trọ nhập trực tiếp số tiền thuê kỳ lẻ đã tự thỏa thuận với người thuê vào bản nháp kèm ghi chú; Trozy sử dụng nguyên số tiền nhập tay đó mà không áp dụng công thức chia tự động theo ngày.

  * **AF5 – Move-out precedes the next damage-charge invoice *(Mới – 2 bước)*:** Nếu người thuê chuyển sang quyết toán trả phòng trước khi hóa đơn định kỳ kế tiếp được phát hành, chủ trọ chuyển nguyên mã tham chiếu khoản phí hư hỏng đang chờ đó sang hóa đơn quyết toán cuối cùng qua `UC52`; hệ thống gỡ dòng phí đó khỏi bản nháp định kỳ chưa phát hành, tính lại tổng bản nháp và chuyển liên kết sang quyết toán cuối.

* **Pre-conditions & Post-conditions:** Bảo đảm tính duy nhất của khoản phí hư hỏng (chỉ tính một lần) và ghi nhận cơ sở nhập tay cho tiền thuê kỳ lẻ.

#### UC33 – Adjust and Issue Invoices *(Thay đổi toàn diện)*

* **Brief description:** Ràng buộc **tổng tiền hiệu lực của hóa đơn phải bằng 0 hoặc dương (**$\ge 0$**)**, xử lý trạng thái hóa đơn $0\text{ đ}$, và bảo toàn hóa đơn gốc cùng lịch sử liên kết khi điều chỉnh.

* **Basic Flow:** Viết lại thành 7 bước:

  * Hiển thị chi tiết các dòng phí, công thức tính và **các khoản hư hỏng liên kết kèm số tiền, ghi chú và bằng chứng**.

  * Cho phép sửa dòng phí/ghi chú và nhập tiền thuê kỳ lẻ tự thỏa thuận.

  * Kiểm tra các khoản tăng và giảm trừ đều không âm và **mức giảm trừ không được làm tổng tiền hiệu lực của hóa đơn bị âm (**$< 0$**)**.

  * Khi xác nhận `"Issue"`, kiểm tra lại tổng tiền và liên kết nguồn phí, **từ chối nếu khoản phí đã được đưa vào một hóa đơn khác**, khóa nội dung và lưu lịch sử:

    * Nếu tổng tiền còn phải trả $> 0$: đặt hạn thanh toán và trạng thái `"Unpaid"`.

    * Nếu tổng tiền bằng $0$: hiển thị trạng thái **`"Settled - no amount due"`** (Đã tất toán – không phát sinh số tiền phải trả), ghi nhận lý do tất toán và **không tạo biên lai thu tiền, không ghi bút toán thu vào sổ thu chi và không tạo mã QR thanh toán**.

  * Thông báo người thuê và đánh dấu các khoản phí liên kết là đã xuất hóa đơn một lần.

* **Alternative Flows (Mở rộng từ 3 luồng lên 4 luồng):**

  * **AF1 – Adjust an issued invoice *(Mở rộng thành 4 bước)*:** Cho phép điều chỉnh tăng hoặc giảm trên hóa đơn đã phát hành mà vẫn giữ nguyên bản gốc; kiểm tra tổng tiền hiệu lực sau điều chỉnh $\ge 0$; giữ nguyên các biên lai thực thu đã xác nhận (nếu thu thừa thì xử lý theo luồng thu thừa của `UC37`); chuyển trạng thái sang `Settled - no amount due` nếu tổng hiệu lực về $0$.

  * **AF2 – Export PDF or print:** Xuất PDF/in kèm đầy đủ số tiền, trạng thái, ghi chú và lịch sử điều chỉnh.

  * **AF3 – Delete a draft *(Mở rộng thành 2 bước)*:** Khi xóa bản nháp chưa phát hành, **hệ thống giữ lại bản ghi gốc của khoản phí hư hỏng hoặc phụ thu và giải phóng liên kết nháp** để có thể đưa vào một hóa đơn hợp lệ khác sau này.

  * **AF4 – Reduction exceeds the charges or input is invalid *(Mới – 2 bước)*:** Từ chối lưu hoặc phát hành nếu mức giảm trừ làm tổng tiền hiệu lực bị âm; khẳng định $0\text{ đ}$ **vẫn là một tổng tiền hợp lệ**.

* **Pre-conditions & Post-conditions:** Bảo đảm tổng tiền hóa đơn hiệu lực không âm, bảo toàn liên kết nguồn phí và không phát sinh giao dịch thu tiền giả cho hóa đơn $0\text{ đ}$.

#### UC34 – View and Download Invoices

* **Hầu như không thay đổi:** Chỉ bổ sung đánh số `1.` ở đầu Alternative flow 1.

#### UC35 – Submit Invoice Review Request

* **Không thay đổi.**

### Module M09: Payment and Debt Management

#### UC36 – Configure Receiving Account and Generate VietQR Code *(Thay đổi toàn diện)*

* **Basic Flow:** Viết lại thành 5 bước:

  * Khi mở một hóa đơn đã phát hành, hệ thống tải phiên bản hiện tại và các khoản đã xác nhận thu.

  * **Nếu số dư còn phải trả dương (**$> 0$**):** Tạo mã VietQR điền sẵn **đúng toàn bộ số tiền còn phải trả hiện tại**, tài khoản nhận và nội dung tham chiếu (mã hóa đơn, phòng, kỳ).

  * **Nếu số dư bằng** $0$**:** Hiển thị trạng thái đã tất toán / không phát sinh số tiền phải trả và **bỏ qua việc tạo mã QR**.

* **Alternative Flows (Mở rộng từ 2 luồng lên 3 luồng):**

  * **AF1 – Receiving account missing or QR generation fails:** Báo lỗi cụ thể khi thiếu thông tin tài khoản nhận hoặc lỗi sinh mã QR; hướng dẫn người thuê liên hệ chủ trọ để thanh toán qua phương thức thay thế.

  * **AF2 – Receiving account updated:** Lưu lịch sử thay đổi tài khoản nhận và áp dụng cấu hình mới cho các hướng dẫn thanh toán tạo sau đó.

  * **AF3 – Amount due or invoice version changes *(Mới – 2 bước)*:** Tải lại dữ liệu hóa đơn sau mỗi lần xác nhận thu tiền hoặc điều chỉnh hóa đơn trước khi hiển thị QR; chỉ sinh mã QR mới nếu số dư còn nợ $> 0$; nếu đã tất toán thì hiển thị trạng thái đã thanh toán (ảnh QR cũ người thuê đã lưu từ trước vẫn phải qua bước đối soát thực thu của chủ trọ).

* **Post-conditions:** Nhấn mạnh mã QR điền sẵn đúng số tiền hiện tại và người thuê/chủ trọ xác nhận thực thu qua `UC37`.

#### UC37 – Confirm Payment *(Thay đổi toàn diện)*

* **Brief description:** Làm rõ luồng QR tiêu chuẩn dùng để tất toán toàn bộ số dư hiện tại, trong khi các trường hợp ngoại lệ được xác minh thực tế như **thu thiếu (`short receipt`)** hoặc **thu thừa (`excess receipt`)** được ghi nhận qua các luồng thay thế tương ứng và giữ nguyên lịch sử tài chính.

* **Basic Flow:** Viết lại thành 7 bước:

  * Mở hóa đơn còn nợ hoặc báo cáo `"Transferred"` đang chờ xác nhận; hiển thị phiên bản hóa đơn hiện tại, số tiền còn nợ, các lần thu đã xác nhận trước đó và báo cáo của người thuê.

  * Chủ trọ đối chiếu sao kê ngân hàng/tiền mặt thực tế, nhập/kiểm tra số tiền thực nhận, ngày nhận và mã tham chiếu giao dịch; hệ thống kiểm tra số tiền $> 0$ và đối chiếu với số dư hiện tại.

  * Khi chủ trọ xác nhận đã nhận tiền, hệ thống kiểm tra lại số dư hiện tại và bản ghi xác nhận để chống ghi trùng, lưu biên lai thu tiền đúng một lần, cập nhật số dư hóa đơn (chuyển sang đã thanh toán đủ nếu khớp), xuất biên lai, **tự động ghi nhận khoản thu vào sổ thu chi (`UC42`)** và thông báo cho người thuê.

* **Alternative Flows (Mở rộng từ 3 luồng lên 5 luồng):**

  * **AF1 – Verified short receipt *(Cập nhật từ "Partial payment")*:** Khi chủ trọ xác nhận số tiền thực nhận nhỏ hơn số dư nợ, hệ thống ghi nhận đúng số tiền thực nhận, đặt trạng thái `"Partially paid"`, giữ nguyên phần nợ còn lại và cập nhật mã QR theo số nợ còn lại.

  * **AF2 – Verified excess receipt *(Cập nhật từ "Tenant overpays")*:** Tách bạch phần tất toán hóa đơn và phần tiền thu thừa; chủ trọ chọn phương án cấn trừ kỳ sau hoặc hoàn trả kèm lịch sử liên kết.

  * **AF3 – Tenant reports Transferred:** Liên kết chặt với báo cáo chờ xác nhận tạo từ `UC39` và bắt buộc đi qua bước đối soát thực thu ở các bước 2–5.

  * **AF4 – Receipt not established or reference is unclear *(Mới – 2 bước)*:** Cho phép giữ báo cáo ở trạng thái chờ xác nhận hoặc từ chối kèm lý do hợp lệ nếu tiền chưa về tài khoản hoặc nội dung chuyển khoản không rõ ràng; bảo toàn số dư đã xác nhận hiện tại.

  * **AF5 – Repeated confirmation, changed balance or saving failure *(Mới – 2 bước)*:** Chặn xác nhận lặp lại (hiển thị kết quả đã xác nhận một lần); bắt buộc đối chiếu lại nếu số dư hóa đơn đã thay đổi kể từ lúc mở màn hình xem trước; hoàn tác toàn bộ (thanh toán, biên lai, sổ thu chi) nếu lưu thất bại.

* **Post-conditions:** Bảo đảm mỗi khoản thực thu được cập nhật đồng bộ đúng một lần sang hóa đơn, công nợ, biên lai và sổ thu chi.

#### UC38 – Track Debts and Send Payment Reminders *(Thay đổi ở luồng cơ bản)*

* **Basic Flow:** Đánh số 1–5; bổ sung quy tắc ở bước 2: chỉ liệt kê các hóa đơn chưa thanh toán, thanh toán một phần hoặc quá hạn **có số dư nợ dương (**$> 0$**)**; **các hóa đơn đã tất toán với số tiền phải trả bằng** $0$ **(`Settled - no amount due`) được loại trừ khỏi danh sách theo dõi nợ và gửi nhắc nợ**.

#### UC39 – Pay via QR and View Payment History *(Thay đổi đáng kể)*

* **Basic Flow:** Viết lại thành 7 bước:

  * Tải hóa đơn hiện tại và các khoản đã xác nhận thu để hiển thị đúng số dư còn lại, thông tin tài khoản nhận, mã tham chiếu và mã VietQR tương ứng.

  * Người thuê quét QR bằng ứng dụng ngân hàng, kiểm tra tài khoản nhận, số tiền điền sẵn và nội dung chuyển khoản trước khi chuyển tiền; có thể bấm `"Transferred"` trên Trozy để tạo báo cáo chờ chủ trọ đối soát (`UC37`), sau đó xem lịch sử thanh toán đã xác nhận và tải biên lai.

* **Alternative Flows (Mở rộng từ 2 luồng lên 5 luồng):**

  * **AF1 – QR unavailable & AF2 – Pay in cash:** Chuẩn hóa đánh số bước và dẫn chiếu `UC37`.

  * **AF3 – Displayed invoice or balance has changed *(Mới – 2 bước)*:** Tự động tải lại hóa đơn nếu nội dung/số tiền đã thay đổi, làm mới mã QR nếu số dư $> 0$ hoặc chuyển sang luồng không phát sinh nợ nếu số dư bằng $0$; nếu người thuê đã lỡ chuyển khoản theo số cũ, chủ trọ sẽ đối soát giao dịch thực tế qua `UC37`.

  * **AF4 – Payment awaiting receipt confirmation *(Mới)*:** Hiển thị trạng thái đang chờ xác nhận cùng số dư xác nhận gần nhất trong khi chủ trọ chưa duyệt.

  * **AF5 – Invoice has no amount due *(Mới – 2 bước)*:** Đối với hóa đơn có số dư bằng $0$, hiển thị trạng thái đã tất toán / không phát sinh số tiền phải trả, cho phép xem/tải hóa đơn nhưng **bỏ qua sinh mã QR, bỏ qua tạo báo cáo chuyển khoản và bỏ qua tạo biên lai thu tiền**.

* **Post-conditions:** Khẳng định hướng dẫn chuyển khoản luôn khớp với số tiền hiện tại và mọi biên lai/số dư xác nhận đều xuất phát từ bước xác minh của chủ trọ tại `UC37`.

### Module M10: Security Deposit and Refund Management

#### UC40 – Record and Track Security Deposit

* **Không thay đổi.**

#### UC41 – Settle and Refund Security Deposit *(Thay đổi toàn diện)*

* **Brief description:** Viết lại hoàn toàn quy trình quyết toán tiền cọc khi kết thúc hợp đồng:

  * **Điều kiện tiên quyết bắt buộc:** Toàn bộ các hóa đơn hiện có (hóa đơn định kỳ, hóa đơn điều chỉnh, hóa đơn quyết toán cuối) **phải được tất toán xong (số dư nợ** $= 0$**)** trước khi tiến hành quyết toán cọc.

  * Chỉ xử lý khấu trừ cọc cho **các hư hỏng mới được phát hiện lúc kiểm tra trả phòng** (tránh tính trùng với hư hỏng đã đưa vào hóa đơn kỳ trước hoặc hóa đơn cuối).

  * **Quy tắc phân bổ cọc:** Tiền cọc đang giữ dùng để bù đắp chi phí hư hỏng tối đa bằng số tiền cọc hiện có; **nếu chi phí hư hỏng vượt quá tiền cọc, hệ thống tạo một hóa đơn phụ liên kết cho phần chênh lệch vượt cọc và người thuê phải thanh toán xong phần vượt cọc này trước khi hoàn tất quyết toán cọc**.

* **Basic Flow:** Viết lại thành 12 bước chi tiết:

  * Bước 1–2: Mở quyết toán cọc cho hợp đồng đã có biên bản bàn giao trả phòng được xác nhận; liệt kê toàn bộ hóa đơn trước đó, hóa đơn cuối và hóa đơn điều chỉnh để **kiểm tra tất cả số dư nợ đều bằng** $0$ (nếu có báo cáo chuyển khoản chờ duyệt phải xử lý qua `UC37` trước).

  * Bước 3–4: Hiển thị tiền cọc đang giữ và các mục hư hỏng khi trả phòng (loại trừ các mục đã thuộc hóa đơn định kỳ/cuối hoặc đợt quyết toán khác; giữ nguyên dữ liệu phân bổ và hóa đơn vượt cọc nếu đang mở lại cùng đợt quyết toán); ghi nhận từng mục hư hỏng kèm lý do, ghi chú và bằng chứng.

  * Bước 5–6: Tính toán **một bảng phân bổ duy nhất**: khấu trừ cọc (tối đa bằng cọc đang giữ), số tiền vượt cọc phải thu thêm (nếu hư hỏng $>$ cọc), hoặc số tiền cọc hoàn trả (nếu cọc $>$ hư hỏng); hiển thị màn hình xem trước tổng hợp.

  * Bước 7–8: Chủ trọ gửi đề xuất quyết toán cọc -> người thuê xem xét và xác nhận hoặc gửi phản hồi không đồng ý.

  * Bước 9–10: Nếu có khoản vượt cọc dương, thực hiện **AF2** để thu và xác nhận thanh toán phần vượt cọc trước khi đi tiếp; kiểm tra lại toàn bộ số liệu phân bổ và đảm bảo số dư mọi hóa đơn liên quan đều bằng $0$.

  * Bước 11–12: Nếu tiền hoàn trả $> 0$, chủ trọ ghi nhận số tiền thực hoàn, phương thức, ngày và mã tham chiếu; nếu tiền hoàn trả $= 0$, hệ thống ghi nhận **`"No refund due"`** và bỏ qua bút toán chi hoàn trả; kiểm tra khớp số tiền hoàn trả với số đã duyệt, lưu lịch sử quyết toán, chuyển trạng thái cọc sang **`"Settled"`** và mở khóa bước đóng hợp đồng ở `UC52`.

* **Alternative Flows (Mở rộng từ 2 luồng lên 5 luồng):**

  * **AF1 – An existing invoice is still outstanding *(Mới – 3 bước)*:** Tạm dừng quyết toán cọc và hiển thị các hóa đơn còn nợ để người thuê thanh toán và chủ trọ xác nhận qua `UC37` trước khi kiểm tra lại.

  * **AF2 – Move-out damage exceeds the deposit *(Viết lại từ AF1 cũ – 4 bước)*:** Tạo **một hóa đơn nháp phụ (`supplementary draft invoice`) chỉ cho phần chi phí hư hỏng vượt quá tiền cọc** -> chủ trọ kiểm tra và phát hành hóa đơn này qua `UC33` (phần đã trừ vào cọc chỉ hiển thị trong biên bản quyết toán, không tính trùng vào hóa đơn) -> người thuê thanh toán và chủ trọ xác nhận thu qua `UC37` -> quay lại bước 10 để hoàn tất quyết toán cọc.

  * **AF3 – Tenant disagrees or the damage proposal changes *(Cập nhật từ AF2 cũ – 2 bước)*:** Tiếp nhận phản hồi của người thuê, chỉnh sửa đề xuất hư hỏng và tạo lại bảng phân bổ mới để người thuê duyệt lại (nếu hóa đơn vượt cọc đã phát hành thì điều chỉnh qua `UC33` và giữ nguyên biên lai đã thu).

  * **AF4 – Damage was previously assigned to billing *(Mới – 3 bước)*:** Tự động loại trừ các mục hư hỏng đã nằm trong hóa đơn định kỳ/cuối hoặc đang chờ đưa vào hóa đơn kỳ tới từ `UC47` (đẩy qua hóa đơn quyết toán cuối ở `UC52` và xác nhận thu ở `UC37` trước) để tránh khấu trừ hai lần.

  * **AF5 – Zero refund, cancellation or failed finalization *(Mới – 2 bước)*:** Xử lý trường hợp không hoàn cọc (`No refund due`), hoàn tác trạng thái nếu hủy hoặc lưu lỗi giữa chừng, và yêu cầu đối soát lại nếu số tiền hoàn trả thực tế không khớp.

* **Pre-conditions & Post-conditions:** Bảo đảm mọi khoản hư hỏng chỉ được hạch toán duy nhất một lần (qua trừ cọc hoặc hóa đơn vượt cọc đã thanh toán) và toàn bộ công nợ hóa đơn bằng $0$ trước khi cọc chuyển sang `Settled`.

### Module M11: Income and Expense Management

#### UC42 – Record Income and Expenses *(Thay đổi toàn diện)*

* **Brief description:** Đảo trọng tâm sang cơ chế **tự động ghi nhận khoản thu từ các giao dịch thanh toán hóa đơn đã được chủ trọ xác nhận tại `UC37`**, phân tách rõ với các khoản thu/chi khác được nhập thủ công, và quy định **bút toán thu liên kết từ thanh toán phải được chỉnh sửa thông qua giao dịch thanh toán gốc** thay vì sửa trực tiếp trên sổ thu chi.

* **Basic Flow:** Viết lại thành 6 bước:

  * Bước 1–3: Chủ trọ xác nhận thực thu hóa đơn qua `UC37` -> hệ thống tự động tạo đúng một bút toán thu liên kết (số tiền xác nhận, ngày thu, khu trọ, danh mục, tham chiếu hóa đơn và giao dịch thanh toán nguồn; phần thu thừa xử lý theo `UC37` không ghi trùng) -> hiển thị đồng bộ trên hóa đơn, biên lai và sổ thu chi mà chủ trọ không cần nhập tay lại.

  * Bước 4–6: Chủ trọ mở `"Income & expenses"`, lọc theo khu trọ và thời gian -> danh sách phân biệt rõ bút toán nhập tay với bút toán tự động từ thanh toán -> xem chi tiết kèm liên kết tới giao dịch thanh toán gốc và lịch sử thay đổi.

* **Alternative Flows (Mở rộng từ 2 luồng lên 4 luồng):**

  * **AF1 – Add manual income or expense *(Chuyển từ Basic Flow cũ)*:** Nhập thủ công các khoản thu khác hoặc chi phí vận hành (sửa chữa, mua sắm, điện nước tổng, vận hành).

  * **AF2 – Edit or delete a manual entry *(Cập nhật từ AF1 cũ)*:** Chỉ áp dụng cho bút toán nhập thủ công; lưu lịch sử chỉnh sửa/xóa và cập nhật báo cáo.

  * **AF3 – Correct payment-linked income *(Mới – 4 bước)*:** Vô hiệu hóa nút sửa/xóa trực tiếp trên sổ thu chi đối với bút toán tự động từ thanh toán và điều hướng mở **giao dịch thanh toán gốc**; khi chủ trọ sửa số tiền thực thu kèm lý do trên giao dịch gốc, hệ thống đồng bộ cập nhật giao dịch thanh toán, số dư/trạng thái hóa đơn, biên lai và bút toán sổ thu chi mà không tạo thêm khoản thu thứ hai (lưu ý việc sửa bản ghi không tự động chuyển khoản hay hoàn tiền ngân hàng).

  * **AF4 – Invalid input, unconfirmed payment or failed save *(Mới – 3 bước)*:** Khẳng định **việc phát hành hóa đơn, hiển thị mã QR, nhận báo cáo `"Transferred"` từ người thuê, hoặc hóa đơn** $0\text{ đ}$ **đều không tạo ra bút toán thu**; hoàn tác toàn bộ nếu xác nhận hoặc chỉnh sửa thất bại.

* **Pre-conditions & Post-conditions:** Bảo đảm tính nhất quán dữ liệu giữa thanh toán, hóa đơn, biên lai và sổ thu chi; giữ nguyên nguyên tắc tiền cọc đang giữ không tính là doanh thu.

#### UC43 – View and Export Income-Expense Reports

* **Không thay đổi.**

### Module M12: Tenant Portal

#### UC44 – View Tenant Portal Dashboard

* **Không thay đổi.**

### Module M13: Maintenance and Incident Request Management

#### UC45 – Create Repair Request *(Thay đổi toàn diện)*

* **Brief description:** Thay đổi trình tự gọi AI: **người thuê điền báo cáo sự cố, xem lại và xác nhận gửi (`Submit`) trước; hệ thống tạo một phiếu yêu cầu (`New`), sau đó mới gọi AI (`UC46`) để đề xuất phân loại và mức độ ưu tiên gắn vào chính phiếu đã lưu đó**, đồng thời thông báo cho chủ trọ.

* **Basic Flow:** Viết lại thành 9 bước:

  * Người thuê chọn danh mục sự cố, nhập mô tả, mức độ khẩn cấp, tải ảnh bằng chứng -> hệ thống kiểm tra dữ liệu -> người thuê xem lại và bấm `"Submit"`.

  * Hệ thống tạo duy nhất một phiếu (`ticket`) ở trạng thái **`"New"`**, cấp mã phiếu và liên kết với phòng cùng thiết bị liên quan.

  * Hệ thống gọi `UC46` trên chính phiếu vừa lưu để lấy đề xuất phân loại (hoặc phân loại lại) và mức ưu tiên của AI, trong khi **vẫn giữ nguyên giá trị ban đầu người thuê đã chọn**.

  * Gửi thông báo cho chủ trọ kèm báo cáo của người thuê và đề xuất của AI (nếu có); hiển thị mã phiếu cho người thuê theo dõi.

* **Alternative Flows (Mở rộng từ 2 luồng lên 4 luồng):**

  * **AF1 – Invalid report or image input:** Báo lỗi thiếu thông tin hoặc ảnh không hợp lệ trước khi gửi.

  * **AF2 – Cancel before submitting *(Mới)*:** Hủy bỏ nội dung chưa gửi và kết thúc luồng.

  * **AF3 – AI unavailable or unable to classify *(Cập nhật từ AF2 cũ)*:** Nếu AI lỗi hoặc không trả về đề xuất hợp lệ, phiếu đã tạo vẫn giữ nguyên trạng thái `"New"` chờ chủ trọ phân loại thủ công; vẫn gửi thông báo cho chủ trọ bình thường (nếu chạy lại AI sau đó sẽ gắn vào đúng mã phiếu này).

  * **AF4 – Repeated submission or ticket save failure *(Mới – 2 bước)*:** Chống tạo trùng phiếu khi người dùng bấm gửi nhiều lần; báo lỗi lưu phiếu trước khi gửi thông báo.

* **Pre-conditions & Post-conditions:** Bảo đảm một lần xác nhận gửi tạo đúng một phiếu `New` và kết quả AI chỉ là đề xuất đính kèm trên phiếu đó để con người xét duyệt.

#### UC46 – AI Classification and Repair Ticket Assistance *(Thay đổi toàn diện)*

* **Brief description:** Chuyển sang mô hình **đánh giá AI trên một phiếu duy nhất sau khi đã gửi (`single-ticket AI review after submission`)**: mở rộng giai đoạn sau khi `UC45` đã lưu phiếu, đề xuất danh mục và mức ưu tiên để chủ trọ đối chiếu với khai báo gốc của người thuê và đưa ra quyết định cuối cùng tại `UC47`.

* **Basic Flow:** Viết lại thành 6 bước:

  * Nhận nội dung mô tả và ảnh bằng chứng từ phiếu `New` vừa tạo ở `UC45`.

  * AI phân tích và đề xuất danh mục sự cố cùng mức độ ưu tiên.

  * Gắn đề xuất AI vào phiếu hiện có, **giữ nguyên danh mục và mức độ khẩn cấp gốc của người thuê để so sánh**, rồi trả kết quả về `UC45` để thông báo cho chủ trọ.

  * Chủ trọ mở chính phiếu đó qua `UC47`, xem thông tin người thuê gửi kèm đề xuất AI, rồi xác nhận hoặc chỉnh sửa danh mục và mức ưu tiên cuối cùng.

* **Alternative Flows (Mở rộng từ 2 luồng lên 3 luồng):**

  * **AF1 – AI fails or returns no usable classification *(Cập nhật từ AF1 cũ)*:** Ghi nhận lần chạy AI thất bại mà không làm thay đổi trạng thái `New` hay phân loại đã được chủ trọ duyệt; `UC45` vẫn thông báo cho chủ trọ phân loại thủ công qua `UC47`.

  * **AF2 – Landlord changes the proposal *(Cập nhật từ AF2 cũ)*:** Ghi nhận quyết định chỉnh sửa danh mục/mức ưu tiên của chủ trọ.

  * **AF3 – Proposal arrives after a human decision *(Mới)*:** Nếu việc chạy lại AI hoàn tất sau khi chủ trọ đã tự phân loại xong phiếu, kết quả AI chỉ được lưu dưới dạng đề xuất tham khảo trong lịch sử và **không được ghi đè lên quyết định đã xác nhận của chủ trọ**.

* **Pre-conditions & Post-conditions:** Yêu cầu phiếu sửa chữa phải tồn tại trước trong phạm vi phòng hợp lệ; phân loại hiệu lực sau cùng luôn phản ánh quyết định của chủ trọ.

#### UC47 – Receive and Process Maintenance Requests *(Thay đổi ở luồng cơ bản & bổ sung luồng thay thế)*

* **Basic Flow:** Đánh số 1–7; bổ sung ở bước 2 việc chủ trọ xem đồng thời **danh mục/mức khẩn cấp do người thuê gửi kèm đề xuất của AI**, và **xác nhận hoặc sửa lại phân loại/mức ưu tiên trước khi tiến hành xử lý**.

* **Alternative Flows:**

  * **AF1, AF2, AF3:** Chuẩn hóa đánh số bước cho từ chối phiếu, ghi chi phí sửa chữa vào sổ thu chi (`UC42`), và xử lý khi người thuê mở lại phiếu (`UC48`).

  * **AF4 – Tenant damage billed with the next monthly invoice *(Mới – 4 bước)*:**

    * Trong thời gian người thuê đang tiếp tục ở, nếu phát hiện hư hỏng thuộc trách nhiệm bồi thường của người thuê tại bước 5, chủ trọ nhập số tiền đã duyệt, lý do, ghi chú đầy đủ và bằng chứng gắn với sự cố.

    * Hệ thống tạo hoặc cập nhật **một bản ghi phụ thu chưa phát hành qua `UC30` để tính vào hóa đơn hàng tháng kế tiếp** (tách biệt với việc ghi chi phí sửa chữa của chủ trọ vào sổ thu chi).

    * `UC32` tự động đưa khoản phí này vào hóa đơn kỳ tới đúng một lần và `UC33` hiển thị đầy đủ ghi chú/bằng chứng khi duyệt phát hành.

    * Nếu hợp đồng chuyển sang quyết toán trả phòng trước khi hóa đơn định kỳ kế tiếp được phát hành, `UC52` sẽ chuyển nguyên khoản phí đang chờ này sang hóa đơn quyết toán cuối cùng (còn hư hỏng mới phát hiện lúc trả phòng sẽ đi theo luồng cọc ở `UC51` và `UC41`).

* **Post-conditions:** Bổ sung việc lưu phân loại đã xác nhận của chủ trọ và liên kết một lần đối với khoản phí hư hỏng của người thuê sang hóa đơn định kỳ kế tiếp hoặc hóa đơn quyết toán cuối.

#### UC48 – Track, Confirm and Rate Issue Resolution

* **Không thay đổi.**

### Module M14: Asset and Equipment Management

#### UC49 – Manage Assets and Equipment

* **Không thay đổi.**

### Module M15: Handover and Move-out Management

#### UC50 – Create Move-in Handover Record

* **Không thay đổi.**

#### UC51 – Receive Move-out Request and Inspect Condition *(Thay đổi toàn diện)*

* **Brief description:** Đồng bộ với `UC22`: chủ trọ phê duyệt yêu cầu trả phòng thông qua `UC22`, **khiến phòng chuyển ngay sang trạng thái `Awaiting handover` ngay tại thời điểm phê duyệt và giữ nguyên trạng thái này xuyên suốt quá trình kiểm tra và quyết toán**, sau đó chủ trọ kiểm tra hiện trạng và hoàn thiện biên bản bàn giao để người thuê xác nhận.

* **Basic Flow:** Viết lại thành 7 bước:

  * Bước 1–2: Mở yêu cầu trả phòng của người thuê hoặc biên bản trả phòng đã tạo từ `UC22`; nếu yêu cầu chưa duyệt, chủ trọ xem ngày và phê duyệt chấm dứt hợp đồng qua `UC22` (chuyển ngay hợp đồng sang `Terminating` và phòng sang `Awaiting handover`); nếu đã duyệt thì tiếp tục trên cùng biên bản đó.

  * Bước 3–4: Lên lịch và kiểm tra thực tế, đối chiếu hiện trạng lúc nhận phòng và danh sách tài sản, chụp ảnh, ghi chỉ số điện nước cuối kỳ và **liệt kê các hư hỏng mới phát sinh lúc trả phòng kèm số tiền, lý do, bằng chứng, đánh dấu để đưa vào luồng khấu trừ cọc và thu vượt cọc tại `UC41`**.

  * Bước 5: Hệ thống cập nhật biên bản trả phòng và **nhận diện các khoản phí hư hỏng đã xuất hóa đơn trước đó hoặc đang chờ tính vào hóa đơn kỳ tới để đảm bảo mỗi khoản chỉ xử lý một lần**.

  * Bước 6–7: Người thuê xem xét và xác nhận biên bản kiểm tra/bàn giao (hoặc gửi phản hồi chỉnh sửa); lưu biên bản đã xác nhận của hai bên và giữ phòng ở trạng thái `Awaiting handover` để chuyển sang quyết toán ở `UC52`.

* **Alternative Flows (Mở rộng từ 2 luồng lên 4 luồng):**

  * **AF1 – Tenant disputes the inspection record:** Chủ trọ chỉnh sửa bằng chứng/nội dung và gửi lại trên cùng biên bản; hợp đồng giữ `Terminating` và phòng giữ `Awaiting handover`.

  * **AF2 – Reject an unapproved move-out request *(Cập nhật từ AF2 cũ)*:** Từ chối yêu cầu chưa duyệt kèm lý do; bảo toàn nguyên trạng hợp đồng và phòng do chưa có phê duyệt chấm dứt.

  * **AF3 – Change the date after approval *(Mới – 2 bước)*:** Cho phép điều chỉnh ngày trả phòng thỏa thuận sau khi đã duyệt kèm lý do và lịch sử, thông báo người thuê và giữ nguyên trạng thái `Terminating` / `Awaiting handover`.

  * **AF4 – Repeated request or failed record save *(Mới – 2 bước)*:** Chống tạo trùng biên bản trả phòng khi thao tác lặp lại; báo lỗi thực tế và giữ nguyên dữ liệu đã lưu gần nhất nếu cập nhật thất bại.

* **Pre-conditions & Post-conditions:** Làm rõ mối liên kết chặt chẽ giữa phê duyệt chấm dứt hợp đồng (`UC22`), xác nhận biên bản bàn giao (`UC51`), quyết toán hóa đơn/cọc (`UC52`, `UC41`) và vòng đời trạng thái phòng.

#### UC52 – Finalize Settlement and Close Tenancy *(Thay đổi toàn diện)*

* **Brief description:** Quy định trình tự quyết toán chặt chẽ: lập hóa đơn quyết toán cuối (với tiền thuê kỳ lẻ tự thỏa thuận do chủ trọ nhập tay), **xác minh toàn bộ các hóa đơn liên quan đều đã được tất toán (**$0\text{ đ}$**)**, hoàn tất quyết toán cọc (`UC41`) và đóng hồ sơ thuê.

* **Basic Flow:** Viết lại thành 9 bước chi tiết:

  * Bước 1–2: Mở biên bản kiểm tra/bàn giao đã được hai bên xác nhận; chốt chỉ số điện nước cuối kỳ (bao gồm các phân đoạn thay công tơ) qua `UC27` đối với dịch vụ tính theo công tơ (phương thức theo người/cố định không cần chốt công tơ).

  * Bước 3: Lập hóa đơn nháp quyết toán cuối gồm tiền phòng, điện nước, dịch vụ và các khoản phí cuối chưa xuất hóa đơn; **tự động chuyển khoản phí hư hỏng đang chờ từ hóa đơn định kỳ kế tiếp sang hóa đơn quyết toán cuối này dưới cùng mã tham chiếu gốc**.

  * Bước 4–5: Hiển thị tách bạch số dư các hóa đơn kỳ trước để đối chiếu; chủ trọ **nhập tay số tiền thuê kỳ lẻ đã tự thỏa thuận thông qua `UC33`** và phát hành hóa đơn cuối; người thuê thanh toán và chủ trọ xác nhận thực thu qua `UC37` (hóa đơn $0\text{ đ}$ tự động là `Settled - no amount due` và bỏ qua thu tiền).

  * Bước 6: **Kiểm tra tất cả hóa đơn kỳ trước, hóa đơn điều chỉnh và hóa đơn quyết toán cuối đều có số dư bằng** $0$ **trước khi mở `UC41`** (và trong `UC41`, nếu có hóa đơn phụ vượt cọc cũng phải được thanh toán xong trước khi hoàn tất).

  * Bước 7–9: Sau khi quyết toán cọc thành công, chủ trọ chọn `"Close tenancy"` -> hệ thống kiểm tra lại toàn bộ điều kiện (quyết toán cọc hoàn tất, mọi số dư hóa đơn kể cả hóa đơn vượt cọc bằng $0$, mọi khoản phí hư hỏng đã được xử lý) -> đồng thời chuyển hợp đồng sang **`"Ended"`**, phòng sang **`"Vacant"`** và hồ sơ cư trú liên quan sang **`"Left"`**; lưu toàn bộ lịch sử và thông báo cho các bên.

* **Alternative Flows (Mở rộng từ 2 luồng lên 5 luồng):**

  * **AF1 – An invoice is still unpaid or receipt awaits confirmation *(Cập nhật từ AF1 cũ – 3 bước)*:** Chặn quyết toán cọc hoặc đóng hồ sơ thuê nếu còn hóa đơn nợ $> 0$ hoặc có báo cáo chuyển khoản chờ đối soát (hợp đồng giữ `Terminating` và phòng giữ `Awaiting handover` cho đến khi xác nhận thu xong qua `UC37`).

  * **AF2 – Damage identified during move-out *(Cập nhật từ AF2 cũ – 2 bước)*:** Phân luồng rõ ràng: hư hỏng mới phát hiện khi trả phòng (`UC51`) đi theo luồng khấu trừ cọc + hóa đơn vượt cọc (`UC41`); hư hỏng đã nằm trên hóa đơn định kỳ/cuối giữ nguyên luồng hóa đơn và không bị trừ cọc lần hai.

  * **AF3 – Zero final invoice *(Mới – 2 bước)*:** Xử lý hóa đơn quyết toán cuối bằng $0\text{ đ}$ (`Settled - no amount due`) mà không tạo biên lai hay bút toán thu tiền.

  * **AF4 – Agreed rent, evidence or settlement is incomplete *(Mới – 2 bước)*:** Giữ nguyên trạng thái nháp/đang xử lý nếu thiếu tiền thuê tự thỏa thuận, thiếu xác nhận bàn giao hoặc chưa xong quyết toán cọc; khẳng định Trozy chỉ ghi nhận số tiền thuê nhập tay mà không tính toán hay gợi ý công thức chia theo ngày.

  * **AF5 – Closure check changes or saving fails *(Mới – 2 bước)*:** Yêu cầu kiểm tra lại nếu số dư/trạng thái thay đổi ngay trước lúc đóng hồ sơ; hoàn tác toàn bộ nếu lưu đóng hồ sơ thất bại.

* **Pre-conditions & Post-conditions:** Bảo đảm không thể đóng hợp đồng hay giải phóng phòng về `Vacant` khi còn bất kỳ khoản nợ hóa đơn, khoản vượt cọc hoặc tranh chấp bàn giao nào chưa giải quyết xong.

### Module M16 – Module M20 (UC53 đến UC64)

* **UC53 – Send Notifications:** Không thay đổi.

* **UC54 – Automatic Reminders:** Không thay đổi.

* **UC55 – View Notifications:** Không thay đổi.

* **UC56 – Submit Requests and Feedback:** Không thay đổi.

* **UC57 – Respond to and Resolve Requests:** Không thay đổi.

* **UC58 – Manage Documents, Records and House Rules:** Không thay đổi.

* **UC59 – Search and Download Documents:** Không thay đổi.

* **UC60 – Manage Vehicles:** Không thay đổi.

* **UC61 – Manage and Book Shared Amenities:** Không thay đổi.

* **UC62 – View Dashboard and Summary Reports:** Không thay đổi.

* **UC63 – View Personal Costs and Payment History:** Không thay đổi.

* **UC64 – View Forecast of Debts, Revenue and Vacancies:** Không thay đổi.

### Module M21: Configuration and Data Administration

#### UC65 – Configure System & UC66 – Import Data from Excel

* **Không thay đổi.**

#### UC67 – Export and Back Up Data *(Thay đổi toàn diện)*

* **Brief description:** Làm rõ hai nhóm chức năng: xuất/sao lưu dữ liệu trong phạm vi khu trọ thuộc quyền sở hữu của chủ trọ, và một luồng thay thế riêng biệt để xử lý **yêu cầu xóa dữ liệu đã tiếp nhận sau khi xác minh danh tính, thẩm quyền người yêu cầu, quyền hạn của chủ trọ, quy tắc lưu trữ dữ liệu và xác nhận tường minh đối với dữ liệu đủ điều kiện xóa**.

* **Basic Flow:** Viết lại từ 6 bước thành 9 bước chi tiết:

  * Kiểm tra vai trò và quyền sở hữu khu trọ trước khi hiển thị phạm vi dữ liệu được phép xuất/sao lưu.

  * Nếu xuất dữ liệu theo yêu cầu tiếp nhận từ bên ngoài, yêu cầu chủ trọ ghi nhận thông tin người yêu cầu và phạm vi yêu cầu để xác minh danh tính/thẩm quyền.

  * **Hiển thị màn hình xem trước (`preview`) dữ liệu đủ điều kiện và chỉ rõ các phần bị loại trừ** mà không làm lộ thông tin trái phép; chủ trọ xác nhận trước khi hệ thống sinh tệp.

  * Kiểm tra lại quyền truy cập trước khi cho phép tải tệp về; ghi nhận lịch sử thao tác, phạm vi, người thực hiện, thời gian, kết quả thực tế và thông báo cho người yêu cầu (nếu có).

* **Alternative Flows (Mở rộng từ 2 luồng lên 7 luồng):**

  * **AF1 – Handle a received data deletion request *(Tách khỏi Basic Flow thành luồng 7 bước riêng)*:** Chủ trọ chọn `"Delete data on request"`, nhập thông tin người yêu cầu, thẩm quyền viện dẫn và phạm vi dữ liệu -> hệ thống xác minh danh tính/thẩm quyền người yêu cầu, quyền sở hữu của chủ trọ và kiểm tra **quy tắc lưu trữ dữ liệu (`retention and data-protection rules`)** để phân tách dữ liệu được phép xóa với dữ liệu bắt buộc phải giữ lại -> hiển thị màn hình xem trước danh sách mục đủ điều kiện xóa, mục phải giữ lại và lý do -> **chủ trọ phải xác nhận tường minh việc xóa** (chỉ mở hoặc gửi yêu cầu không tự động cấp quyền xóa) -> hệ thống kiểm tra lại điều kiện và chỉ xóa các mục hợp lệ đã xác nhận, bảo toàn dữ liệu cần lưu trữ -> ghi nhật ký và thông báo kết quả cho chủ trọ cùng người yêu cầu (không tạo tệp xuất).

  * **AF2 – Identity, authority or access cannot be verified *(Mới – 3 bước)*:** Từ chối thao tác mà không làm lộ dữ liệu được bảo vệ, không xuất tệp, không xóa dữ liệu và ghi nhận lý do từ chối.

  * **AF3 – Invalid or incomplete selection *(Mới – 2 bước)*:** Báo lỗi khi thiếu thông tin yêu cầu, sai định dạng hoặc phạm vi không hợp lệ.

  * **AF4 – Deletion is restricted or eligibility is unresolved *(Mở rộng từ AF2 cũ – 3 bước)*:** Nếu một phần dữ liệu đủ điều kiện xóa, chỉ cho phép xác nhận xóa phần hợp lệ đó; nếu toàn bộ bị ràng buộc bởi quy tắc lưu trữ hoặc chưa đủ cơ sở xác định, giữ nguyên dữ liệu và ghi nhận yêu cầu chưa được thực hiện (nêu rõ **Use Case này không giả định một thời hạn lưu trữ cố định nào**).

  * **AF5 – Large export or backup *(Cập nhật từ AF1 cũ – 2 bước)*:** Xử lý chạy ngầm, thông báo khi hoàn tất và vẫn kiểm tra quyền trước khi tải tệp.

  * **AF6 – Landlord cancels before execution *(Mới – 2 bước)*:** Giữ nguyên dữ liệu, ghi nhận việc hủy và thông báo cho người yêu cầu rằng yêu cầu chưa được thực hiện.

  * **AF7 – Processing or download fails *(Mới – 3 bước)*:** Báo lỗi thực tế, không phát hành tệp chưa hoàn chỉnh, **hoàn tác (`rollback`) nếu xóa dữ liệu bị lỗi giữa chừng để không xảy ra xóa dở dang**.

* **Pre-conditions & Post-conditions:** Bổ sung đầy đủ các ràng buộc kiểm tra quyền sở hữu, xác minh người yêu cầu, bảo toàn dữ liệu khi lỗi/hủy và nêu rõ **Use Case này không bao gồm chức năng khôi phục bản sao lưu (`restore`) hay tạo cổng tự phục vụ gửi yêu cầu cho người thuê**.

#### UC68 – View Business Change Log *(Thay đổi toàn diện)*

* **Brief description:** Mở rộng từ việc chỉ xem nhật ký thay đổi dữ liệu nghiệp vụ (và loại trừ nhật ký truy cập ở bản 1.0) sang **bổ sung thêm màn hình xem Nhật ký truy cập chỉ đọc (`separate read-only access-log view`)**, cả hai đều giới hạn nghiêm ngặt trong phạm vi khu trọ và bản ghi mà chủ trọ có quyền quản lý.

* **Basic Flow:** Viết lại từ 4 bước thành 6 bước:

  * Kiểm tra vai trò và quyền sở hữu khu trọ để giới hạn phạm vi dữ liệu hiển thị.

  * Lọc theo khu trọ, đối tượng nghiệp vụ (hợp đồng, đơn giá, hóa đơn, thanh toán, tiền cọc), người thao tác và khoảng thời gian; hiển thị giá trị cũ và giá trị mới (**các trường nhạy cảm vẫn được che giấu/mã hóa theo quy định**).

  * Khi mở chi tiết một bản ghi thay đổi, kiểm tra lại quyền truy cập bản ghi đó và hiển thị ở chế độ **chỉ đọc (`read-only`)**.

* **Alternative Flows (Mở rộng từ 1 luồng lên 5 luồng):**

  * **AF1 – View access log *(Mới – 5 bước)*:** Chủ trọ chọn màn hình riêng `"Access log"` -> hệ thống kiểm tra quyền và giới hạn sự kiện truy cập trong phạm vi khu trọ của chủ trọ -> cho phép lọc theo khu trọ, người dùng, khoảng thời gian, tài nguyên, hành động và kết quả -> hiển thị danh sách sự kiện truy cập và chi tiết ở chế độ chỉ đọc mà không làm lộ sự kiện từ khu trọ của chủ trọ khác.

  * **AF2 – No matching records *(Cập nhật từ AF1 cũ)*:** Áp dụng cho cả nhật ký thay đổi nghiệp vụ và nhật ký truy cập.

  * **AF3 – Invalid filters *(Mới – 2 bước)*:** Chặn và báo lỗi các bộ lọc không hợp lệ (ví dụ: thời gian kết thúc trước thời gian bắt đầu) thay vì chạy truy vấn không giới hạn.

  * **AF4 – Access denied or authorization changes *(Mới – 2 bước)*:** Từ chối truy cập và không hiển thị nội dung bản ghi nếu người dùng thiếu quyền hoặc bản ghi nằm ngoài phạm vi khu trọ quản lý.

  * **AF5 – Log retrieval fails *(Mới – 2 bước)*:** Báo lỗi truy xuất nhật ký một cách tường minh thay vì hiển thị nhầm thành lịch sử trống.

* **Pre-conditions & Post-conditions:** Nhấn mạnh kiểm tra quyền ở cả cấp độ truy vấn danh sách lẫn truy cập trực tiếp từng bản ghi qua đường dẫn (`direct record link`), đảm bảo tính bất biến và chỉ đọc của cả hai loại nhật ký.

### Module M22 & Module M23 (UC69 đến UC73)

* **UC69 – View Utility Consumption Statistics:** Không thay đổi.

* **UC70 – Detect and Alert Utility Anomalies:** Không thay đổi.

* **UC71 – Ask the AI Assistant:** Không thay đổi.

* **UC72 – Query Operational Data in Natural Language:** Không thay đổi.

* **UC73 – Compose Notifications with AI:** Không thay đổi.

## 4. Bảng tổng hợp tra cứu nhanh toàn bộ 73 Use Cases

| Mã UC | Tên Use Case | Module | Trạng thái so với bản 1.0 | Tóm tắt thay đổi chính | 
| ----- | ----- | ----- | ----- | ----- | 
| **UC01** | Register Account | M01 | Giữ nguyên | — | 
| **UC02** | Verify Email | M01 | **Thay đổi (v2.0)** | Tách xác minh đăng ký mới và xác minh đổi email chờ xử lý (`pending`); ràng buộc mã dùng 1 lần theo mục đích và email đích. | 
| **UC03** | Log In | M01 | Giữ nguyên | — | 
| **UC04** | Log Out | M01 | Giữ nguyên | — | 
| **UC05** | Change and Reset Password | M01 | **Thay đổi (v2.0)** | Chuyển khôi phục mật khẩu sang dùng mã **OTP qua email**; quản lý thời hạn quyền đặt lại và hủy phiên đăng nhập cũ. | 
| **UC06** | Manage Personal Information | M01 | **Thay đổi (v2.0)** | Hỗ trợ lưu trạng thái email thay thế đang chờ xác minh (`pending`) và hủy/thay thế yêu cầu đổi email qua `UC02`. | 
| **UC07** | Configure Notification Preferences | M01 | Giữ nguyên | — | 
| **UC08** | Manage Properties and Buildings | M02 | Giữ nguyên | — | 
| **UC09** | Configure House Rules, Billing Day and Shared Services | M02 | Giữ nguyên | — | 
| **UC10** | View Room Overview by Property | M02 | Giữ nguyên | — | 
| **UC11** | View Property Information and House Rules | M02 | Giữ nguyên | — | 
| **UC12** | Manage Rooms | M03 | **Thay đổi (v2.0)** | Bảo toàn trạng thái vòng đời hiện tại của phòng khi chỉnh sửa thông tin; bổ sung kiểm tra quyền và xử lý lỗi khi vô hiệu hóa phòng. | 
| **UC13** | Update Room Status | M03 | Giữ nguyên | — | 
| **UC14** | Search Rooms and View Rental History | M03 | Giữ nguyên | — | 
| **UC15** | Manage Tenant Profiles | M04 | **Thay đổi (v2.0)** | Bỏ điều kiện tiên quyết về `consent`; quản lý người đại diện & thành viên cùng phòng; nhập tay số CCCD (mã hóa/che giấu) và lưu ảnh CCCD ngoài hệ thống. | 
| **UC16** | Extract Document Information with OCR | M04 | **Thay đổi (v2.0)** | Giới hạn **chỉ OCR hợp đồng giấy**; cấm tải lên/chụp/xử lý ảnh CCCD; từ chối đầu vào ảnh CCCD và không tra cứu danh tính từ số CCCD. | 
| **UC17** | Manage Occupancy | M04 | **Thay đổi (v2.0)** | Chi tiết hóa chuyển phòng có truy vết (`traceable transfer`), chuyển ngữ cảnh tài khoản/tài liệu, hỗ trợ lịch chuyển phòng tương lai và hoàn tác khi lỗi. | 
| **UC18** | Invite and Link Tenant Account | M04 | Giữ nguyên | — | 
| **UC19** | View Residency Profile and Request Information Update | M04 | Giữ nguyên | — | 
| **UC20** | Create Rental Contract | M05 | **Thay đổi (v2.0)** | Bổ sung luồng mở và tiếp tục chỉnh sửa hợp đồng nháp (`Draft`); phân biệt điều khoản cọc trên hợp đồng với thu cọc thực tế (`UC40`). | 
| **UC21** | Extend Contract and Create Addendum | M05 | **Thay đổi (v2.0)** | Quy định tiền thuê kỳ lẻ khi đổi giá giữa kỳ do hai bên tự thỏa thuận và chủ trọ nhập tay qua `UC33` (không tự chia theo ngày). | 
| **UC22** | Terminate Contract | M05 | **Thay đổi (v2.0)** | Chuyển hợp đồng sang `Terminating` và phòng sang `Awaiting handover` ngay tại thời điểm chủ trọ phê duyệt chấm dứt hợp đồng. | 
| **UC23** | Track Expiring Contracts | M05 | Giữ nguyên | — | 
| **UC24** | View, Download and Confirm Contract | M05 | Giữ nguyên | — | 
| **UC25** | Submit Contract Extension or Termination Request | M05 | Giữ nguyên | — | 
| **UC26** | Configure Meters and Utility Rates | M06 | **Thay đổi (v2.0)** | Quy định đóng phân đoạn công tơ cũ và mở phân đoạn công tơ mới đồng thời khi thay công tơ để tính sản lượng theo phân đoạn. | 
| **UC27** | Record and Finalize Meter Readings | M06 | **Thay đổi (v2.0)** | Tính và chốt chỉ số điện nước theo từng **phân đoạn công tơ (`meter segment`)** khi có thay công tơ trong kỳ. | 
| **UC28** | Recognize Meter Readings with OCR | M06 | Giữ nguyên | — | 
| **UC29** | View Utility Readings and Charges | M06 | **Thay đổi (v2.0)** | Hiển thị chi tiết theo từng phương thức tính (công tơ theo phân đoạn, đầu người, cố định); phí theo người/cố định không bị ẩn khi chưa chốt công tơ. | 
| **UC30** | Manage Services and Surcharges | M07 | **Thay đổi (v2.0)** | Quy định gắn khoản phí hư hỏng của người thuê từ `UC47` vào hóa đơn hàng tháng kế tiếp với mã tham chiếu duy nhất. | 
| **UC31** | View Services and Applicable Charges | M07 | Giữ nguyên | — | 
| **UC32** | Generate Periodic Invoices | M08 | **Thay đổi (v2.0)** | Chống tính trùng phí hư hỏng, ràng buộc tổng tiền hóa đơn $\ge 0$, nhập tay tiền thuê kỳ lẻ tự thỏa thuận và chuyển phí hư hỏng chờ thu sang hóa đơn cuối nếu trả phòng sớm. | 
| **UC33** | Adjust and Issue Invoices | M08 | **Thay đổi (v2.0)** | Ràng buộc giảm trừ không làm tổng hóa đơn bị âm; xử lý hóa đơn $0\text{ đ}$ (`Settled - no amount due`) không tạo biên lai/thu/QR; giải phóng liên kết phí khi xóa bản nháp. | 
| **UC34** | View and Download Invoices | M08 | Giữ nguyên | *(Chỉ thêm số thứ tự `1.` ở AF1)* | 
| **UC35** | Submit Invoice Review Request | M08 | Giữ nguyên | — | 
| **UC36** | Configure Receiving Account and Generate VietQR Code | M09 | **Thay đổi (v2.0)** | Sinh mã VietQR theo đúng toàn bộ số dư còn nợ hiện tại; bỏ qua tạo QR nếu số dư bằng $0$; làm mới QR khi hóa đơn/số dư thay đổi. | 
| **UC37** | Confirm Payment | M09 | **Thay đổi (v2.0)** | Chuẩn hóa đối soát thực thu, tách luồng thu thiếu/thu thừa có xác minh, xử lý báo cáo chưa khớp và chống xác nhận trùng lặp. | 
| **UC38** | Track Debts and Send Payment Reminders | M09 | **Thay đổi (v2.0)** | Loại trừ các hóa đơn đã tất toán bằng $0\text{ đ}$ (`Settled - no amount due`) khỏi danh sách công nợ và nhắc nợ. | 
| **UC39** | Pay via QR and View Payment History | M09 | **Thay đổi (v2.0)** | Quét QR theo đúng số dư hiện tại; bổ sung xử lý khi hóa đơn thay đổi số tiền, đang chờ duyệt thực thu hoặc hóa đơn $0\text{ đ}$ không cần thanh toán. | 
| **UC40** | Record and Track Security Deposit | M10 | Giữ nguyên | — | 
| **UC41** | Settle and Refund Security Deposit | M10 | **Thay đổi (v2.0)** | Bắt buộc tất toán mọi hóa đơn trước khi quyết toán cọc; trừ cọc cho hư hỏng mới khi trả phòng và lập hóa đơn phụ thu riêng phần vượt cọc trước khi hoàn tất. | 
| **UC42** | Record Income and Expenses | M11 | **Thay đổi (v2.0)** | Tự động ghi nhận khoản thu từ `UC37`; bắt buộc sửa khoản thu liên kết qua giao dịch thanh toán gốc thay vì sửa trực tiếp trên sổ thu chi. | 
| **UC43** | View and Export Income-Expense Reports | M11 | Giữ nguyên | — | 
| **UC44** | View Tenant Portal Dashboard | M12 | Giữ nguyên | — | 
| **UC45** | Create Repair Request | M13 | **Thay đổi (v2.0)** | Người thuê xác nhận gửi tạo phiếu `New` trước, sau đó hệ thống mới gọi AI (`UC46`) gắn đề xuất lên phiếu đó. | 
| **UC46** | AI Classification and Repair Ticket Assistance | M13 | **Thay đổi (v2.0)** | AI đề xuất phân loại/ưu tiên trên phiếu đã lưu; giữ nguyên khai báo gốc của người thuê để chủ trọ đối chiếu và quyết định cuối cùng. | 
| **UC47** | Receive and Process Maintenance Requests | M13 | **Thay đổi (v2.0)** | Chủ trọ xác nhận phân loại AI trước khi xử lý; bổ sung luồng ghi nhận khoản bồi thường hư hỏng của người thuê để đưa vào hóa đơn kỳ tới qua `UC30`. | 
| **UC48** | Track, Confirm and Rate Issue Resolution | M13 | Giữ nguyên | — | 
| **UC49** | Manage Assets and Equipment | M14 | Giữ nguyên | — | 
| **UC50** | Create Move-in Handover Record | M15 | Giữ nguyên | — | 
| **UC51** | Receive Move-out Request and Inspect Condition | M15 | **Thay đổi (v2.0)** | Đặt phòng sang `Awaiting handover` ngay khi duyệt trả phòng qua `UC22`; tách bạch hư hỏng mới lúc trả phòng (`UC41`) với phí đã tính trước đó. | 
| **UC52** | Finalize Settlement and Close Tenancy | M15 | **Thay đổi (v2.0)** | Nhập tay tiền thuê kỳ lẻ, chuyển phí hư hỏng chờ thu sang hóa đơn cuối, kiểm tra toàn bộ hóa đơn về $0$ trước khi tất toán cọc (`UC41`) và đóng hợp đồng. | 
| **UC53** | Send Notifications | M16 | Giữ nguyên | — | 
| **UC54** | Automatic Reminders | M16 | Giữ nguyên | — | 
| **UC55** | View Notifications | M16 | Giữ nguyên | — | 
| **UC56** | Submit Requests and Feedback | M17 | Giữ nguyên | — | 
| **UC57** | Respond to and Resolve Requests | M17 | Giữ nguyên | — | 
| **UC58** | Manage Documents, Records and House Rules | M18 | Giữ nguyên | — | 
| **UC59** | Search and Download Documents | M18 | Giữ nguyên | — | 
| **UC60** | Manage Vehicles | M19 | Giữ nguyên | — | 
| **UC61** | Manage and Book Shared Amenities | M19 | Giữ nguyên | — | 
| **UC62** | View Dashboard and Summary Reports | M20 | Giữ nguyên | — | 
| **UC63** | View Personal Costs and Payment History | M20 | Giữ nguyên | — | 
| **UC64** | View Forecast of Debts, Revenue and Vacancies | M20 | Giữ nguyên | — | 
| **UC65** | Configure System | M21 | Giữ nguyên | — | 
| **UC66** | Import Data from Excel | M21 | Giữ nguyên | — | 
| **UC67** | Export and Back Up Data | M21 | **Thay đổi (v2.0)** | Hoàn thiện quy trình xác minh danh tính/thẩm quyền, kiểm tra quy tắc lưu trữ và xác nhận tường minh trước khi xóa dữ liệu theo yêu cầu. | 
| **UC68** | View Business Change Log | M21 | **Thay đổi (v2.0)** | Bổ sung màn hình **Nhật ký truy cập chỉ đọc (`Access log`)** tách biệt với nhật ký thay đổi nghiệp vụ, giới hạn theo quyền sở hữu khu trọ. | 
| **UC69** | View Utility Consumption Statistics | M22 | Giữ nguyên | — | 
| **UC70** | Detect and Alert Utility Anomalies | M22 | Giữ nguyên | — | 
| **UC71** | Ask the AI Assistant | M23 | Giữ nguyên | — | 
| **UC72** | Query Operational Data in Natural Language | M23 | Giữ nguyên | — | 
| **UC73** | Compose Notifications with AI | M23 | Giữ nguyên | — | 