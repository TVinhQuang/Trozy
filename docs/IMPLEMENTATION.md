# Triển khai và chạy Trozy

> **Cập nhật 31/10/2026:** đã tích hợp bộ đọc công tơ cơ YOLO + VisionState theo luồng chủ nhà chọn/xác nhận vùng, nhận đề xuất và đối chiếu ảnh trước khi lưu. Người thuê chỉ gửi ảnh. [Hướng dẫn/API hiện hành](METER-READER.md). Nội dung mô tả PaddleOCR/Tesseract/Ollama Vision hoặc API B03 cũ bên dưới là lịch sử trước khi gỡ; không dùng để triển khai bộ đọc mới.

Trozy hiện có ứng dụng React/TypeScript, API Node.js và dữ liệu SQLite lưu trên máy. Chủ trọ và người thuê đăng nhập bằng tài khoản riêng; mọi truy cập dữ liệu được kiểm tra ở API. B01–B04 đã có provider và giao diện: trợ lý có nguồn dữ liệu, cảnh báo điện nước, OCR đọc công tơ với Vision kiểm tra khung, bổ sung một ô hoặc đọc dự phòng khi chưa có đề xuất, cùng phân loại sửa chữa. Các model dùng Ollama cục bộ khi sẵn sàng; tra cứu/quy tắc vẫn hoạt động khi chưa chạy model. B03 thiếu bằng chứng khung/chữ số thì cần chủ nhà xem ảnh hoặc nhập tay. B05 chưa triển khai.

Tài liệu này mô tả mã ứng dụng trong `src/`, tách biệt với hai prototype HTML ở `pa/`. Phạm vi từng module và giới hạn được ghi tại [FEATURE-COVERAGE.md](requirements/FEATURE-COVERAGE.md); điểm nối B01–B05 ở [AI-INTEGRATION.md](analysis%20and%20design/AI-INTEGRATION.md).

## Yêu cầu và lệnh chạy

Cần Node.js **24 trở lên**, npm đi kèm và trình duyệt hiện đại. Backend dùng `node:sqlite` tích hợp trong Node, không cần cài dịch vụ database hoặc SQLite CLI riêng. Chạy các lệnh tại thư mục gốc repo:

```powershell
npm install
npm run dev
```

- Giao diện phát triển: `http://127.0.0.1:5173`.
- API: `http://127.0.0.1:3001/api/health`.
- Vite chuyển các yêu cầu `/api` sang API cổng 3001. Dùng đúng địa chỉ `127.0.0.1` để các cookie và kiểm tra nguồn yêu cầu nhất quán.
- `Ctrl+C` dừng tiến trình phát triển.

Nếu cần chạy hai tiến trình riêng, mở hai terminal:

```powershell
npm run dev:api
```

```powershell
npm run dev:web
```

Bản build được phục vụ trực tiếp bởi Node:

```powershell
npm run build
npm start
```

Sau build, mở `http://127.0.0.1:3001`. `npm run build` chạy TypeScript trước khi Vite tạo `dist/`. Khi chưa có `dist/index.html`, backend chỉ thông báo API đang hoạt động, không tự tạo giao diện.

```powershell
npm test
npm run check:pages
```

`npm test` chạy các test Node trong `tests/*.test.mjs`. Kiểm thử API dùng database riêng; test tệp tĩnh dùng thư mục tạm, không phụ thuộc việc đã build và không dùng dữ liệu demo đang thao tác. `npm run check:pages` dựng HTML tĩnh từ từng trang bằng dữ liệu API đã lọc quyền, theo vai trò/cơ sở; lệnh này không điều khiển trình duyệt hoặc giả lập thao tác người dùng. Kết quả kiểm tra và giới hạn xác minh được ghi ở [IMPLEMENTATION-VERIFICATION.md](test/IMPLEMENTATION-VERIFICATION.md).

## Tài khoản và dữ liệu minh họa

Database mặc định là `data/trozy.sqlite`; thư mục được tạo khi API khởi động. Khi database chưa có người dùng và bật seed, hệ thống thêm dữ liệu giả để demo:

