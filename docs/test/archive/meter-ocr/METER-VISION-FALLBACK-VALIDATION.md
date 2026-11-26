# Vision đọc dự phòng — kiểm chứng 30/10/2026

Luồng mặc định tiếp tục dùng mode `ocr-vision-assisted`. OCR có đề xuất hợp lệ được giữ nguyên; Vision chỉ đọc chữ số khi OCR cần hỗ trợ. Bổ sung một ô được ưu tiên nếu có placeholder định vị rõ; khi vẫn chưa có đề xuất, Vision được phép đọc lại toàn hàng trong khung OCR đã audit. Người thuê chỉ chụp/chọn và gửi ảnh, chủ nhà xem một chỉ số đề xuất rồi xác minh ảnh/phần lẻ.

## Nguyên nhân và thay đổi

Ảnh người dùng `electric-26762.jpg` có khung 141×44 px. Trước đây ngưỡng OCR cạnh dài 180 px và yêu cầu chỉ đọc một gap rõ khiến Vision mới audit khung, chưa đọc chữ số. OCR thô `26762回` ở 0°/90° (89/94 điểm) và `222` ở270° (41 điểm) là các lượt đọc khác nhau; không phải hai đề xuất. UI hiện gộp văn bản giống nhau, ghi góc/lượt/điểm và giải thích quan sát điểm thấp; không xóa ký tự hoặc nối dòng để tạo số.

Các yêu cầu Vision vừa đọc vừa trả tọa độ từng ô đã tạo hình học không hợp lệ. Sau đó schema tám trường còn tạo metadata mâu thuẫn dù chữ số có vẻ đúng. Những báo cáo chẩn đoán thất bại được giữ nguyên, không đổi thành bằng chứng đạt. Transport cuối chỉ yêu cầu `integerDigits`, `fractionalDigits`, `uncertainDigits`: lượt đầu toàn cảnh + crop, lượt sau crop, không chia sẻ đáp án hoặc nhận số OCR/profile/lịch sử. Hai nhóm phải trùng hoàn toàn và không có ô chưa rõ. Metadata chưa quan sát giữ `unknown`; cần profile công tơ chủ nhà đã xác nhận đúng số ô/ranh giới để tạo đề xuất.

Chất lượng gốc vẫn kiểm tra ánh sáng, tương phản, nét, lóa; crop nhỏ có thể thử khi ít nhất64×16px. Nhánh đề xuất đọc lặp cần rộng trung bình ít nhất12px/chữ số, cao24px. Đây là sàng lọc mật độ cả hàng, không phải đo riêng từng ô. Phóng ảnh không tạo thêm pixel gốc. Hai lượt cùng model chỉ kiểm tra ổn định, có thể sai giống nhau. Nếu lượt đọc một ô đã báo đang chuyển/bị che, kết quả cả hàng không được phủ nhận bằng chứng đó. Mọi bước Vision chia sẻ ngân sách mặc định90giây.

## Kiểm thử tự động

Mã cuối được kiểm tra qua Node, DOM tương tác, render vai trò/cơ sở và TypeScript/Vite. **443 kiểm thử Node đạt**, không lỗi/bỏ qua; **159 kiểm tra tương tác UI**, **132 lượt render**, TypeScript và Vite build đều đạt sau mã cuối. Các hồi quy mới bao gồm nhóm chữ số không trùng, dấu hỏi, ô chuyển số/bị che, metadata thiếu, cấu hình không khớp, nguồn ảnh/chất lượng giả, ngân sách đã hết, native density/rotation, giữ OCR đầy đủ, tenant privacy, profile/baseline/CAS và xác minh bắt buộc. Dữ liệu giả lập có kiểm soát dùng để kiểm tra quyết định, không để công bố độ chính xác model.

UI được kiểm tra bằng DOM cô lập và SSR; chưa kiểm thử camera/điện thoại bằng trình duyệt thật. Build có cảnh báo chunk lớn hiện hữu, không có lỗi biên dịch.

