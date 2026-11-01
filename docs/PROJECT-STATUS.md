# Tiến độ triển khai Trozy

Cập nhật **01/11/2026**. Ghi chú này mô tả mã đang có trong bản chạy cục bộ; không thay thế kế hoạch sprint, bài nộp PA hoặc biên bản nghiệm thu sản phẩm.

## Đã có trong bản chạy cục bộ

| Nhóm | Khả năng đã có | Giới hạn cần đọc cùng |
| --- | --- | --- |
| Tài khoản và quyền | Đăng nhập/đăng xuất, đăng ký, lời mời liên kết tenant, hồ sơ và phân quyền dữ liệu hai vai trò. | Email thật cần cấu hình SMTP; kiểm thử tự động dùng môi trường cô lập. |
| Cơ sở | Chọn riêng từng cơ sở, nhớ lựa chọn theo tài khoản; thêm/sửa, mở cơ sở, xóa cơ sở trống, lưu trữ và khôi phục. Có nút **+** và danh sách quản lý tại đầu trang. | Không xóa cưỡng bức cơ sở có phòng, hồ sơ nghiệp vụ hoặc tệp minh chứng. Lưu trữ giữ lịch sử và còn kiểm tra hợp đồng đang hoạt động. |
| Phòng và người thuê | Bảng phòng tổng hợp, bộ lọc, tab từng phòng, chi tiết/ảnh/chỉnh sửa, xuất Excel theo các phòng đang lọc; hồ sơ người thuê và hợp đồng. | Thành viên cùng phòng chưa là thực thể riêng; thao tác chuyển/trả phòng vẫn theo quy trình hợp đồng và bàn giao. |
| Điện nước thủ công | Nhập chỉ số tích lũy đầu/cuối kỳ hoặc lượng tiêu thụ kỳ này; hiển thị số cuối kỳ được tính và yêu cầu xác nhận. | Lượng dùng tháng này có thể thấp hơn tháng trước. Đầu kỳ vẫn là chỉ số tích lũy đã chốt; chưa bổ sung nghiệp vụ quay vòng/thay/reset công tơ. |
| Tài chính | Xem trước/nháp/phát hành/điều chỉnh hóa đơn; ghi nhận thanh toán, công nợ, cọc, số dư và thu chi; lưu lịch sử. | Chủ trọ xác nhận tiền thực nhận. VietQR là chỉ dẫn chuyển khoản; chưa đối soát ngân hàng hoặc tự chuyển tiền. |
| Vận hành và cổng tenant | Dashboard, thông báo, tài liệu, yêu cầu hỗ trợ, bảo trì, tài sản, phương tiện, tiện ích và bàn giao theo quyền. | Chưa có vai trò nhân viên/kỹ thuật viên, chat thời gian thực hoặc ứng dụng native. |
| Giao diện | Màu hồng nhẹ cho thao tác, nền trung tính, màu trạng thái/biểu đồ rõ; sidebar thu gọn, thanh ngang gom mục dư vào **Thêm**. Nút chọn cơ sở gọn, địa chỉ hiện khi mở danh sách. | Kiểm tra DOM và token màu không thay thế kiểm tra bố cục/zoom/thiết bị thật. |
| AI B01/B02/B04 | Trợ lý vận hành, phân tích tiêu thụ và gợi ý phân loại bảo trì có luồng cục bộ, nhãn nguồn và thao tác áp dụng/xác nhận. | Kết quả là hỗ trợ theo phạm vi tài liệu; AI không tự thanh toán, ký hợp đồng, khấu trừ cọc hoặc xác minh ảnh thay chủ nhà. |

## Đang hoàn thiện

### B03 / OCR — ĐANG HOÀN THIỆN, CHƯA NGHIỆM THU NHẬN DẠNG

