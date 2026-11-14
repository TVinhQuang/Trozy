# Triển khai các module M06-M11 và M16

> Phiên bản cơ sở: `Trozy-main.zip` do nhóm cung cấp (bản local mới hơn GitHub `main`).  
> Phạm vi yêu cầu: `Module M06 - M11 & M16.pdf`, 12 trang, use-case UC26-UC43 và UC53-UC55.  
> Ngày ghi nhận triển khai: 14/11/2026.

## 1. Nguyên tắc triển khai

- Giữ mô hình phân quyền hiện tại: chủ trọ mới được cấu hình/chốt số liệu, phát hành hóa đơn, xác nhận tiền và quyết toán; người thuê chỉ xem dữ liệu được liên kết với hợp đồng/phòng và gửi yêu cầu phản hồi.
- Tái sử dụng collection/action hiện tại (`settings`, `meters`, `readings`, `services`, `charges`, `invoices`, `payments`, `deposits`, `depositSettlements`, `transactions`, `notifications`, `tickets`) thay vì tạo một hệ thống nghiệp vụ song song.
- Dùng dữ liệu đã chốt cho các phép tính hóa đơn theo công tơ. Phương thức tính theo đầu người hoặc phí cố định không bắt buộc có số đọc.
- Kết quả OCR chỉ là đề xuất. Chỉ số chỉ được dùng tính tiền sau khi chủ trọ kiểm tra, xác nhận và chốt kỳ.
- VietQR là hướng dẫn chuyển khoản; không phải bằng chứng thanh toán. Báo đã chuyển của người thuê luôn ở trạng thái chờ cho đến khi chủ trọ xác nhận.
- Tiền cọc đang giữ không phải doanh thu. Bù trừ công nợ từ tiền cọc không tạo dòng tiền thu mới.

## 2. Phạm vi đã triển khai

### M06 - Utility Meter Management (UC26-UC29)

- Cấu hình phương thức tính điện/nước theo công tơ, đầu người hoặc phí cố định; lưu mốc giá và ngày bắt đầu hiệu lực.
- Đăng ký công tơ điện/nước theo phòng, kiểm tra mã, loại công tơ, chỉ số ban đầu và công tơ hoạt động trùng loại.
- Thay công tơ: lưu chỉ số cuối của công tơ cũ, chỉ số đầu của công tơ mới, mã và ngày thay. Hỗ trợ nhiều lần thay trong một kỳ; phần tiêu thụ trước/sau mỗi lần thay được cộng theo từng đoạn công tơ.
- Nhập số đọc nháp, ảnh bằng chứng, người ghi và thời điểm; kiểm tra số âm, tính liên tục với kỳ trước và cảnh báo bất thường. Chốt kỳ khóa số đọc; mở khóa cần lý do và lưu lịch sử. Không mở khóa kỳ đã có hóa đơn phát hành.
- Kết nối các panel OCR hiện có trong dự án; chất lượng ảnh/đề xuất được kiểm tra theo pipeline meter reader. Chủ trọ phải xác nhận, không tự ghi số từ OCR.
- Người thuê chỉ xem kỳ đã chốt, ảnh, mức tiêu thụ, đơn giá và khoản tiền đã công bố; kỳ chưa chốt không hiển thị số tiền.

### M07 - Service and Surcharge Management (UC30-UC31)

- Dịch vụ có đơn giá và mốc hiệu lực; hỗ trợ cách tính theo phòng/tháng, người/tháng, tháng, phương tiện/tháng và mức sử dụng.
- Gán phạm vi dịch vụ theo phòng hoặc hợp đồng; lưu lịch sử thay đổi giá; ngừng dịch vụ từ kỳ sau mà không xóa dữ liệu kỳ cũ.
- Tạo phụ phí/giảm trừ gắn với phòng, người thuê, kỳ hóa đơn, số tiền, lý do và tệp minh chứng. Khi lập hóa đơn, khoản chưa gắn hóa đơn của đúng kỳ được đưa vào dòng tương ứng và đánh dấu đã gắn hóa đơn.
- Người thuê chỉ xem dịch vụ được áp dụng cho phòng/hợp đồng, lịch sử giá và phụ phí/giảm trừ của mình.

### M08 - Invoice Management (UC32-UC35)