| Vai trò | Email | Mật khẩu |
| --- | --- | --- |
| Chủ trọ chính | `chu@trozy.vn` | `Trozy@2026` |
| Người thuê phòng 101 | `thue@trozy.vn` | `Trozy@2026` |
| Chủ trọ độc lập để kiểm tra cách ly dữ liệu | `khac@trozy.vn` | `Trozy@2026` |

Chủ trọ chính có hai cơ sở, các phòng với nhiều trạng thái, hợp đồng, chỉ số, hóa đơn và thanh toán mẫu. Dữ liệu lịch sử minh họa tập trung vào tháng 07–10/2026. Tên, địa chỉ, điện thoại và thông tin ngân hàng trong seed đều phục vụ kiểm thử; không dùng chúng để giao dịch.

Seed chỉ chạy nếu bảng người dùng trống; khởi động lại không xóa thay đổi của người dùng. Để có bộ dữ liệu thử độc lập, dừng API rồi đặt `TROZY_DB_PATH` tới một file SQLite mới. Không cần xóa database cũ.

## Cấu hình cục bộ

Backend đọc các biến môi trường sau:

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Địa chỉ lắng nghe của API và giao diện đã build. |
| `PORT` | `3001` | Cổng Node. Proxy Vite hiện trỏ tới 3001. |
| `TROZY_DB_PATH` | `data/trozy.sqlite` | File database; có thể dùng đường dẫn tuyệt đối. |
| `TROZY_SEED_DEMO` | Bật | Đặt `0` hoặc `false` để tắt seed demo ở database mới. |
| `TROZY_SECURE_COOKIES` | Tắt | Đặt `1` hoặc `true` khi phục vụ qua HTTPS để thêm thuộc tính `Secure` cho cookie. |
| `TROZY_ALLOWED_ORIGINS` | Rỗng | Danh sách origin bổ sung, phân cách bằng dấu phẩy, nếu chủ động triển khai giao diện khác nguồn. |
| `TROZY_DATA_KEY` | Tự tạo khóa cục bộ | Khóa AES-256-GCM gồm 64 ký tự hexadecimal. Khi không đặt biến này, khóa được tạo trong `.trozy-data-key` cạnh database. |
| `TROZY_PUBLIC_URL` | `http://127.0.0.1:5173` nếu không đặt | URL frontend trong email xác thực/đặt lại mật khẩu; đổi sang cổng 3001 khi dùng bản build. |
| `SMTP_HOST` | Rỗng | Có giá trị để bật gửi email xác thực/đặt lại mật khẩu qua SMTP; bỏ trống để dùng outbox cục bộ. |
| `SMTP_PORT` / `SMTP_SECURE` | `587` / tắt | Cổng SMTP; `SMTP_SECURE=true` hoặc cổng 465 dùng kết nối TLS trực tiếp. |
| `SMTP_REQUIRE_TLS` | Bật | SMTP cổng không dùng TLS trực tiếp yêu cầu STARTTLS; chỉ đặt `false` cho môi trường thử cục bộ có chủ đích. |
| `SMTP_USER` / `SMTP_PASS` | Rỗng | Tài khoản SMTP, phải đặt cùng nhau nếu máy chủ yêu cầu xác thực. |
| `SMTP_FROM` | Rỗng | Địa chỉ người gửi; bắt buộc khi bật SMTP. |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Ollama cục bộ, chỉ chấp nhận localhost/loopback, không có cloud fallback. |
| `TROZY_AI_MODEL` | `qwen3:4b-instruct` | Model Ollama đã tải trên máy; không dùng tag cloud. |
| `TROZY_AI_ENABLED` | Bật | Đặt `false` hoặc `0` để không gọi model của B01/B03/B04; truy vấn/quy tắc vẫn dùng được. OCR vẫn đọc cục bộ; B03 không tạo đề xuất nếu khung chưa được kiểm tra, nhập tay vẫn có. |
| `TROZY_AI_AUTO_START` | Bật | Mở runtime đã setup khi chạy dev nếu chưa có server; không tự tải runtime/model. |
| `TROZY_AI_TIMEOUT_MS` | `60000` | Thời gian chờ model; code giới hạn 100–120000 ms. |
| `TROZY_OCR_TIMEOUT_MS` | `45000` | Thời gian chờ OCR; code giới hạn 5000–90000 ms. |
| `TROZY_OCR_ENGINE` | `auto` | Ưu tiên PaddleOCR đã chuẩn bị, dùng Tesseract khi chưa sẵn sàng; `paddleocr` hoặc `tesseract` chọn riêng bộ OCR. Không tải model lúc nhận dạng. |
| `TROZY_PADDLE_ROOT` | `.runtime/paddleocr` | Python portable, thư viện, model và cache trong dự án; đường dẫn ngoài dự án bị từ chối. |
| `TROZY_PADDLE_THREADS` | `4` | Số luồng CPU, giới hạn 1–8. |
| `TROZY_VISION_MODEL` | `qwen3-vl:4b-instruct` | Model đọc ảnh riêng; phải được tải cục bộ và có capability `vision`. Model văn bản `TROZY_AI_MODEL` không thay thế model ảnh. |
| `TROZY_VISION_TIMEOUT_MS` | `90000` | Thời gian chờ tác vụ Vision; code giới hạn 100–180000 ms. Khi lỗi hoặc quá hạn, giữ bằng chứng đã có và báo cần kiểm tra. |
| `TROZY_METER_ELECTRIC_TOLERANCE` | `1` | Chỉ dùng cho luồng `vision-guided-ocr` lịch sử; luồng hiện tại không so sánh hai dãy số nên không dùng ngưỡng này. |
| `TROZY_METER_WATER_TOLERANCE` | `1` | Tương tự, không tham gia luồng `ocr-vision-assisted` hiện hành. |

