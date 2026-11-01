# Cải tiến OCR công tơ — kết quả và giới hạn

Ngày ghi nhận: **27/10/2026**. OCR Tesseract hiện có bước tự tìm hàng chữ số và chuẩn hóa từng ký tự trước khi nhận dạng. Luồng này chạy độc lập với Vision, không nhận chữ số do Vision trả về và không dùng chỉ số kỳ trước để đoán chữ số trong ảnh. Không thêm dependency nặng hoặc tải model mới.

## Thay đổi xử lý ảnh

`src/ai/ocr-image.mjs` tìm các cụm điểm ảnh có kích thước giống nét chữ số, ghép các cụm thành hàng theo chiều cao, khoảng cách và độ thẳng hàng. Hệ thống giữ tối đa hai vùng phù hợp. Các ký tự trong vùng được tách, chuẩn hóa chiều cao và xếp thành hàng ngang; RGB được giữ đủ lâu để kiểm tra nhóm nền đen/đỏ trước khi tạo ảnh OCR. Đây là chuẩn hóa hàng ký tự theo hình học, **chưa phải hiệu chỉnh phối cảnh đầy đủ** cho mọi mặt đồng hồ.

Tesseract đọc ảnh chuẩn hóa ở một số ngưỡng sáng cố định (`120`, `110`, `100`), với ngân sách tối đa **9 lượt nhận dạng** cho toàn bộ yêu cầu, gồm lượt đọc nền ban đầu. Kết quả phải có số chữ số khớp số ký tự quan sát từ hình học. Một nhóm chỉ được đánh dấu ổn định khi ít nhất hai biến thể ảnh cho cùng chuỗi, không có chuỗi hợp lệ cạnh tranh và điểm văn bản trung bình đạt ngưỡng trong code. Đây là kiểm tra tính nhất quán, không phải xác suất chính xác.

Hàng đợi vẫn một job chạy và tối đa hai job chờ; toàn bộ tiền xử lý và Tesseract nằm trong subprocess có timeout và có thể bị dừng. Giới hạn ảnh, MIME thật, số pixel, vùng chọn và quyền file không thay đổi. Vùng phát hiện được ghi theo pixel ảnh sau khi áp dụng hướng EXIF.

## Kết quả trên ảnh đồng hồ nước đã cung cấp

[OCR-IMPROVEMENT-LIVE.json](OCR-IMPROVEMENT-LIVE.json) là lần gọi **OCR độc lập**, có `visionUsed:false`. Ảnh gốc không được chép vào Git; JSON lưu SHA256 để đối chiếu.

| Nội dung | Kết quả thực tế |
| --- | --- |
| Vùng tìm tự động | Trái `292`, trên `503`, rộng `683`, cao `189` px; góc hàng khoảng `−9,7°`. Không dùng tọa độ cố định theo ảnh. |
| Nhóm số nền đen | `00001`, ổn định qua hai biến thể; điểm văn bản lần lượt `94` và `93`. |
| Toàn bộ hàng số | Có một lượt đọc `00001056`, điểm `73`, nhưng các biến thể khác đọc `00001096` và `80001096`; **chưa ổn định**. |
| Nhóm số nền đỏ | Hai lượt trả `09` và `05`, không đủ ba chữ số quan sát được; **chưa xác nhận**. |
| Đơn vị và vị trí thập phân | OCR chưa xác nhận độc lập; không tự ghép hàng số thành chỉ số tính tiền. |
| Đề xuất OCR độc lập | Không có (`suggestedValue:null`), dù đã đọc được nhóm đen. |
| Thời gian lần ghi bằng chứng | Khoảng `1,4` giây trên máy thử; không phải cam kết tốc độ cho ảnh hoặc máy khác. |

Trường `redDigits:"056"` trong bằng chứng vùng có thể lấy từ cách chia chuỗi tốt nhất của toàn hàng; vì `redStable:false`, nó **không phải** xác nhận OCR độc lập cho phần đỏ. Cần đọc các cờ ổn định cùng chuỗi chữ số, không chỉ lấy chuỗi có vẻ đúng.

[OCR-VISION-HYBRID-LIVE.json](OCR-VISION-HYBRID-LIVE.json) ghi lượt chạy qua HTTP: Vision đọc `00001.056 m³`, OCR xác nhận nhóm đen `00001`, nên kết quả có `engine:"hybrid"`, `assessment:"agreed"`, `agreementScope:"integer"`. Phần `.056`, đơn vị và quy ước thập phân vẫn dựa trên Vision và cần người dùng đối chiếu ảnh. Lượt ghi bằng chứng mất khoảng `7,6` giây, yêu cầu xác nhận và kiểm tra bản ghi nghiệp vụ không bị thay đổi. Không suy ra tốc độ tăng/giảm từ hai lần chạy ở trạng thái nạp model khác nhau.

## Chạy lại OCR độc lập

```powershell
npm run ai:ocr-check -- --file 'E:\Downloads\cach-xem-dong-ho-nuoc-va-tinh-tien-nuoc-don-gian-12.jpg' --utility water --expected-black 00001 --evidence 'docs/test/OCR-IMPROVEMENT-LIVE.json'
```

Lệnh không gọi Ollama hoặc Vision. `--expected-black` yêu cầu nhóm đen có đúng chuỗi và được đánh dấu ổn định. `--expected-register` chỉ đạt khi toàn hàng ổn định; không nên dùng giá trị này để làm phép kiểm tra của ảnh hiện tại. Không truyền đáp án mong đợi vào bộ nhận dạng: CLI chỉ kiểm tra kết quả sau khi nhận dạng xong. Chạy `npm run ai:ocr-check` không tham số để kiểm tra fixture điện tổng hợp.

## Phạm vi còn lại

Cải tiến này giúp OCR xác nhận được **phần nguyên của ảnh đã thử**, chưa giải quyết hoàn toàn phần đỏ, mọi kiểu LCD/LED, mặt số kim, số đang chuyển tiếp, lóa hoặc phối cảnh mạnh. Form nghiệp vụ vẫn ghi đơn vị nguyên và yêu cầu người dùng xác nhận trước khi lưu. Chỉ số thấp hơn kỳ trước tiếp tục bị chặn áp dụng.

Ảnh này đã được dùng để điều chỉnh thuật toán và làm ca hồi quy, **không phải mẫu đánh giá độc lập**. Không công bố tỷ lệ chính xác từ một ảnh hoặc từ điểm Tesseract. Cần đo trên ảnh và thiết bị chưa dùng khi phát triển theo [METER-EVALUATION.md](METER-EVALUATION.md), gồm tỷ lệ đúng cả dãy, tỷ lệ từ chối và số đề xuất sai được chấp nhận.
