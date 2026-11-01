# OCR đọc chỉ số, Vision bổ sung một ô — kiểm chứng 30/10/2026

> Mốc lịch sử trước khi thêm Vision đọc dự phòng. Xem [kiểm chứng hiện hành](METER-VISION-FALLBACK-VALIDATION.md) cho mã cuối.

Luồng mặc định dùng `recognizeMeterAssisted`, chế độ `ocr-vision-assisted`. Đã bỏ so sánh hai dãy OCR/Vision và dung sai hàng đơn vị. OCR vẫn tự tìm khung, Vision vẫn kiểm tra khung; OCR có đề xuất đủ bằng chứng thì giữ nguyên và không gọi Vision đọc chữ số. Chỉ khi bằng chứng OCR xác định trước đúng một ô chưa đọc, Vision mới nhận yêu cầu đọc riêng ô đó. Chủ nhà vẫn xem ảnh/phần lẻ và xác minh trước khi lưu.

## Kiểm thử tự động

| Kiểm tra | Kết quả | Phạm vi |
| --- | --- | --- |
| `npm test` | **407 kiểm thử Node đạt**, không lỗi hoặc bỏ qua | OCR đủ số không gọi đọc chữ số Vision; xác định một ô thiếu từ OCR; gán duy nhất chữ số mục tiêu; hình học crop/xoay, đơn vị/phần lẻ, lỗi model, quyền, profile/baseline/CAS và snapshot lịch sử. HTTP dùng OCR Tesseract thật với model Vision giả lập có kiểm soát. |
| `npm run check:ai-ui` | **116 kiểm tra tương tác đạt** | DOM cô lập: một đề xuất hoặc trạng thái ngắn; không so sánh cả dãy trong chế độ mới; nguồn ô bổ sung trong chi tiết; chủ nhà xác nhận ảnh/phần lẻ; người thuê chỉ ảnh/trạng thái. |
| `npm run check:pages` | **132 lượt render đạt** | Trang theo vai trò/cơ sở với dữ liệu thử. |
| `npm run build` | **TypeScript và Vite build đạt** | Có cảnh báo chunk lớn hiện hữu; chưa kiểm chứng bố cục bằng trình duyệt thật trong lượt này. |

Các ca tạo đề xuất dùng bằng chứng kiểm thử có kiểm soát: OCR đầy đủ trả trực tiếp dù không có dãy Vision; một placeholder giữ đúng vị trí trong lượt toàn hàng và crop được gán một chữ số mục tiêu, các ô OCR khác giữ nguyên. Chuỗi bị rơi ký tự, nhiều ô thiếu, quan sát mâu thuẫn, sai hình học/đơn vị/phần lẻ, bánh số thật đang chuyển hoặc Vision chưa rõ đều không được tự gán. Không dùng lịch sử để sửa chữ số.

## HTTP với model cục bộ thật

Bốn báo cáo dùng ảnh có sẵn, PaddleOCR và Vision cục bộ trong DB RAM. Không gọi model trước khi người thuê gửi ảnh; mỗi bộ gửi tạo một tác vụ nền và thông báo riêng chủ nhà. Chỉ số, hóa đơn và dữ liệu nghiệp vụ thật không đổi. Kết quả ghi UTC `29/10/2026 19:07–19:09` tương ứng **30/10/2026 02:07–02:09 giờ Việt Nam**.