- Xem trước và tạo hóa đơn nháp, tổng hợp tiền phòng, điện, nước, dịch vụ/phương tiện, phụ phí/giảm trừ và điều chỉnh.
- Phòng tính điện/nước theo công tơ phải có số đọc đã chốt; theo đầu người/phí cố định không yêu cầu số đọc. Chống tạo trùng hóa đơn cùng phòng/kỳ.
- Sửa hóa đơn nháp, phát hành và khóa nội dung; thông báo người thuê. Hóa đơn đã phát hành được điều chỉnh bằng hóa đơn điều chỉnh có lý do/lịch sử, không sửa âm thầm.
- Hủy chỉ áp dụng khi chưa thu tiền hoặc các khoản đã được hoàn theo quy trình.
- Người thuê xem hóa đơn của mình, công thức/dòng tính, lịch sử điều chỉnh, báo yêu cầu rà soát hóa đơn kèm mô tả/ảnh; yêu cầu được lưu dưới dạng ticket liên kết invoice.
- Nút in/lưu PDF dùng hộp thoại in của trình duyệt (`window.print`), không phải dịch vụ sinh PDF phía máy chủ.

### M09 - Payment and Debt Management (UC36-UC39)

- Cấu hình ngân hàng, BIN, số tài khoản và tên chủ tài khoản ở cấu hình cơ sở; hiển thị VietQR theo số tiền còn nợ và nội dung chuyển khoản.
- Người thuê có thể báo đã chuyển khoản; bản ghi `transfer_report` ở trạng thái chờ, không làm tăng số tiền đã thanh toán hoặc tạo bút toán thu.
- Chủ trọ xác nhận/từ chối báo chuyển khoản. Khi xác nhận, hệ thống kiểm tra hóa đơn và số tiền, phân bổ khoản thu, xử lý trả dư thành credit, cập nhật hóa đơn, sổ thu chi và thông báo người thuê.
- Tiếp tục hỗ trợ ghi nhận tiền mặt/chuyển khoản trực tiếp, thanh toán một phần, trả dư, lịch sử và biên nhận.
- Danh sách công nợ và nhắc thanh toán từng hóa đơn; lưu lịch sử gửi nhắc.
- Không tự động đối soát ngân hàng, không nhận webhook và không tự xác nhận tiền dựa trên ảnh/mã QR.

### M10 - Security Deposit and Refund Management (UC40-UC41)

- Nhận cọc, bổ sung, điều chỉnh, khấu trừ và hoàn; lưu từng mục lịch sử. Tiền cọc đang giữ không được ghi vào doanh thu.
- Chỉ tạo quyết toán sau khi hợp đồng đã kết thúc và biên bản trả phòng được hai bên xác nhận.
- Hồ sơ quyết toán có nhiều khoản khấu trừ, lý do và tệp bằng chứng; hệ thống tính số cọc giữ, khấu trừ, công nợ được bù và khoản còn lại phải hoàn.
- Người thuê có thể đồng ý hoặc gửi ý kiến không đồng ý; chủ trọ điều chỉnh và gửi lại hồ sơ. Chỉ khi người thuê đồng ý mới cho ghi nhận hoàn tiền.
- Khi chốt quyết toán, phần công nợ được phân bổ vào hóa đơn chưa thanh toán bằng bút toán `deposit_offset` (không phải tiền mặt thu mới); tiền hoàn thực tế được ghi thành chi phí dòng tiền và lịch sử hoàn cọc.

### M11 - Income and Expense Management (UC42-UC43)

- Sổ thu/chi thủ công theo cơ sở, phòng, loại, danh mục, ngày, số tiền, mô tả và tệp minh chứng; lưu lịch sử sửa/xóa theo cơ chế hiện hành.
- Xác nhận tiền hóa đơn tự tạo bút toán thu; hoàn tiền hóa đơn/trả dư và hoàn cọc tạo bút toán chi tương ứng. Bù trừ cọc vào công nợ không được ghi thành tiền mặt thu.
- Báo cáo theo khoảng ngày/cơ sở, phân biệt hóa đơn đã lập, tiền đã thu theo hóa đơn, công nợ còn lại, khoản thu khác, chi phí và dòng tiền ròng.
- Hỗ trợ xuất CSV, Excel (`exceljs`) và in/lưu PDF qua hộp thoại in trình duyệt.
- Sổ thu chi này không phải kế toán kép; sổ cọc vẫn cần được đối chiếu ở phân hệ M10.

### M16 - Notifications and Reminders (UC53-UC55)

