# Theme xanh dương và màu nút theo chức năng — 01/11/2026

Người dùng yêu cầu chuyển UI sang xanh dương, phân biệt màu các nút nhưng giữ chữ rõ; thanh ngang và thanh dọc dùng thống nhất màu chủ đạo. Đây là thay đổi màu và class hiển thị; cấu trúc điều hướng, nhãn, handler và quyền nghiệp vụ giữ nguyên.

## Hệ màu đã áp dụng

| Vai trò | Màu nền / chữ | Áp dụng |
| --- | --- | --- |
| Chủ đạo | `#c8ddff` / `#163e73` | Điều hướng, tạo mới và nút chính. Hover `#b6d2ff`, nhãn/link `#2154a2`. |
| Lưu và xác nhận | `#e2f3eb` / `#1b5e42` | Lưu thay đổi, xác nhận, ghi thu, xuất Excel/tải dữ liệu. |
| Chỉnh sửa và thử lại | `#fff1d7` / `#754708` | Sửa, điều chỉnh, mở thao tác hoàn tiền và thử lại. |
| Trợ lý và đề xuất | `#eee9ff` / `#573593` | Trợ lý Trozy, phân loại AI, đọc OCR và dùng đề xuất chưa xác minh. |
| Nguy hiểm | Màu đỏ semantic hiện hữu | Xóa hoặc thao tác nguy hiểm, có nhãn rõ. |

Các nút không chỉ phân biệt bằng màu: giữ nhãn và icon hiện tại. Hủy/đóng giữ trung tính. Trạng thái disabled của các nút hành động dùng nền trung tính và chữ rõ, không làm mờ cả nút. Nền làm việc trung tính; màu trạng thái và biểu đồ giữ ý nghĩa riêng. Auth, logo/favicon, theme-color, selection, dropdown và vùng chọn ảnh công tơ đã chuyển brand accent sang xanh.

**Đề xuất OCR chưa xác minh dùng tím; chỉ thao tác chủ nhà xác minh/lưu chính thức dùng xanh lá. OCR/B03 vẫn đang hoàn thiện/thử nghiệm.** Nền vùng đề xuất và vùng vừa điền chỉ số cũng chuyển từ xanh lá sang tím, với kiểm tra binding riêng để tránh gợi ý đã xác minh. Focus và đường chỉ dẫn chọn vùng dùng token xanh chủ đạo. Không sửa ảnh, model, database hoặc tự lưu chỉ số/hóa đơn.

## Kiểm chứng

- **67 cặp tương phản token đạt**, có kiểm tra CSS thực sự gắn đúng token cho base/hover/active/disabled. Chữ nút chức năng tối thiểu **6.06:1**, viền **3.46:1**, focus trên nền nút **5.45:1**; chữ chủ đạo/selection tối thiểu **6.05:1**. Đây là kiểm tra token CSS, không phải đo pixel/computed style hoặc mô phỏng thị giác màu.
- Build TypeScript/Vite đạt. Vite còn advisory kích thước chunk hiện hữu.
- **132 lượt render**, **21 nhóm shell**, **41 nhóm AI UI**, **8 nhóm phòng/dashboard**, **6 nhóm nhập tiêu thụ**, **10 nhóm quản lý cơ sở**, **5 nhóm UI hỗ trợ** đạt với dữ liệu cô lập.
- TSX được đối chiếu AST: thay đổi chỉ ở className. CSS/JSON và whitespace phần sửa đạt. Không chạy lại backend 157 tests vì không sửa logic; mốc 157/157 của tác vụ hỗ trợ trước giữ nguyên.

Đã xem trực tiếp Chrome qua Computer Use ở cửa sổ khoảng 1286×810: dashboard có điều hướng xanh đồng nhất, chữ/biểu đồ rõ và nút Trozy tím; trang phòng có **Xuất Excel** xanh lá và **Thêm phòng** xanh dương. Không nhấn xuất, lưu hoặc thay đổi dữ liệu. Một thao tác mở nút chỉnh sửa ngoài khung nhìn bị chặn; lần thao tác tab sau phát hiện người dùng đang nhập nên đã dừng điều khiển UI. Không tuyên bố form/hover/zoom/mobile đã được nghiệm thu trực quan đầy đủ. Browser DOM host vẫn chưa khả dụng; UI regression dùng DOM giả lập.

Các tệp tài liệu thiết kế và ghi chú trạng thái đã cập nhật; các biên bản lịch sử vẫn giữ màu và kết quả tại thời điểm ghi nhận. Không cài thêm dependency hoặc tải model; không tạo tệp tạm riêng cho tác vụ.
