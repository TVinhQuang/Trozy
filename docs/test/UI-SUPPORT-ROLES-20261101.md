# Hỗ trợ theo vai trò — 01/11/2026

Theo yêu cầu của người dùng, mục **Cần một chút hỗ trợ?** trong sidebar mở **Trợ lý Trozy** khi đăng nhập bằng chủ trọ và **Yêu cầu hỗ trợ** khi đăng nhập bằng khách trọ. Icon, dòng mô tả và tooltip phản ánh đích đến. Menu điện thoại đóng lại sau khi chọn và trả focus về nút menu như các mục điều hướng hiện tại.

Chủ trọ không còn nút hoặc form **Tạo yêu cầu** trong trang hỗ trợ; trạng thái trống giải thích rằng đây là yêu cầu khách trọ gửi đến. Chủ trọ vẫn xem, tiếp nhận, phản hồi, đánh dấu giải quyết và mở lại trao đổi. Khách trọ vẫn tạo và phản hồi yêu cầu cho phòng của chính mình; form tạo không chọn phòng của người khác. Trạng thái không có kết quả sau lọc hướng dẫn quay lại Tất cả.

API tạo ticket chỉ chấp nhận vai trò tenant, trả 403 cho chủ trọ trước khi chuẩn hóa hoặc ghi bản ghi/audit. Phạm vi khách trọ và luồng xem/phản hồi/chuyển trạng thái giữ nguyên. Không thay đổi nghiệp vụ bảo trì/sự cố riêng, dữ liệu thật hoặc luồng ảnh công tơ/OCR.

Kiểm chứng:

- **157/157 Node tests đạt**, không lỗi hoặc bỏ qua. Regression mới bao phủ từ chối chủ trọ tạo ticket, không ghi dữ liệu khi từ chối, khách tạo đúng phạm vi dù gửi trường giả, chủ trọ nhận/phản hồi/giải quyết và khách mở lại; chủ trọ khác không xem/phản hồi ngoài phạm vi.
- **21 nhóm App shell đạt**, có thao tác mục hỗ trợ trên desktop và drawer điện thoại cho cả hai vai trò.
- **5 nhóm UI hỗ trợ đạt**, có trạng thái trống của chủ trọ, trao đổi thực sự, payload tạo của khách, lỗi/thử lại giữ nội dung và ẩn form đang mở khi đổi sang vai trò chủ trọ.
- Build TypeScript/Vite đạt; chỉ có advisory kích thước chunk hiện hữu. JSON design và whitespace phần sửa đạt.

Lượt Node đầu chạy đồng thời với build và kiểm tra shell có một lỗi worker OCR tạm thời; lượt chạy đầy đủ sau đó đạt 157/157. Kiểm tra shell ban đầu có assertion focus không đúng cơ chế điều hướng hiện tại; đã sửa assertion về đích đến và chạy lại toàn bộ 21 nhóm đạt. Không sửa engine OCR hoặc làm yếu kiểm tra nghiệp vụ.

Các bài UI dùng DOM/fixture cô lập; không phải bằng chứng screenshot, bố cục hoặc zoom trên trình duyệt thật. OCR/B03 tiếp tục được ghi **đang hoàn thiện/thử nghiệm** trong README và ghi chú tiến độ.
