# Chạy Trozy trên Cloudflare Free

Trozy phục vụ giao diện React và API trên cùng một địa chỉ HTTPS. Worker kiểm tra phiên đăng nhập và quyền từng phòng. D1 giữ tài khoản, dữ liệu nghiệp vụ, lịch sử xác minh và thông tin tệp. Workers KV giữ nội dung tệp riêng tư.

Bản demo PA4 chạy trên tài khoản Cloudflare riêng của nhóm từ ngày 26/11/2026. Thư mục dự án trên máy đã gắn với profile Wrangler `trozy-team`. Cấu hình `wrangler.jsonc` chỉ định tài khoản, D1 và KV của nhóm. Để phát hành phiên bản tiếp theo, chạy `npm run cf:check` rồi `npm run cf -- deploy`. Các tài khoản Trozy hiện có dùng tiếp mật khẩu cũ. [Mở Trozy PA4](https://trozy.nhom11.workers.dev)

## Chạy thử trên máy

Dùng Node.js 24 trở lên. Trên checkout mới, chạy `npm ci` ở thư mục gốc. Các lệnh sau dùng dữ liệu mô phỏng trong `data/cloudflare-local/`.

```powershell
npm run cf:init
npm run cf:seed -- --local
npm run build
npm run cf:dev
```

Chạy lệnh seed **một lần trên database trống**. Nó tạo hai chủ trọ và một người thuê với mật khẩu ngẫu nhiên và in đường dẫn tệp tài khoản trong `.secrets/`. Trên máy đã khởi tạo, dùng lại tệp này và chỉ chạy hai lệnh cuối khi cần khởi động. Mở địa chỉ Wrangler in ra, mặc định là `http://localhost:8787`. Khóa mã hóa cục bộ nằm trong `.dev.vars`. Git bỏ qua khóa, tệp tài khoản và dữ liệu mô phỏng.

```powershell
npm test
npm run cf:check
```

Lệnh thứ hai chạy TypeScript, build giao diện và đóng gói Worker bằng Wrangler dry-run. Có thể chạy các bước trên mà chưa đăng nhập Cloudflare.

## Khởi tạo thêm một bản demo trên tài khoản khác

Các bước dưới đây dành cho một bản cài mới. Tạo một bản sao cấu hình và điền `account_id` của tài khoản đích trước khi tạo D1 và KV.

1. Dùng tài khoản Cloudflare của nhóm với gói Workers Free. Trong thư mục dự án, đăng nhập và tạo một D1 database cùng một KV namespace.

   ```powershell
   npm run cf -- login
   npm run cf -- d1 create trozy
   npm run cf -- kv namespace create FILES
   ```

2. Điền UUID do Wrangler trả về vào `database_id` của binding `DB` và `id` của binding `FILES` trong `wrangler.jsonc`. Giữ `migrations_dir`. Nếu tài khoản đã có tài nguyên dành cho Trozy, dùng ID của chúng. Tên Worker mặc định là `trozy`.

3. Tạo một khóa ngẫu nhiên 32 byte dạng **64 ký tự hex**, lưu trong trình quản lý mật khẩu của nhóm. Thiết lập secret rồi áp dụng migration trên D1 của nhóm. Wrangler có thể hỏi tạo Worker lần đầu khi đặt secret. Giữ cùng khóa qua các lần phát hành để đọc được trường định danh đã mã hóa.

   ```powershell
   npm run cf -- secret put TROZY_DATA_KEY
   npm run cf -- d1 migrations apply DB --remote
   ```

4. Với bản demo PA4 trên D1 mới, tạo tài khoản và dữ liệu giả bằng lệnh dưới đây. Lưu tệp mật khẩu được in ra ở nơi riêng tư. Bộ seed chỉ đọc dữ liệu mẫu được tạo trong bộ nhớ. Các tài khoản và tệp từ `data/trozy.sqlite` không được sao chép.

   ```powershell
   npm run cf:seed -- --remote
   ```

5. Build và phát hành. Lấy URL HTTPS thực tế từ đầu ra của Wrangler. Khi tài khoản chưa có subdomain workers.dev, tạo subdomain trong màn hình Workers của Cloudflare theo hướng dẫn của Wrangler.

   ```powershell
   npm run cf:check
   npm run cf -- deploy
   ```

6. Mở `/api/health` trên URL vừa phát hành. Dùng hai cửa sổ trình duyệt để đăng nhập người thuê và chủ trọ. Gửi ảnh điện hoặc nước cho kỳ đang mở, mở ảnh ở phía chủ trọ rồi xác minh. Đăng nhập chủ trọ thứ hai để kiểm tra quyền. Tải một hóa đơn PDF và kiểm tra dữ liệu còn sau khi tải lại trang. Có thể theo dõi CPU và lỗi trong Workers > Metrics khi thực hiện các thao tác này.

## Thời hạn ảnh và dung lượng

- Ảnh công tơ đi qua Worker, tối đa **5 MiB mỗi ảnh**. Mỗi ảnh có khóa KV riêng với thời điểm hết hạn. Trozy dùng cùng giờ Việt Nam ở tháng kế tiếp, lấy ngày cuối tháng nếu cần. Ví dụ, ảnh tải ngày 31/01 hết hạn ngày 28/02 trong năm thường.
- Sau thời điểm đó, người có quyền mở ảnh nhận HTTP 410. Chủ trọ có thể yêu cầu chụp lại. Biên nhận, kết quả đã duyệt, hóa đơn và lịch sử vẫn còn ở D1.
- Ảnh phòng, ảnh đại diện và tài liệu dùng chung kho KV với ảnh công tơ. Chúng có mục đích riêng và không áp dụng hạn một tháng. Dự toán **khoảng 1.000 ảnh** tương ứng trung bình 1 MB/ảnh khi toàn bộ 1 GB còn trống. Nếu mỗi tệp gần 5 MiB, sức chứa khoảng 190 tệp. Khi hết phần dung lượng đã dành, API báo kho đầy. Cloudflare còn giới hạn số lần ghi KV mỗi ngày. [Giới hạn KV](https://developers.cloudflare.com/kv/platform/limits/)
- D1 Free cho phép tối đa 500 MB mỗi database. Workers Free có ngân sách CPU 10 ms mỗi yêu cầu. Ảnh công tơ gửi trực tiếp dạng nhị phân từ màn hình chụp. Các nút PDF trên giao diện cloud tạo bản PDF ngay trong trình duyệt từ dữ liệu đã kiểm tra quyền. [Giới hạn D1](https://developers.cloudflare.com/d1/platform/limits/) · [Giới hạn Workers](https://developers.cloudflare.com/workers/platform/limits/)

## Email và OCR

Chủ trọ chọn **Tạo tài khoản chủ trọ** trên trang đăng nhập hoặc mở [trang đăng ký](https://trozy.nhom11.workers.dev/?action=register-landlord). Trozy giữ yêu cầu email trong 7 ngày. Khi có kênh gửi thư, liên kết có hiệu lực 24 giờ và dùng một lần. Người giữ hộp thư tự điền tên, điện thoại và đặt mật khẩu để đăng nhập vào khu quản lý riêng. Email cũ đã có tài khoản vẫn đăng nhập như trước.

Khi dịch vụ thư tạm ngừng, yêu cầu mới nằm trong bảng D1 `landlord_signups`. Lịch hàng giờ thử gửi tối đa 5 yêu cầu đang chờ mỗi lượt, dùng `TROZY_PUBLIC_URL` làm địa chỉ của liên kết. Có thể yêu cầu lại trên trang đăng ký sau 10 phút. Chạy migration `0003_landlord_signups.sql` trước khi phát hành phiên bản này. Chọn một trong hai kênh gửi thư sau.

- Với Brevo, dùng địa chỉ gửi đã xác minh của nhóm, đặt `BREVO_API_KEY` và `MAIL_FROM` bằng `npm run cf -- secret put <tên>`, rồi thử đăng ký với một hộp thư nhóm kiểm soát. OTP đặt lại mật khẩu có hiệu lực 10 phút. [API email giao dịch của Brevo](https://developers.brevo.com/reference/send-transac-email)
- Nếu nhóm có dịch vụ thư riêng chạy trên Workers, có thể thêm Service Binding tên `MAILER`. Worker gọi nội bộ `POST /auth` với `to`, `kind` và `url` hoặc `otp`. Với thông báo do chủ trọ gửi, `POST /notification` nhận `id`, `to`, `subject`, `text` và có thể có `attachment` dạng `{name, content}` với nội dung base64. Trả HTTP 2xx khi nhận thành công. Lịch hàng giờ gửi tối đa ba email thông báo đã xếp hàng mỗi lượt, tối đa ba lần thử cho mỗi email.

Bản cloud hỗ trợ chủ trọ đối chiếu ảnh gốc rồi nhập chỉ số. Các bộ đọc OCR/AI chạy bằng Python và model trên máy nằm trong bản Node/SQLite. Bản cloud cho nhập hợp đồng giấy bằng tay. Các quyết định ghi chỉ số và lập hóa đơn vẫn dùng quy tắc nghiệp vụ của Trozy.
