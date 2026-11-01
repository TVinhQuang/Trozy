# Tích hợp bộ đọc công tơ — 31/10/2026

Đã tích hợp chính thức YOLO + VisionState theo luồng chủ nhà chọn/xác nhận vùng và đối chiếu ảnh. Hướng dẫn hiện hành ở [METER-READER.md](../METER-READER.md).

- Chủ nhà tải ảnh riêng hoặc xem ảnh người thuê gửi. Cấu hình số bánh/phần lẻ và vùng bốn góc là thao tác rõ ràng; YOLO chỉ gợi ý, không tự đọc hoặc áp dụng.
- Wheel Reader chỉ đưa đề xuất khi ảnh/bánh số qua kiểm tra. **Dùng chỉ số đề xuất** chỉ điền phần nguyên; xác minh vẫn cần ảnh, phần lẻ và ghi chú. Chuyển sang nhập tay xóa provenance model.
- Đề xuất riêng hết hạn 30 phút, gắn phiên bản và SHA-256 ảnh. Server từ chối sai quyền, ảnh cũ/khác, nguồn đổi, kỳ đã chốt/hóa đơn, đề xuất đã dùng/hết hạn và số không khớp. Tenant không được nhận đề xuất qua API, bootstrap hoặc export.
- Runtime/model đã có được dùng lại, không cài/tải thêm. Worker CPU có giới hạn một tác vụ, timeout/hủy và tmp riêng. Nhập tay không phụ thuộc runtime.

Kết quả kiểm chứng cuối:

| Kiểm chứng | Kết quả |
| --- | --- |
| Node tests | **94/94**, không lỗi hoặc bỏ qua |
| Python production tests | **4/4** |
| Tương tác UI trong DOM | **29/29**, giữ các kiểm tra cũ và thêm chủ nhà tải ảnh |
| Render route/vai trò/cơ sở | **132/132** |
| TypeScript và Vite build | Đạt; cảnh báo chunk ExcelJS lớn hiện hữu |
| HTTP với model thật | Đạt trên SQLite RAM; đề xuất `00766.4 kWh`, lưu766 chỉ sau đồng ý ảnh/phần lẻ, kỳ chưa chốt và hóa đơn không đổi |
| Ứng dụng local đã build | `http://127.0.0.1:3001/` trả HTTP200 |

[JSON kiểm chứng model thật và hash mã cuối](METER-READER-PRODUCTION-LIVE-20261031.json) giữ kết quả HTTP, chất lượng, từng bánh và 17 hash nguồn. Các thao tác xác minh số chỉ chạy trong SQLite RAM. Ứng dụng local dùng database dự án và khởi tạo bảng đề xuất mới khi mở; không tự đọc/chốt bộ ảnh hoặc đổi hóa đơn thật trong lượt này.

Không kiểm tra trực tiếp camera điện thoại hoặc bố cục trình duyệt thật vì công cụ browser không có host truy cập. UI được kiểm tra bằng DOM, render và build; không suy ra độ chính xác OCR chung từ vài ảnh thử.

Nguồn thử cũ/báo cáo chưa tốt, ảnh gốc, dữ liệu nghiệp vụ, giấy phép và model được giữ. Thư mục tạm riêng của lượt triển khai được dọn; tmp của ứng dụng đang chạy được giữ cho tới khi tiến trình dừng. Log và thông tin tiến trình local nằm trong `.runtime/logs/local-app-20261031-meter-reader/`.