| Ca | Model và khung | Kết quả |
| --- | --- | --- |
| [Điện mẫu](METER-ASSISTED-ELECTRIC-20261030.json) | OCR tìm `(134,260,222,46)`, Vision chấp nhận nguyên khung: một audit, **không đọc cả dãy hoặc ô chữ số Vision**. | OCR ổn định `00766`, thiếu ô đỏ so với profile 5+1 nhưng không giữ được placeholder xác định vị trí thiếu trong bằng chứng OCR. Không suy ô thiếu từ độ dài hoặc hỏi Vision cả dãy. **Chưa đề xuất**, `needs_review`. |
| [Nước xanh](METER-ASSISTED-WATER-20261030.json) | Đầu tiên chưa có khung OCR duy nhất; Vision bác và gợi ý vùng `(240,426,874,291)`. OCR tự chọn `(248,441,866,276)` và Vision chấp nhận. Hai audit, **không gọi đọc chữ số Vision**. | Văn bản OCR `000010:56m³` chưa là dãy có một ô thiếu định vị rõ và quy ước phần lẻ hợp lệ. Không xóa dấu câu để tạo đáp án. **Chưa đề xuất**, `needs_review`. |
| [Ảnh người dùng có `26762回`](METER-ASSISTED-26762-20261030.json) | Ảnh nguồn 453 × 676 px; vùng OCR `(209,237,141,44)` được Vision chấp nhận. Một audit, **không đọc chữ số Vision**. | Vùng số rộng 141 px, dưới ngưỡng cạnh dài 180 px. Chất lượng vùng số `retake`; **không đề xuất**, cần chụp gần hơn. |
| [Ảnh tổng hợp làm mờ](METER-ASSISTED-BLUR-20261030.json) | Làm mờ fixture mức 10, chặn trước gửi/xử lý nền; không OCR hoặc Vision. | `retake`, không bộ gửi, thông báo nhận dạng hoặc chỉ số được tạo. |

`passed:true` ở báo cáo HTTP xác nhận luồng/quyền/quy tắc từ chối, không có nghĩa model đọc đúng số. Trong các ảnh thật ở đây, chưa có ô OCR thiếu đủ điều kiện để đi đến yêu cầu bổ sung; **chưa có đề xuất hợp lệ hoặc bổ sung ô thành công ở toàn luồng ảnh thật**.

## Gọi riêng tác vụ đọc một ô bằng model thật

[METER-ASSISTED-SLOT-SMOKE-20261030.json](METER-ASSISTED-SLOT-SMOKE-20261030.json) gọi một yêu cầu Vision trên ảnh điện mẫu, chỉ định thủ công index 5 để kiểm tra giao thức đọc riêng một ô. Đây không phải ô tự phát hiện bởi OCR, không phải kiểm thử bổ sung thành công toàn luồng và không có nhãn chuẩn độc lập.

Model trả chữ số mục tiêu `4`, nhưng đồng thời báo 7 ô, tách 6+1 và `decimalEvidence:none` mâu thuẫn với phần lẻ. Validator từ chối phản hồi với lỗi 502; không gán chữ số, không mở database nghiệp vụ và không đọc cả dãy để so sánh. Một chữ số nhìn hợp lý không đủ bù cho bằng chứng hình học/quy ước không nhất quán.

Bốn JSON HTTP lưu 24 hash nguồn mỗi báo cáo, smoke lưu 2 hash: tổng **98 hash đã khớp mã cuối**. Báo cáo lịch sử giữ nguyên, không sửa hash để nhận là phép kiểm chứng của chế độ hiện tại.

## Giới hạn và sử dụng

Chưa đo độ chính xác chung hoặc xác suất đúng đã hiệu chuẩn. Một chữ số Vision được model báo rõ vẫn có thể sai; chủ nhà phải đối chiếu ảnh gốc trước lưu. Không tải/huấn luyện model mới hoặc nới ngưỡng chất lượng trong lượt này. UI được kiểm tra bằng DOM và render cô lập, chưa thử camera/điện thoại/trình duyệt thật.

Chạy tại `D:\Trozy` bằng `npm run dev`. Ảnh mới gửi tự xử lý ngầm; ảnh đã lưu giữ snapshot cũ cho tới khi chủ nhà chọn **Đọc lại ảnh bằng OCR**. Xem [thiết kế hiện tại](../analysis%20and%20design/METER-OCR-VISION-ASSISTED.md) và `CODEX_PROGRESS.md` để biết trạng thái cuối, dọn tạm và cách tiếp tục nếu phiên bị ngắt.