Có thể đặt biến trong PowerShell trước khi chạy. Ví dụ tạo database trống riêng:

```powershell
$env:TROZY_DB_PATH = 'data/trozy-clean.sqlite'
$env:TROZY_SEED_DEMO = '0'
npm run dev
```

Backend và CLI outbox/backup tự nạp `.env` tại thư mục gốc nếu file tồn tại. Có thể sao chép `.env.example` rồi chỉnh các giá trị cần dùng; không cần thêm `--env-file` cho các lệnh npm chuẩn. Với SMTP, đặt `TROZY_PUBLIC_URL` đúng địa chỉ giao diện: 5173 khi phát triển, 3001 khi chạy bản build, hoặc URL HTTPS khi triển khai. File `.env` không được đưa lên Git. Đổi cổng API cần cập nhật proxy trong `vite.config.ts` hoặc dùng bản build do chính Node phục vụ.

## Đăng ký, xác thực email và quên mật khẩu

- Chủ trọ đăng ký trực tiếp. Người thuê cần mã lời mời do chủ trọ tạo ở **Người thuê → Mời liên kết**; mã có hạn 7 ngày và email đăng ký phải khớp hồ sơ được mời khi hồ sơ có email.
- Mật khẩu được băm bằng scrypt với salt; session lưu hash token, cookie `HttpOnly` và `SameSite=Lax`, thời hạn 7 ngày. Đổi mật khẩu thu hồi các session cũ.
- Mặc định đăng ký, gửi lại xác thực và quên mật khẩu ghi thư vào SQLite `mail_outbox`, không gửi ra ngoài khi chưa cấu hình SMTP. Khi bật SMTP, thư trong hàng đợi được gửi bất đồng bộ và lưu trạng thái `sending`/`sent`/`failed`; xác minh chứng chỉ TLS luôn bật. Không có API công khai để đọc hộp thư/token.
- Token xác thực email có hạn 24 giờ; token đặt lại mật khẩu có hạn 1 giờ và chỉ dùng một lần. Đặt lại mật khẩu thu hồi mọi session của tài khoản.
- Trạng thái email đã xác thực được lưu, nhưng hiện không chặn toàn bộ nghiệp vụ của tài khoản chưa xác thực. Muốn bắt buộc xác thực trước khi sử dụng cần thêm chính sách phía API.
- Hồ sơ hỗ trợ tên/điện thoại, ảnh đại diện do chính tài khoản tải lên và tùy chọn nhận các nhóm hóa đơn, hợp đồng, bảo trì, thông báo chung; API kiểm tra quyền tệp và kiểu giá trị tùy chọn.

