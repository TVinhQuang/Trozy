# Đọc nền điện nước không cần thiết lập trước — 05/11/2026

Ảnh mới của người thuê/chủ nhà luôn vào hàng đợi, không chờ cấu hình số ô hoặc phần lẻ. Chủ nhà mở danh sách có thể xem chỉ số đề xuất và lượng dùng dự kiến từ đầu kỳ đã xác minh. Hệ thống chỉ ghi nhớ bố cục sau khi chủ nhà đối chiếu ảnh và duyệt. Chỉ số chính thức, hóa đơn và quyền người thuê giữ nguyên quy trình xác minh.

## Thay đổi

- Điện dùng lại PaddleOCR hiện có. Khi chữ `kWh` dính vào hàng số, ảnh gốc giúp định vị lại đầy đủ hàng; hai vùng OCR phải chép cùng chuỗi. Kiểm tra hai đầu hàng và từ chối khi dấu chấm, màu đỏ hoặc cấu hình đã lưu mâu thuẫn.
- Nước dùng lại YOLO + VisionState. Định vị toàn cảnh/cận cảnh, ánh xạ về ảnh gốc, kiểm đủ các box riêng biệt và lưới gần cách đều. Không lấy nhãn chữ số YOLO làm đáp án, không dựng box bị thiếu. Hai hướng đọc vẫn được kiểm tra; đề xuất bố cục từ ảnh cần hai vùng đọc cùng toàn chuỗi và giữ bằng chứng `waterEvidence`.
- Khi chưa có cấu hình, cần nhóm ô đỏ liên tiếp ở cuối hoặc hai quan sát dấu chấm thập phân rõ. Hàng không có màu đỏ/dấu chấm không tự được coi là số nguyên.
- Lượng dùng dự kiến theo phần nguyên đang dùng để ghi sổ. Thiếu đầu kỳ đã xác minh/biên bản nhận phòng thì báo thiếu dữ liệu, không lấy số 0 mặc định. Chỉ số đề xuất giảm thì không hiển thị lượng dùng âm.
- Đề xuất nền giữ tối đa 31 ngày; ảnh, phiên bản, baseline, hợp đồng, model và cấu hình vẫn được kiểm tra khi mở/duyệt. Ghi nhớ bố cục cùng giao dịch duyệt; lỗi hoàn tác cả chỉ số, profile và trạng thái dùng đề xuất.
- Giao diện thiết lập chỉ là dự phòng. Danh sách phân trang 30 bộ ảnh, lấy kết quả tối đa ba yêu cầu đồng thời. Dùng đề xuất điền sẵn ghi chú có thể sửa; xác nhận ảnh/phần lẻ và lưu vẫn chủ động.

## Kiểm chứng

| Kiểm tra | Kết quả |
| --- | --- |
| Toàn bộ Node: `node scripts/run-project.mjs --test tests/*.test.mjs` | 207/207 đạt, gồm bridge/model thật và bốn góc xoay nước với cấu hình đã xác nhận |
| Python layout/automatic/Paddle | 25/25 đạt; kiểm thiếu ô, nhóm màu chưa rõ, dấu chấm mâu thuẫn và hai đầu hàng |
| DOM: `npm run check:ai-ui` | 46 ca đạt, gồm đề xuất không cấu hình, lượng dùng, phân trang, hết hạn dài và quyền người thuê |
| TypeScript và Vite: `npm run build` | Đạt; Vite vẫn cảnh báo kích thước chunk lớn |
| HTTP CPU thật: `npm run ai:meter-zero-setup-check -- docs/test/METER-ZERO-SETUP-LIVE-20261105.json` | Đạt, SQLite RAM, không có profile, hoàn tất job trước lần chủ nhà mở kết quả |
| Hồi quy cấu hình đã có: `npm run ai:meter-split-check -- docs/test/METER-UTILITY-SPLIT-ZERO-SETUP-20261105.json` | Đạt; điện rõ tự động và chọn vùng, nước tự động, kiểm quyền và duyệt; hash nguồn ổn định trong lượt chạy |

[Báo cáo HTTP và hash ảnh](../METER-ZERO-SETUP-LIVE-20261105.json):

| Mẫu | Tự động không cấu hình |
| --- | --- |
| Điện rõ | `ready`: `00766.4 kWh` |
| Nước xanh | `ready`: `00001.056 m³`, giữ đủ số 0 đầu |
| Điện 26762, ảnh chụp màn hình điện | `needs_review`, không đoán ô mờ |
| Nước cũ | `needs_review` |
| Điện tổng hợp chưa đánh dấu phần lẻ | `needs_review`, không đoán dấu thập phân |
| Ảnh trống điện/nước | `needs_review` |

Ảnh thật ở đây là các mẫu phát triển được tái sử dụng với nhãn tham chiếu của tác nhân, chưa được chủ nhà xác minh và không phải benchmark độc lập. Thời gian riêng hai mẫu rõ trong lượt HTTP khoảng 4,9 giây nước và 7,7 giây điện; không đại diện độ trễ khi nhiều phòng đang xếp hàng. Các ngưỡng màu/hình học cần đánh giá thêm trên nhiều kiểu công tơ, góc chụp và ánh sáng. Không công bố tỷ lệ chính xác chung.

Đã kiểm chứng giao diện bằng DOM và TypeScript; chưa kiểm tra trực quan trong trình duyệt. Browser host không khả dụng và Computer Use dừng vì không xác minh được URL hiện tại. Không dùng cơ chế khác để vượt chặn. Runtime/model hiện có được tái sử dụng, không tải hoặc huấn luyện lại; kiểm tra chỉ dùng SQLite RAM, không mở database nghiệp vụ.