Đã có luồng kỹ thuật gửi ảnh → tác vụ nền → đề xuất → chủ nhà đối chiếu trước khi lưu. Nhánh điện sử dụng **PaddleOCR PP-OCRv6 small**; nhánh nước sử dụng **YOLO + VisionState Wheel Reader**. Có thiết lập số bánh/phần lẻ, thử lại và chọn vùng/nhập tay dự phòng.

Phần còn hoàn thiện là khả năng nhận dạng ổn định trên ảnh thực tế, xử lý ảnh chưa rõ và kiểm chứng nhiều dạng công tơ. Một số ảnh điện toàn cảnh hiện vẫn cần kiểm tra hoặc chọn vùng thủ công. Chưa có bằng chứng để công bố độ chính xác chung hay khẳng định một engine tốt hơn trên mọi ảnh của Trozy. LCD/LED, mặt kim hoặc trường hợp không đủ bằng chứng tiếp tục dùng nhập tay.

**Người thuê chỉ gửi ảnh. OCR/AI chỉ đề xuất; chủ nhà đối chiếu ảnh và xác nhận trước khi ghi chỉ số. Gửi ảnh hoặc nhận đề xuất không tự thay đổi chỉ số và không tự lập hóa đơn.** Xem [hướng dẫn công tơ hiện hành](METER-READER.md).

### Kiểm chứng sử dụng thực tế

- Kiểm tra giao diện render, cửa sổ hẹp, browser zoom và thao tác cảm ứng trên môi trường thật. Công cụ truy cập trình duyệt chưa khả dụng trong phiên kiểm tra gần nhất, nên chưa ghi nhận visual QA đã đạt.
- Kiểm tra dịch vụ tùy chọn như SMTP với cấu hình thực tế; các bài kiểm tra tự động không xác nhận thư đã được gửi qua tài khoản SMTP thật.
- Tiếp tục kiểm tra hiệu năng, đóng gói và cấu hình triển khai trước khi nghiệm thu sử dụng. Build hiện có cảnh báo kích thước chunk JavaScript lớn; chưa phải lỗi build.

## Chưa triển khai trong phạm vi hiện tại

- B05 dự báo công nợ/doanh thu/phòng trống.
- Đối soát ngân hàng, webhook thanh toán và cổng thanh toán thật.
- Ký số hợp đồng, quy trình PDF hợp đồng/bàn giao theo mẫu hoàn chỉnh.
- Chat thời gian thực, ứng dụng native, mô hình nhiều vai trò nhân viên/kỹ thuật viên.
- OCR giấy tờ định danh và tự động suy đoán nghiệp vụ từ ảnh.

## Kiểm chứng đã ghi nhận

Mốc quản lý cơ sở đã ghi nhận **156 kiểm tra Node đạt**, **18 nhóm App shell**, **10 nhóm quản lý cơ sở**, **132 lượt render route/role/property**, **39 cặp tương phản token** và build TypeScript/Vite đạt. Các lần kiểm tra dùng fixture cô lập hoặc dữ liệu trong bộ nhớ, không thay đổi database/ảnh kinh doanh thật. Đây là bằng chứng kiểm tra tự động của bản cục bộ, không phải chứng nhận sản phẩm hoàn thiện hoặc triển khai production.

- [Biên bản quản lý cơ sở](test/PROPERTY-MANAGEMENT-20261101.md)
- [Biên bản nhập lượng tiêu thụ](test/METER-CONSUMPTION-ENTRY-20261101.md)
- [Biên bản màu giao diện](test/UI-COLOR-CLARITY-20261101.md)
- [Đối chiếu module và giới hạn](requirements/FEATURE-COVERAGE.md) — có phần lịch sử; đọc hướng dẫn công tơ hiện hành cho engine mới.

Các mốc Build/PA trong [README](../README.md) và tài liệu kế hoạch vẫn là kế hoạch tham chiếu. Việc một màn hình hoặc API đã tồn tại không đồng nghĩa mọi yêu cầu của module hay bài nộp đã hoàn tất.