Để kiểm thử email bằng dữ liệu giả, người phát triển có quyền truy cập máy có thể đọc outbox bằng CLI. Lệnh dưới đây chỉ chạy cục bộ và in token phát triển; không chia sẻ kết quả:

```powershell
node src/backend/outbox.mjs chu@trozy.vn
```

Mở bằng cửa sổ trình duyệt chưa đăng nhập:

```text
http://127.0.0.1:5173/?action=verify&token=TOKEN_PHAT_TRIEN
http://127.0.0.1:5173/?action=reset&token=TOKEN_PHAT_TRIEN
```

Khi dùng bản build thay cổng 5173 bằng 3001. Thông báo HTTP/ứng dụng rằng thư đã được tạo trong outbox chỉ xác nhận đã xếp hàng; không phải bằng chứng thư SMTP đã tới người nhận. Transport SMTP đã được kiểm thử bằng transport thay thế, nhưng cần cấu hình và kiểm tra tài khoản SMTP thực tế trước khi dùng với người dùng bên ngoài.

## Ollama, Vision và OCR cục bộ

Không cần API key AI trả phí. `npm install` cài Tesseract.js, file ngôn ngữ và thư viện xử lý ảnh; OCR không tải model từ CDN khi nhận dạng. B01/B04 dùng model văn bản Ollama khi server/model sẵn sàng. B03 dùng OCR tự tìm khung/đọc và Vision kiểm tra khung. OCR đọc đủ thì giữ đề xuất OCR, không gọi Vision đọc chữ số. Thiếu đúng một ô có vị trí rõ trong bằng chứng OCR thì Vision chỉ đọc ô đó để bổ sung; không so sánh hai dãy hoặc dung sai hàng đơn vị. Khung đúng giữ nguyên; khung sai chỉ có một lần OCR tìm lại. B02 dùng thống kê. Xem [thiết kế B03 hiện hành](<analysis and design/METER-OCR-VISION-ASSISTED.md>).

Trên Windows chuẩn bị runtime trong chính dự án:

```powershell
npm run ai:setup-vision
npm run ai:setup-ocr
```

Ollama mặc định ở `.runtime/ollama/`, gồm runtime chính thức được kiểm tra SHA-256 và model văn bản `qwen3:4b-instruct`/model ảnh `qwen3-vl:4b-instruct`; server chỉ dùng loopback. PaddleOCR/Python portable và model ONNX ở `.runtime/paddleocr/`. Script dùng lại model/thư viện đã chuẩn bị, không thêm system PATH hoặc tạo Windows service; `-InstallRoot` phải là thư mục con hợp lệ của dự án. Lệnh setup lần đầu có thể tải các thành phần còn thiếu, còn `npm run dev` và nhận dạng không tải model. Không dùng lệnh pull từ một Ollama ngoài dự án để thay cho quy tắc lưu trữ này.

Thư viện JavaScript ở `node_modules/`, npm cache ở `.cache/npm/`, dữ liệu nghiệp vụ ở `data/`; cache/log/dataset/runtime riêng của Trozy cũng nằm trong dự án và được Git bỏ qua khi thích hợp. Mỗi lượt Codex phải dùng thư mục tạm riêng trong dự án và dọn đúng tệp do lượt đó tạo sau khi xong, giữ nguyên ảnh gốc, model, dữ liệu và báo cáo. Xem [quy tắc dự án](../AGENTS.md).

**Vị trí dự án ngày 29/10/2026:** dùng `D:\Trozy`, gồm Git, thư viện JavaScript, dữ liệu ứng dụng và các runtime/model dưới `.runtime/`. Đã kiểm tra SHA-256 trước khi loại bản runtime cũ trùng lặp; không tải/cài lại model. Ollama, Vision và PaddleOCR chạy được ở vị trí mới. Các đường dẫn trong báo cáo cũ giữ nguyên theo lịch sử. Xem [báo cáo kiểm chứng](test/METER-GUIDED-VALIDATION.md).