- Chủ trọ gửi thông báo đến toàn cơ sở, nhiều phòng hoặc một người thuê; kiểm tra người nhận thuộc cùng cơ sở; hỗ trợ loại thông báo và một tệp đính kèm.
- Trợ lý B01 tạo bản nháp; người dùng có thể xem trước/chỉnh nội dung, chọn phạm vi và tự xác nhận gửi. Việc mở bản nháp không gửi thông báo.
- Lưu lịch sử người nhận, read/unread và thời điểm đọc; chủ trọ xem trạng thái đọc theo từng người.
- Tùy chọn email theo tài khoản người nhận; thư được đưa vào `notification_mail_outbox`, có chống trùng người nhận và retry có giới hạn. Cần cấu hình SMTP để gửi email thật.
- Backend chạy chu kỳ nhắc hàng ngày khi tiến trình ứng dụng đang hoạt động: hóa đơn sắp đến hạn/quá hạn, hợp đồng sắp/đến ngày kết thúc và thay đổi trạng thái ticket. Nếu tắt server, chu kỳ không chạy trong thời gian đó; chưa có push/SMS.

## 3. Các tệp đã thay đổi hoặc bổ sung

### Backend

- `src/backend/domain.mjs` - validation, tính hóa đơn, thay công tơ, chốt/mở khóa số đọc, báo/ xác nhận chuyển khoản, quyết toán cọc, thu chi và nhắc.
- `src/backend/db.mjs` - bảng outbox email thông báo và đánh dấu migration.
- `src/backend/mail.mjs` - nội dung/thực thi email thông báo và cơ chế gửi qua SMTP.
- `src/backend/server.mjs` - xếp hàng, retry email và lịch tạo nhắc tự động; đóng scheduler/queue an toàn.

### Frontend

- `src/frontend/types.ts` - các collection/kiểu dùng chung.
- `src/frontend/pages/Core.tsx` - điện nước, hóa đơn, thanh toán, công nợ, báo cáo và cài đặt hồ sơ.
- `src/frontend/pages/Tenancy.tsx` - dịch vụ, phụ phí/giảm trừ, tiền cọc/quyết toán và sổ thu chi.
- `src/frontend/pages/Operations.tsx` - thông báo, lọc, trạng thái đã đọc và cấu hình.
- `src/frontend/pages/Assistant.tsx` - gửi bản nháp thông báo từ B01 qua action nghiệp vụ có kiểm tra.
- `src/frontend/styles.css` - định dạng in báo cáo.

### Tests và tài liệu

- `tests/backend.test.mjs` - fixture/ca kiểm thử theo quy tắc số đọc chốt, phương thức phi công tơ, thay công tơ nhiều lần, báo chuyển khoản và quyết toán cọc.
- `tests/security.test.mjs` - ca bảo mật/riêng tư, gồm thông báo nhiều phòng.
- `docs/requirements/FEATURE-COVERAGE.md` - cập nhật ma trận trạng thái so với yêu cầu.
- `docs/implementation/M06-M11-M16-IMPLEMENTATION.md` - tài liệu này.

## 4. Kiểm tra đã thực hiện

- `node --check` cho `src/backend/domain.mjs`, `src/backend/db.mjs` và `src/backend/server.mjs`.
- TypeScript `transpileModule` kiểm tra cú pháp 28 tệp triển khai trong `src/`: không có lỗi cú pháp.
- `node --test tests/backend.test.mjs tests/security.test.mjs`: 29/29 test pass.
- Vì môi trường kiểm thử hiện tại không cài dependency native `sharp`, hai bộ test backend/security được chạy với module stub tạm thời; hai bộ test này không gọi xử lý ảnh. Stub đã được xóa sau kiểm thử.

## 5. Giới hạn kiểm thử/môi trường cần nhóm xác nhận

- Repository yêu cầu Node.js `>=24.0.0`; môi trường hiện tại là Node.js `22.16.0`.
- Không có `node_modules` đã cài, nên chưa chạy được Vite production build, TypeScript type-check đầy đủ, Excel export runtime hoặc kiểm thử xử lý ảnh OCR có `sharp` thật.
- Gửi email thật cần cấu hình SMTP. Scheduler cần tiến trình Backend tiếp tục chạy; không thực hiện bù các thông báo trong thời gian hệ thống tắt.
- PDF hóa đơn/báo cáo dùng in/lưu PDF qua trình duyệt; chưa có PDF generator phía server.

## 6. Lệnh nhóm nên chạy tại máy phát triển

Sau khi cài Node.js 24+ và dependencies theo README:

```bash
npm install
npm test
npm run build
npm run check:pages
npm run check:readings-entry
npm run check:ai-ui
```

Nên chạy tiếp các bài kiểm thử meter/OCR và email integration trên môi trường có `sharp`, local model/runtime và SMTP phù hợp trước khi deploy.
