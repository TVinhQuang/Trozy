# Thử luồng OCR chuyên công tơ

Ngày: 28/10/2026. Luồng mới chỉ dùng OCR cục bộ; không gọi Vision để tạo kết quả công tơ. Đây là kiểm tra tích hợp/hồi quy trên ảnh đã biết, không phải số đo độ chính xác chung.

## Thay đổi

- Chủ nhà có cấu hình riêng theo phòng/công tơ: mặt số, đơn vị, số ô nguyên/phần lẻ và phiên bản. Server cấp cấu hình cho OCR, không nhận profile do người thuê tự truyền.
- Một chỉ số đề xuất khi đúng vùng, đủ chất lượng, chuỗi OCR ổn định và cách biểu diễn có bằng chứng/cấu hình phù hợp. Dữ liệu không đủ thì chưa đề xuất. Không sửa/đệm/bỏ chữ số theo profile hoặc lịch sử.
- Chủ nhà thấy một kết quả chờ xác minh; ảnh chưa rõ có trạng thái kiểm tra/chụp lại. Người thuê vẫn chỉ ảnh và trạng thái.
- B03 registry, API đọc trực tiếp và hàng đợi ảnh nền đều dùng OCR. Ollama cho trợ lý văn bản được giữ; mã Vision và snapshot cũ không bị xóa hoặc thay hash thành minh chứng mới.

## Thử ảnh thật qua HTTP

`scripts/check-meter-capture.mjs` dùng database SQLite trong RAM, gọi API như hai tài khoản thuê/chủ, kiểm tra quyền và thông báo. Script chặn lời gọi tới cổng Ollama; các báo cáo phải có `ollamaCalls:0`. Ảnh gốc được đọc từ đường dẫn người dùng cung cấp, không chép vào repo; ảnh mờ dẫn xuất chỉ trong RAM. Cấu hình thử là cấu hình nhập thủ công trong RAM để kiểm tra chức năng, chưa phải hồ sơ công tơ được xác nhận ngoài thực địa.

| Mẫu | Cấu hình thử | Kết quả kiểm tra |
| --- | --- | --- |
| Điện `images (5).jpg`, vùng 134,260,222,46 | 5 ô nguyên, 1 ô lẻ, kWh | OCR đề xuất `00766.4 kWh`; biểu mẫu ghi phần nguyên 766 sau chủ nhà xác minh. |
| Nước xanh, toàn cảnh | 5 ô nguyên, 3 ô lẻ, m³ | Chưa xác định vùng ổn định; dấu câu nhiễu không được tự bỏ để tạo số. Chưa đề xuất. |
| Điện khó, toàn cảnh | 5 ô nguyên, 1 ô lẻ, kWh | Vùng 131 × 33 px không đạt ngưỡng 180 px; chưa đề xuất. |
| Nước cũ xoay ngang | 4 ô nguyên, 1 ô lẻ, m³ | Có chuỗi `13038` nhưng hướng khác đọc mâu thuẫn; chưa đề xuất. |
| Điện dẫn xuất mờ blur8 | 5 ô nguyên, 1 ô lẻ, kWh | Bị chặn trước gửi/nhận dạng, không có bộ gửi hoặc thông báo. |

Minh chứng: [điện](METER-OCR-SPECIALIZED-ELECTRIC-LIVE.json), [nước xanh](METER-OCR-SPECIALIZED-WATER-LIVE.json), [điện khó](METER-OCR-SPECIALIZED-HARD-LIVE.json), [nước cũ](METER-OCR-SPECIALIZED-WEATHERED-LIVE.json), [mờ](METER-OCR-SPECIALIZED-BLUR-LIVE.json). JSON chứa hash mã thực sự chạy; chỉ dùng các hash khớp mã cuối sau khi hoàn tất kiểm tra.

Chủ nhà luôn phải đối chiếu ảnh và xác nhận; ảnh khó chưa được giải quyết triệt để. Hệ thống hiện chưa có bộ phát hiện chuyển vòng từng ô đủ kiểm chứng; OCR có thể đọc ổn định một số sai. Không huấn luyện hoặc tải model mới trong thay đổi này. Điểm OCR không được quảng bá thành xác suất đúng.

## Chạy lại

```powershell
$env:TEMP='D:\TrozyOCRTrial\tmp'
$env:TMP=$env:TEMP
npm run ai:meter-capture-check -- --file 'E:\Downloads\images (5).jpg' --rectangle '134,260,222,46' --utility electric --profile 'mechanical,5,1'
```

Mọi cấu hình/ảnh/chỉ số của script đều chỉ nằm trong database RAM. Lượt điện còn kiểm tra chủ nhà xác minh phần nguyên 766, `verificationSource:ocr-and-human`, kỳ chưa chốt khi chỉ có điện và hóa đơn không đổi. Đã đối chiếu **80 hash nguồn** của năm báo cáo với mã cuối; tất cả khớp và không có lời gọi Ollama.

Kiểm tra cuối: **246 Node, 58 UI, 132 render, TypeScript/build đạt**. UI dùng DOM và media giả lập, chưa thử camera điện thoại thật. Bundle ExcelJS có cảnh báo kích thước như các mốc trước; build không lỗi. `CODEX_PROGRESS.md` ghi chi tiết và phạm vi dọn tệp tạm; giấy phép/model/ảnh gốc được giữ.