Mở **Trợ lý Trozy → Kiểm tra** để xem riêng trạng thái trợ lý, OCR và Vision kiểm tra khung. `capabilities.B01`–`B04` là provider đã cài, không bảo đảm runtime/model hiện sẵn sàng. Phản hồi gắn nhãn bộ xử lý thực tế. Khung chưa được chấp nhận hoặc cả các bước đọc đều chưa đủ bằng chứng thì B03 không tạo đề xuất và hiển thị lý do; chủ nhà vẫn có thể xác minh thủ công.

- **Trợ lý Trozy:** hỏi công nợ, tiền thu, hợp đồng, phòng, sửa chữa hoặc nội quy; mở nguồn để đối chiếu. Bản nháp thông báo cần chủ trọ kiểm tra người nhận/nội dung và xác nhận gửi.
- **Tiêu thụ điện nước:** xem cảnh báo và lịch sử tham chiếu; thiếu ba kỳ trước được báo rõ. Ghi chú kiểm tra không thay chỉ số/hóa đơn. Ngưỡng chỉnh trong Cài đặt → Nhắc lịch.
- **Điện & nước:** OCR tự tìm khung/đọc; Vision kiểm tra khung, thử bổ sung một ô thiếu có vị trí rõ hoặc đọc dự phòng toàn hàng khi vẫn chưa có đề xuất. Chủ nhà thấy một đề xuất hoặc lý do ngắn; khung/lượt đọc/quan sát gốc nằm trong chi tiết. Chỉ số đề xuất vẫn cần ảnh, đơn vị, phần nguyên/phần lẻ hợp lệ và chủ nhà đối chiếu. Người thuê chỉ gửi ảnh; chỉ chủ nhà được xem xét/xác minh. Ảnh chỉ số không phải ảnh CCCD/tài liệu hợp đồng.
- **Bảo trì & sự cố:** nhập mô tả, lấy gợi ý loại/ưu tiên, xem lý do và nhấn áp dụng; các trường vẫn sửa được trước khi gửi phiếu.

Vision hiện hướng tới bộ số cơ và màn hình điện tử có đơn vị/cách chia thập phân rõ; mặt số chỉ có các kim cần kiểm tra thủ công. Phần số đỏ không được mặc định ghép vào chỉ số nguyên. Form nghiệp vụ hiện ghi chỉ số nguyên: dãy `00001.056 m³` vẫn hiển thị đầy đủ và chỉ cho dùng phần nguyên `1` sau khi người dùng kiểm tra quy ước. Model không nhận chỉ số kỳ trước để đoán số; việc so sánh lịch sử thực hiện sau nhận dạng.

Trạng thái khung được chấp nhận không chứng minh chữ số đúng. Điểm OCR trong phần chi tiết chỉ là điểm nhận dạng văn bản; văn bản rỗng có điểm 0. Không ghép fragment hoặc dùng lịch sử sửa số. Đề xuất OCR hợp lệ luôn được giữ nguyên. Bước bổ sung một ô cần vị trí được chứng minh trước khi hỏi Vision. Nếu vẫn chưa có đề xuất, Vision có thể chép lại toàn hàng qua hai yêu cầu không chia sẻ đáp án (toàn cảnh + crop, rồi chỉ crop), không nhận số OCR/profile/lịch sử. Mỗi lượt chỉ yêu cầu hai nhóm chữ số và cờ chưa rõ; nhóm phải trùng và không còn chữ số chưa rõ. Transport không suy đơn vị/loại/quy ước nên nhánh dự phòng cần cấu hình công tơ đã xác nhận, khớp số ô/ranh giới nhóm; thiếu cấu hình thì chưa đề xuất. Validator không cho cấu hình ghi đè bằng chứng đã quan sát trái ngược. Chất lượng ảnh gốc và mật độ trung bình ít nhất 12 px/chữ số, chiều cao hàng ít nhất 24 px được kiểm tra; đây không phải đo từng ô hoặc bảo đảm chính xác. Các bước Vision dùng chung ngân sách mặc định 90 giây. Điểm/lượt đọc chỉ phản ánh nhận dạng văn bản và sự ổn định. Không suy ô bị rơi hoặc đoán bánh số đang xoay. Xem [thiết kế B03 hiện hành](<analysis and design/METER-OCR-VISION-ASSISTED.md>). Chưa có tập ảnh đánh giá đủ lớn để công bố độ chính xác trên các loại đồng hồ thực tế; báo cáo cũ giữ mốc lịch sử riêng.

