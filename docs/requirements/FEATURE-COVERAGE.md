# Đối chiếu chức năng Trozy

Phạm vi của bảng là mã nguồn trên GitHub tại ngày 26/11/2026. Cột cuối dẫn đến mã hoặc bài kiểm thử để nhóm kiểm tra khi thay đổi một nghiệp vụ. Tình trạng nghiệm thu và kết quả chạy được ghi trong [tiến độ dự án](../PROJECT-STATUS.md).

| Module | Luồng đã có trong ứng dụng | Điều kiện và giới hạn | Điểm đối chiếu |
| --- | --- | --- | --- |
| M01 · Tài khoản | Đăng ký, đăng nhập, quản lý hồ sơ và lời mời người thuê | Dữ liệu phụ thuộc phiên và vai trò. Email thực tế cần cấu hình SMTP. | [API](../../src/backend/server.mjs) · [Kiểm thử quyền](../../tests/security.test.mjs) |
| M02–M05 · Cơ sở, phòng, người thuê, hợp đồng | Chọn cơ sở, quản lý phòng và hồ sơ thuê, lập và gia hạn hợp đồng | Cơ sở có lịch sử nghiệp vụ có thể lưu trữ. Ký số nằm ngoài phạm vi hiện tại. | [Quản lý cơ sở](../../tests/property-management.test.mjs) · [Nghiệp vụ](../../src/backend/domain.mjs) |
| M06–M07 · Điện nước và dịch vụ | Nhập chỉ số hoặc lượng dùng, nhận ảnh theo kỳ, cấu hình dịch vụ | Người thuê gửi ảnh. Chủ trọ xem ảnh gốc và xác nhận trước khi ghi chỉ số. | [Luồng công tơ](../METER-READER.md) · [Kiểm thử gửi ảnh](../../tests/meter-photo-only.test.mjs) |
| M08–M11 · Hóa đơn, thanh toán, cọc, thu chi | Lập và phát hành hóa đơn, ghi nhận thu tiền, công nợ, cọc và giao dịch | Chủ trọ xác nhận tiền thực nhận. Đối soát ngân hàng tự động nằm ngoài phạm vi. | [Nghiệp vụ tài chính](../implementation/M06-M11-M16-IMPLEMENTATION.md) · [Kiểm thử backend](../../tests/backend.test.mjs) |
| M12–M15 · Cổng người thuê, bảo trì, tài sản, bàn giao | Người thuê xem hồ sơ được cấp quyền và gửi yêu cầu. Chủ trọ quản lý sửa chữa, tài sản và bàn giao. | Luồng thao tác phụ thuộc vai trò và phòng. | [Điều hướng](../../src/frontend/navigation.ts) · [Xử lý nghiệp vụ](../../src/backend/domain.mjs) |
| M16–M19 · Thông báo, hỗ trợ, tài liệu, phương tiện và tiện ích | Xem thông báo, gửi hoặc phản hồi phiếu, quản lý tài liệu và dịch vụ tại cơ sở | Người thuê tạo phiếu hỗ trợ. Chủ trọ tiếp nhận và phản hồi. | [Kiểm tra quyền hỗ trợ trên giao diện](../../scripts/check-support-tickets-ui.mjs) · [Kiểm thử API](../../tests/backend.test.mjs) |
| M20–M21 · Dashboard, báo cáo, cấu hình | Tổng hợp theo cơ sở, lọc báo cáo và quản lý dữ liệu | Kết quả hiển thị theo dữ liệu tài khoản được phép truy cập. | [Kiểm tra các trang theo vai trò](../../scripts/check-pages.mjs) · [API](../../src/backend/server.mjs) |
| M22–M23 · Phân tích và trợ lý | Phân tích tiêu thụ và hỏi đáp theo dữ liệu được cấp quyền | Gợi ý cần người dùng xem xét trước khi hành động. | [Phân tích](../../src/ai/anomalies.mjs) · [Trợ lý](../../src/ai/copilot.mjs) |

## AI và cách sử dụng trên điện thoại

- B01 hỗ trợ hỏi đáp, B02 phân tích bất thường và B04 gợi ý phân loại sửa chữa. B05 dự báo vẫn ở mức kế hoạch. [Điểm tích hợp](../../src/ai/register.mjs)
- B03 dùng PaddleOCR cho điện, YOLO và VisionState cho nước. Gemini Vision là phương án dự phòng khi đã cấu hình. Độ chính xác trên tập đồng hồ thực tế còn cần đánh giá. Việc hệ thống trả về đề xuất giữ nguyên quyền xác minh của chủ trọ. [Bộ đọc hiện hành](../METER-READER.md)
- Hai vai trò đều có thể thêm Trozy vào màn hình chính. Sau khi đăng nhập, người dùng có thể đóng bảng hướng dẫn và mở lại từ tài khoản. PWA cần kết nối mạng cho dữ liệu và ảnh. [Kiểm thử PWA](../../tests/pwa.test.mjs)
