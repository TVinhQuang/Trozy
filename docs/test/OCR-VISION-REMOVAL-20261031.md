# Gỡ OCR/vision — 31/10/2026

Theo yêu cầu người dùng, đã xóa triển khai OCR/vision hiện tại và chưa bắt đầu xây lại. Chỉ làm lại sau khi người dùng xác nhận rõ ràng.

Đã gỡ các module đọc/định vị/đối chiếu công tơ và adapter OCR trong `src/ai/`, tác vụ nền `meter-jobs`, API nhận dạng/đọc lại/cấu hình model công tơ, UI đề xuất và chi tiết nhận dạng. Các API B03 cũ trả 410; capability B03 là false. Mã transport Ollama chỉ còn tác vụ văn bản.

Đã xóa runtime Python/PaddleOCR chuyên dụng, model PP-OCR, cache OCR, model chữ số thử nghiệm, manifest Qwen3-VL và các blob chỉ model ảnh tham chiếu. Đã gỡ Tesseract và dữ liệu tiếng Anh khỏi package/lockfile và `node_modules` (14 package). Các script setup/check OCR/vision và test chỉ dành cho mã đã xóa cũng được gỡ. Không tải model hoặc dependency mới.

Đã giữ model/runtime văn bản Ollama cho B01/B04 và phân tích B02. Giữ nguyên ảnh, dataset ảnh, dữ liệu SQLite, báo cáo lịch sử, giấy phép và ảnh/báo cáo thử nghiệm trong `.runtime/paddleocr/work/`. Snapshot nhận dạng lịch sử được giữ trong database nhưng không xuất ra giao diện xác minh hiện tại. Cấu trúc `meterProfiles` cũ được giữ để không phá dữ liệu lịch sử, không còn API hoặc UI cấu hình.

Người thuê tiếp tục chụp/chọn và gửi tối đa ba ảnh công tơ, không nhập chỉ số. Ảnh mới vào trạng thái chờ xác minh thủ công. Chủ nhà chọn ảnh gốc, nhập chỉ số, xác nhận đã xem ảnh và ghi chú. Server tiếp tục kiểm tra quyền, lượt thuê, kỳ đã có hóa đơn, baseline và phiên bản trước khi lưu. Chỉ chốt kỳ khi đã xác minh điện và nước. Gửi ảnh không tự thay chỉ số hoặc lập hóa đơn. Các kiểm tra độ nét/ánh sáng/độ ổn định của camera trong trình duyệt là phép đo pixel, không dùng OCR/model.

Kiểm chứng trên dữ liệu cô lập:

- `npm test`: 76 đạt, không lỗi/bỏ qua.
- `npm run check:ai-ui`: 19 kiểm tra tương tác đạt.
- `npm run check:pages`: 132 render theo route/vai trò/cơ sở đạt. Có thông báo cổng WebSocket HMR 24678 đã được sử dụng; kết quả render vẫn đạt.
- `npm run build`: TypeScript và Vite đạt. Cảnh báo kích thước chunk ExcelJS vẫn hiện.
- Không còn import/module nhận dạng, tên dependency Tesseract hoặc cấu hình model ảnh trong source/package/lockfile hiện hành. Manifest và metadata Ollama chỉ còn model văn bản.

Mọi tệp tạm do lượt này tạo được lưu trong thư mục riêng trong dự án và dọn sau khi kiểm chứng. Không xóa thư mục tạm cũ chưa xác định nguồn.