Hướng dẫn API, cấu hình, cách tính cảnh báo, giới hạn ảnh và phạm vi dữ liệu: [AI-INTEGRATION.md](analysis%20and%20design/AI-INTEGRATION.md). Khả năng đã có mã triển khai không đồng nghĩa chất lượng đã được kiểm chứng trên mọi ảnh hoặc mọi cách hỏi; xem báo cáo kiểm tra thực tế trước nghiệm thu.

## Quy ước nghiệp vụ hiện tại

- Mô hình thuê **nguyên phòng**, một người đại diện và danh sách thành viên dạng văn bản. Chưa quản lý hợp đồng theo giường hoặc chia nghĩa vụ từng người.
- Tiền là số nguyên VND; diện tích cho phép số thập phân. Ngày nghiệp vụ dùng `YYYY-MM-DD`, kỳ dùng `YYYY-MM`; ngày hiện tại theo `Asia/Ho_Chi_Minh`.
- Mỗi phòng chỉ có một lượt thuê hiện hành. Hợp đồng tương lai giữ nháp tới khi lượt thuê trước hoàn tất bàn giao; một người thuê không đồng thời có hợp đồng đang hiệu lực khác. Gia hạn tăng phiên bản, lưu phiên bản trước và yêu cầu người thuê xác nhận lại điều khoản thay đổi.
- Chỉ số điện/nước là số nguyên; chỉ số mới không nhỏ hơn chỉ số cũ, không trùng phòng/kỳ; chỉ số đầu kỳ phải khớp kỳ đã xác nhận trước đó. Phần thập phân đọc từ ảnh được giữ để đối chiếu, chưa được lưu thành chỉ số tính tiền thập phân. Hóa đơn đã phát hành giữ ảnh chụp đơn giá và dữ liệu tính tiền.
- Tiền thuê mặc định tính đủ tháng. Trường điều chỉnh hỗ trợ ghi nhận khoản cộng/trừ đã thống nhất; chưa tự tính theo ngày vào/ra giữa tháng hoặc thay đổi thành viên giữa kỳ.
- Dịch vụ theo phòng/người lấy số lượng mặc định; dịch vụ theo sử dụng cho phép nhập số lượng thực tế. Hóa đơn hiển thị từng dòng dịch vụ và phí xe đang hoạt động. Server tính lại thành tiền và không tính lặp cùng dịch vụ/phương tiện. Dữ liệu cũ gửi một `serviceFee` tổng vẫn được hỗ trợ như phí tổng hợp.
- Hóa đơn có bản nháp, xem trước và phát hành. Tenant không xem được nháp. Điều chỉnh hóa đơn đã phát hành cần lý do, lưu phiên bản trước và audit; tổng mới không được nhỏ hơn phần đã phân bổ nếu chưa ghi nhận hoàn tiền. Không đổi phòng/kỳ hoặc sửa ngầm lịch sử.
- Chủ trọ xác nhận tiền mặt/chuyển khoản thực nhận, gồm khoản trả một phần/đủ/dư. Phần dư được giữ thành số dư theo tenant và biên nhận gốc; có thể phân bổ vào hóa đơn khác cùng tenant hoặc hoàn lại. Hoàn phần đã phân bổ vào hóa đơn làm giảm `paid`. Không hoàn vượt số dư/phần đã phân bổ và không phân bổ số dư của tenant khác.
- Báo cáo phân biệt tiền đã lập hóa đơn, tiền đã phân bổ, số dư đang giữ và dòng tiền nhận/hoàn thực tế. `payments.amount` không được cộng toàn bộ như thu mới: `receipt` là biên nhận, `credit_apply` chỉ phân bổ tiền đã nhận, `refund` là hoàn tiền; `appliedAmount`/`creditAmount` biểu diễn phần tăng/giảm từng sổ. Phân bổ số dư không tạo thêm giao dịch tiền mặt. Sổ cọc theo dõi riêng.
- Kết thúc hợp đồng đưa phòng sang chờ bàn giao. Sau khi đối chiếu hóa đơn, hoàn/khấu trừ hết tiền cọc và xác nhận biên bản trả phòng hai bên, phòng mới trở về trống. Tiền cọc đang giữ được tách khỏi doanh thu; khấu trừ có lý do được ghi nhận riêng.
- VietQR là ảnh chỉ dẫn chuyển khoản từ `img.vietqr.io`, không phải cổng thanh toán hoặc xác nhận ngân hàng. Ảnh QR cần mạng; khi tải ảnh, mã ngân hàng, số tài khoản, tên tài khoản, số tiền và nội dung chuyển khoản được gửi đến dịch vụ đó.
- Thông báo trong ứng dụng gửi theo cơ sở, một/nhiều phòng hoặc tenant. Nhắc hóa đơn sắp hạn/quá hạn và hợp đồng sắp kết thúc được tạo khi tải dữ liệu, theo số ngày cấu hình, tránh trùng và giữ trạng thái đọc. Chưa có scheduler gửi nhắc qua email/push/SMS khi không ai truy cập. Email SMTP tùy chọn hiện phục vụ xác thực và đặt lại mật khẩu.
- Phiếu sửa chữa có thể gắn tài sản đúng phòng, ảnh trước/sau sửa, ngày dự kiến và chi phí; tenant xác nhận/đánh giá kết quả. Chi phí đã ghi sổ không thay đổi ngầm khi làm lại. Tài liệu có quyền xem, phiên bản cũ và quản lý mẫu hợp đồng/biểu mẫu để sao chép thành tài liệu mới.

