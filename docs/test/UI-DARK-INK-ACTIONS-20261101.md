# Nút khác màu, chữ tối và bảng phòng dễ quét — 01/11/2026

Theo yêu cầu mới, ba nút dashboard dùng ba nền riêng: quản lý phòng xanh dương, theo dõi điện nước xanh ngọc, báo cáo tím nhạt. Cả ba dùng chữ tối đậm. Các nút xem chi tiết/trao đổi, lịch sử/in báo cáo, tạo mới, lưu/xác nhận, chỉnh sửa và xóa ở các trang khác được gắn nhóm màu nhất quán. Hủy/đóng giữ trung tính; thanh điều hướng vẫn dùng nền/viền xanh chung.

Chữ nội dung, nút và nhãn trạng thái dùng `#171b24`; chữ phụ dùng xám đậm `#46505f`. Màu nằm ở nền, viền, icon/chấm trạng thái và biểu đồ. Các cảnh báo giữ nội dung và nhãn, không phụ thuộc riêng màu chữ.

Bảng phòng dùng mã phòng/số tiền/tên người thuê rõ bằng độ đậm; nhóm cơ sở/tầng có dải nền xanh nhạt. Hàng có nền nhẹ theo trạng thái thực từ `data-room-status`; cột phòng sticky giữ cùng nền với hàng. Dòng quá hạn và số sự cố có nền nhãn riêng với chữ tối. Giữ nguyên trường dữ liệu, số tiền, lọc, xuất Excel và quyền.

Kiểm chứng:

- **87 cặp tương phản token đạt**; chữ nội dung tối thiểu 7.35:1, chữ nút chức năng 12.07:1. Kiểm tra binding màu base/hover/active/disabled, chữ badge tối/chấm màu và đề xuất OCR vẫn đạt.
- Build TypeScript/Vite, **132 lượt render**, **8 nhóm phòng/dashboard**, **21 shell**, **41 AI UI**, **5 hỗ trợ** đạt. Nhóm dashboard kiểm tra riêng ba variant khác nhau và các nút vẫn điều hướng đúng.
- CSS/JSON/whitespace đạt. Không đổi API, handler hoặc dữ liệu thật; không chạy lại backend 157 tests của tác vụ trước vì không đổi nghiệp vụ.

Đã xem dashboard thực trong Chrome: ba nút có nền riêng và chữ tối, thanh điều hướng đồng nhất, thông tin chính đậm dễ đọc. Người dùng nhấn Escape khi thử chuyển sang trang phòng; Computer Use đã dừng và không được gọi lại trong lượt này. Không tuyên bố đã kiểm tra trực quan bảng mới/form/zoom/mobile đầy đủ; bảng và các trang khác được kiểm tra bằng DOM/fixture. Không thực hiện lưu, xuất hoặc sửa dữ liệu trên trình duyệt.

OCR/B03 tiếp tục là phần đang hoàn thiện; giữ người thuê gửi ảnh và chủ nhà xác minh thủ công. Không tải thêm thư viện/model, không tạo tệp tạm riêng hoặc thay đổi PA2/crop ngoài phạm vi.