## HTTP với model thật và DB RAM

Các báo cáo cuối đều dùng PaddleOCR PP-OCRv6small và Ollama `qwen3-vl:4b-instruct` đã cài, không tải hoặc huấn luyện model. Profile5+1 và5+3 được thiết lập bằng tay trong DB RAM để kiểm tra luồng; không coi là xác thực hồ sơ công tơ ngoài thực địa. Không dùng đáp án kỳ vọng làm prompt. Ảnh được đọc từ dataset dự án, không sửa ảnh gốc hay SQLite nghiệp vụ thật.

| Báo cáo | Kết quả và giới hạn |
| --- | --- |
| [Điện rõ](METER-VISION-FALLBACK-SIMPLE-ELECTRIC-20261030.json) | OCR thiếu ô đỏ; audit giữ khung222×46. Hai lượt Vision chép `00766` + `4`, đề xuất duy nhất `00766.4 kWh` nguồnVision. Chủ nhà xác minh766 trong RAM bằng cờ ảnh/phần lẻ, nguồn `vision-and-human`; kỳ chưa chốt và hóa đơn không đổi. |
| [Ảnh26762](METER-VISION-FALLBACK-SIMPLE-26762-20261030.json) | Audit giữ khung141×44. Hai lượt chép `26762` + `9`, đề xuất `26762.9 kWh` theo profile5+1. **Chưa có nhãn chuẩn độc lập hoặc xác minh người dùng cho ô đỏ**; không kết luận model đọc đúng chỉ từ hai lượt trùng nhau, không xác minh giá trị này trong DB RAM. |
| [Nước xanh](METER-VISION-FALLBACK-SIMPLE-WATER-20261030.json) | Hai audit gồm tìm lại khung; hai lượt Vision chia nhóm khác nhau (`00001`+`056` và `000010`+`56`). Chưa đề xuất, không tự dùng profile để đổi ranh giới hoặc bỏ/đệm số. |
| [Ảnh làm mờ](METER-VISION-FALLBACK-SIMPLE-BLUR-20261030.json) | Kiểm tra kỹ thuật từ chối trước gửi; không bộ gửi/nền/AI, không chỉ số/hóa đơn. |

`passed:true` xác nhận hợp đồng/quyền/luồng nghiệp vụ trong phép thử, không phải nhãn đúng cho mọi chữ số. Tenant không nhận phân tích qua receipt/list/bootstrap/export; thông báo nhận dạng chỉ chủ nhà. Việc gửi và nhận dạng không đổi readings/invoices; chỉ bước owner review có chủ đích trong RAM mới ghi giá trị thử.

Bốn JSON cuối lưu **25 SHA-256 nguồn mỗi báo cáo; 100 hash đã được đối chiếu và khớp mã cuối**. Các JSON không có `SIMPLE` trong tên là chẩn đoán trước schema cuối, giữ để tra cứu lịch sử.

## Sử dụng và dọn tạm

Trong D:\Trozy, chạy `npm run dev`, tải lại web. Chủ nhà mở **Thiết lập công tơ**, xác nhận đúng loại/đơn vị/số ô trên ảnh thật, rồi mở ảnh pending và chọn **Đọc lại ảnh**. Snapshot cũ không tự thay đổi. Người thuê vẫn chỉ ảnh/trạng thái; chủ nhà luôn đối chiếu ảnh gốc, phần lẻ và lý do khi nhập tay. Không tự reanalyze/xác minh dữ liệu thật trong lượt triển khai này.

Launcher tạo tmp riêng trong dự án và tự dọn sau từng tác vụ; không cài dependency/model vào C. Giữ những thư mục cũ không chứng minh được nguồn. Không xóa ảnh, dữ liệu, model, giấy phép, báo cáo hoặc source. Trạng thái dọn cuối và lệnh tiếp tục được lưu trong CODEX_PROGRESS.md.