## Kiến trúc và lưu trữ

| Vị trí | Trách nhiệm |
| --- | --- |
| `src/frontend/App.tsx` | Đăng nhập/đăng ký, phiên người dùng, điều hướng và bộ lọc cơ sở. |
| `src/frontend/ui.tsx` | Thành phần dùng chung, form, bảng, modal và trạng thái. |
| `src/frontend/pages/Core.tsx` | Tổng quan, phòng, chỉ số, hóa đơn, thanh toán, báo cáo và hồ sơ. |
| `src/frontend/pages/Tenancy.tsx` | Cơ sở, người thuê, hợp đồng, dịch vụ, cọc, thu chi, bàn giao, phương tiện và tiện ích. |
| `src/frontend/pages/Operations.tsx` | Sự cố, tài sản, thông báo, ticket, tài liệu, cài đặt và thống kê tiêu thụ. |
| `src/frontend/pages/Assistant.tsx`, `ai-ui.tsx` | Trợ lý có nguồn, trạng thái AI/Vision, cảnh báo/review, một đề xuất có nguồn OCR/OCR + Vision/Vision dự phòng khi cần và gợi ý phân loại có xác nhận. |
| `src/backend/server.mjs` | HTTP, auth, session, tệp, giới hạn yêu cầu và phục vụ `dist`. |
| `src/backend/domain.mjs` | Phân quyền, kiểm tra dữ liệu, hành động nghiệp vụ và audit. |
| `src/backend/db.mjs` | SQLite, schema, transaction và băm mật khẩu. |
| `src/backend/seed.mjs` | Dữ liệu minh họa. |
| `src/backend/mail.mjs`, `outbox.mjs` | Hàng đợi/thư xác thực, transport SMTP tùy chọn và đọc thư phát triển cục bộ. |
| `src/backend/backup.mjs` | Sao lưu SQLite đầy đủ và giữ khóa mã hóa cục bộ. |
| `src/backend/extensions.mjs`, `ai-service.mjs` | Đăng ký provider, kiểm tra phạm vi đầu vào/tệp, lịch sử AI và review cảnh báo. B01–B04 hoạt động; B05 chưa có provider. |
| `src/ai/` | Ollama cục bộ, copilot, thống kê bất thường, đọc công tơ bằng Vision + OCR và phân loại sửa chữa. |

