# Sửa lỗi kết nối đọc ảnh tự động — 01/11/2026

Người dùng thấy thông báo đỏ “Không thể thực hiện yêu cầu. Vui lòng thử lại.” khi mở ảnh điện kỳ 2027-01. Đã tái hiện lỗi ở kết nối API, trước bước gọi model.

## Nguyên nhân đã xác minh

- Gọi `http://127.0.0.1:3001/api/health` thất bại với `ECONNREFUSED`: không có backend lắng nghe.
- Cùng yêu cầu qua `http://127.0.0.1:5173/api/health` nhận HTTP500, `Content-Type: text/plain`, body rỗng. Vite đang chạy nhưng không chuyển tiếp được tới backend.
- `src/frontend/api.ts` cũ thay lỗi không đọc được JSON bằng thông báo chung. Người dùng không phân biệt được lỗi kết nối với lỗi nhận dạng.
- Process inventory cho thấy `node --watch src/backend/server.mjs` vẫn sống nhưng không có server con, trong khi Vite vẫn mở giao diện. Dev launcher cũ chỉ theo dõi việc watcher thoát; watcher chờ sửa mã sau khi server con dừng nên lỗi không được phát hiện.
- Log launcher ứng dụng trước đó chỉ ghi lần mở cổng thành công, không ghi exception. Không có đủ bằng chứng để khẳng định nguyên nhân tiến trình backend trước đó thoát. Không quy lỗi cho ảnh, model hoặc kỳ 2027-01.

Đọc database ở chế độ read-only cho thấy bộ ảnh người dùng đang mở có job `needs_setup`, `attempts: 0`, chưa có profile được xác nhận. Model chưa chạy cho bộ ảnh này. Không chỉnh cấu hình hoặc thử nhận dạng ảnh nghiệp vụ trong lượt sửa lỗi.

## Thay đổi

- `scripts/dev-api.mjs`: kiểm tra API Trozy, dùng HOST/PORT nhất quán, chờ API trước khi mở Vite. Dùng lại API Trozy đã hoạt động; không khởi động trùng backend hay dừng API được dùng lại.
- `scripts/dev.mjs`: giám sát sức khỏe API, chấp nhận khoảng trống 15 giây khi tải lại mã; khởi động lại watcher do launcher sở hữu tối đa hai lần. Nếu vẫn lỗi, dừng đúng giao diện/tiến trình do nó mở và báo lý do. Dọn tài nguyên cả khi khởi động thất bại.
- `vite.config.ts`: proxy theo cấu hình HOST/PORT; mất upstream trả JSON503 có hướng dẫn, không trả lỗi 500 rỗng. Cổng web dùng strictPort để tránh âm thầm chuyển sang URL khác.
- `src/frontend/api.ts`: phân biệt lỗi kết nối, lỗi nghiệp vụ JSON, phiên đăng nhập và phản hồi sai định dạng; giữ mã HTTP và AbortError, không hiện HTML hay thông tin nội bộ.
- Không sửa YOLO, VisionState, ngưỡng nhận dạng, hồ sơ công tơ, chỉ số hoặc hóa đơn.

## Kiểm chứng

- `npm.cmd test`: **143/143**, không lỗi/bỏ qua. Gồm 9 kiểm tra startup/lifecycle, 7 kiểm tra API helper và 4 kiểm tra tích hợp Vite thật mới, cùng các bài backend/model trước đó.
- `npm.cmd run check:ai-ui`: **37/37**; các luồng tự động, thiết lập một lần, áp dụng/xác minh và tenant photo-only vẫn đạt.
- `npm.cmd run build`: TypeScript/Vite đạt với cấu hình cuối; cảnh báo chunk ExcelJS lớn có sẵn.
- Test Vite thật dùng backend giả lập và cổng tạm riêng: HOST/PORT tùy chỉnh, health200, JSON/cookie/body/status truyền nguyên vẹn. Dừng upstream gây JSON503/no-store và API helper hiển thị chính xác hướng dẫn. Không dùng database ứng dụng.
- Đã khởi động dev launcher mới quản lý cả API watcher và Vite. API3001 và proxy5173 cùng trả health200 JSON; route automatic chưa đăng nhập cùng trả401 JSON. Trang web5173 trả200.
- CUA báo browser access host không khả dụng; không tuyên bố đã kiểm tra trực tiếp tab hoặc camera của người dùng.

Ứng dụng hiện chạy tại **http://127.0.0.1:5173**, API **http://127.0.0.1:3001**. Launcher PID65900; manifest/log `.runtime/logs/dev-20261101-meter-connection-owned-38d9cce0/`. Xác minh manifest và identity trước khi dừng. Launcher cũ đã biến mất trước thao tác thay thế, nên guard từ chối dừng PID cũ; lần chuyển cuối chỉ dừng đúng dev session tạm và API tạm được xác minh.

Người dùng tải lại trang để thấy phần thiết lập công tơ lần đầu. Chỉ sau khi chủ nhà xác nhận số bánh/phần lẻ, hệ thống mới đọc ảnh. Việc này không bảo đảm mọi ảnh đều đọc được; ảnh có vùng mơ hồ vẫn cần kiểm tra thủ công theo [METER-READER.md](../METER-READER.md).