SQLite có bảng riêng cho tài khoản, session, token, outbox, tệp, lịch sử AI và ghi nhận kiểm tra cảnh báo. Các thực thể nghiệp vụ được lưu dưới dạng JSON trong bảng `records`, có index theo chủ trọ/cơ sở và ràng buộc trùng phòng/kỳ. Liên kết nghiệp vụ được kiểm tra tại tầng domain; đây chưa phải mô hình quan hệ tách bảng hoàn chỉnh cho từng thực thể.

Những hành động nhiều bước chạy trong SQLite transaction. Các thao tác tiền/hợp đồng cần đi qua API hành động; không sửa database bằng UI chung. File đính kèm nằm trong SQLite và chỉ được tải qua API có kiểm tra quyền; file tối đa **5 MB**, request JSON tối đa **8 MB**. Thư viện mỗi phòng tối đa 6 ảnh. Số giấy tờ mã hóa bằng AES-256-GCM khi lưu và được che trong phản hồi API; khóa từ `TROZY_DATA_KEY` hoặc file `.trozy-data-key` cục bộ.

Tenant đã trả phòng không tiếp tục xem dữ liệu mới của phòng/người thuê sau. Các hồ sơ lịch sử được cấp vẫn có thể truy cập; chỉ số điện nước được giới hạn theo thời gian thuê. Biên bản đã hoàn tất không thể phát lại để làm trống phòng đang cho người khác thuê.

## Sao lưu và giới hạn triển khai

**Cài đặt → Dữ liệu → Xuất bản sao lưu** tải JSON dữ liệu nghiệp vụ được cấp quyền. JSON này không bao gồm mật khẩu, session, token/outbox hay nội dung nhị phân của file; chưa có luồng khôi phục toàn hệ thống từ JSON. Chức năng nhập chỉ dành cho danh sách phòng và người thuê từ `.xlsx`/`.csv`, có xem trước và kiểm tra toàn bộ lô.

Sao lưu đầy đủ bằng CLI:

```powershell
npm run backup
# Hoặc chọn một thư mục đích mới:
npm run backup -- backups/ban-sao-luu-2026-10-27
```

CLI dùng API backup SQLite để tạo snapshot nhất quán, gồm dữ liệu, tài khoản/token/outbox và nội dung tệp. Nó sao chép `.trozy-data-key` nếu dùng khóa cục bộ và tạo `backup.json`; không ghi đè thư mục đã có database sao lưu. Khi dùng `TROZY_DATA_KEY`, phải giữ riêng đúng giá trị khóa môi trường đó. Chỉ file SQLite mà thiếu khóa tương ứng không đủ để đọc lại số giấy tờ.

Để khôi phục, dừng ứng dụng, sao chép database và khóa từ bản sao lưu vào một thư mục dữ liệu chạy riêng, đặt `TROZY_DB_PATH` tới database đó rồi khởi động và kiểm tra. Giữ bản sao lưu gốc nguyên vẹn. Không có endpoint HTTP khôi phục hoặc lịch sao lưu tự động. Các thư mục mặc định `data/` và `backups/` được bỏ qua bởi Git, gồm khóa cục bộ bên trong chúng. Nếu chọn đường dẫn riêng, kiểm tra quy tắc bỏ qua tương ứng; database và khóa chứa dữ liệu/thông tin xác thực cần giữ riêng.

Bản hiện tại hướng tới chạy cục bộ và nghiệm thu đồ án. Chưa có triển khai hosting công khai, cấu hình reverse proxy/HTTPS, scheduler sao lưu hoặc kiểm thử tải. Ngân hàng đối soát tự động, ký số và app native nằm ngoài phạm vi chính; B05 còn là hướng mở rộng. B01–B04 cần đánh giá thêm trên dữ liệu/ảnh thực tế và nhiều kiểu mô tả. Chỉ dùng dữ liệu giả khi kiểm thử/demo.

ExcelJS được tách thành chunk bất đồng bộ khoảng **937 kB**: chỉ tải khi dùng chức năng nhập hoặc tải mẫu Excel trong Cài đặt → Dữ liệu, không nằm trong lượt tải giao diện ban đầu. Đây là phần build lớn còn lại, cần tính đến khi triển khai trên đường truyền chậm.
