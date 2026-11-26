# Một chỉ số đề xuất từ OCR và Vision — kiểm chứng 30/10/2026

Luồng mặc định hiện dùng `recognizeMeterReconciled`, chế độ `ocr-vision-reconciled`. OCR tự tìm khung và đọc; Vision kiểm tra khung, sau đó đọc độc lập cả chuỗi và từng ô trên chính vùng đã chấp nhận. Vision không nhận số OCR, cấu hình số ô hoặc chỉ số kỳ trước. Chủ nhà thấy tối đa một chỉ số đề xuất; bằng chứng và lịch sử kỹ thuật nằm trong phần chi tiết. Kết quả chưa đủ bằng chứng chỉ hiển thị trạng thái cần kiểm tra hoặc chụp lại.

## Quy tắc đã triển khai và kiểm thử

- Hai bên khớp toàn bộ: giữ số OCR. Nếu chỉ khác đúng một chữ số ở hàng đơn vị của phần nguyên, các vị trí còn lại kể cả phần lẻ phải khớp; vẫn giữ số OCR. Đây là quy tắc theo vị trí, không phải ngưỡng chênh lệch tuyệt đối 1. Khác hàng chục, phần lẻ, số ô hoặc ranh giới thập phân không được chấp nhận theo nhánh này.
- Chỉ bổ sung đúng một ô OCR có ký tự chưa đọc rõ tại vị trí xác định, được giữ giống nhau trong lượt toàn vùng và crop xác nhận. Các ô còn lại phải khớp Vision; Vision phải đọc rõ toàn bộ từng ô, có hình học, đơn vị và ranh giới phần lẻ hợp lệ. Không bổ sung chữ số bị OCR bỏ mất, không đoán vị trí từ độ dài, không lấy toàn bộ chuỗi Vision thay cho OCR.
- Nếu Vision cũng quan sát ô đang chuyển vòng, bị che hoặc chưa rõ thì không tạo đề xuất. Không chọn một chữ số từ hai phần bánh số đang xoay. Nguồn bổ sung được giữ trong `resolution` và khi chủ nhà xác minh được ghi `ocr-vision-and-human`.
- Khung OCR đúng không đổi. Chỉ sau khung bị bác bỏ mới gợi ý vùng để OCR tự tìm lại một lần. Chất lượng phải đạt tại vùng bộ đếm gốc; phóng ảnh không làm tăng độ phân giải nguồn. Chủ nhà vẫn xác nhận ảnh và phần lẻ trước lưu; không tự ghi chỉ số, chốt kỳ hoặc tạo hóa đơn.

## Kết quả tự động

| Kiểm tra | Kết quả | Phạm vi |
| --- | --- | --- |
| `npm test` | **358 kiểm thử Node đạt**, không lỗi hoặc bỏ qua | Quy tắc khớp/chỉ khác hàng đơn vị/bổ sung một ô; validator tính lại nguồn và chữ số; quyền, profile/baseline/CAS; xử lý nền và snapshot lịch sử; HTTP có OCR Tesseract thật. Các ca quyết định tạo đề xuất dùng bằng chứng kiểm thử có kiểm soát. |
| `npm run check:ai-ui` | **97 kiểm tra tương tác đạt** | DOM cô lập: một đề xuất, thông tin kỹ thuật thu gọn, trạng thái chưa có kết quả, xác nhận chủ nhà, lý do chụp lại và không lộ dữ liệu cho người thuê. |
| `npm run check:pages` | **132 lượt render đạt** | Trang theo vai trò/cơ sở và dữ liệu thử. |
| `npm run build` | **TypeScript và build Vite đạt** | Có cảnh báo chunk lớn hiện hữu; không phải kiểm thử bố cục bằng trình duyệt thật. |

Đã bổ sung hồi quy cho lỗi bằng chứng OCR phần thiếu nằm ngoài khung đã được kiểm tra: geometry/quan sát OCR phải được ánh xạ từ tọa độ ảnh crop/xoay về đúng vùng nguồn đã chấp nhận. Không được dùng hai lượt văn bản giống nhau ở vùng khác để bổ sung ô. Validator cũng kiểm tra đơn vị, phần lẻ, trạng thái và thứ tự ô Vision, nguồn chữ số, profile và chỉ số nền trước khi cấp quyền dùng đề xuất.

## Model cục bộ thật qua HTTP

Bốn báo cáo dưới đây dùng DB RAM và model/runtime đã có trong dự án. Thời điểm JSON ghi UTC `29/10/2026 17:18–17:21` tương ứng **30/10/2026 00:18–00:21 giờ Việt Nam**. Tổng **104 hash nguồn** trong bốn JSON đã được đối chiếu với mã cuối; giữ nguyên các báo cáo lịch sử. `passed:true` xác nhận kiểm tra luồng, quyền và cách từ chối đúng điều kiện, không có nghĩa model đọc đúng chỉ số.

| Ca | Khung, số lần đọc Vision | Quan sát thực tế và quyết định |
| --- | --- | --- |
| [Điện mẫu](METER-RECONCILED-ELECTRIC-20261030.json) | OCR chọn `(134,260,222,46)`, Vision chấp nhận nguyên khung. Một audit, một đọc chuỗi, một kiểm tra ô. | OCR ổn định `00766kWh` nhưng thiếu ô đỏ so với cấu hình 5+1. Vision đọc chuỗi `00766.4`, song báo 5 ô thay vì 6 chữ số, chưa đủ bằng chứng từng ô. **Không đề xuất**, `needs_review`; không điền ô đỏ bằng chuỗi Vision chưa khớp hình học. |
| [Nước xanh](METER-RECONCILED-WATER-20261030.json) | Lượt đầu chưa có khung OCR duy nhất; Vision bác và gợi ý search `(240,426,874,291)`. OCR tự tìm `(248,441,866,276)`, Vision chấp nhận. Hai audit, một đọc chuỗi, một kiểm tra ô. | OCR chọn văn bản `000010:56m³`, chưa có register hợp lệ. Vision đọc `00001.056`, đủ 8 ô nhưng trả `decimalEvidence:none`, `fractionalScale:unknown`, không chứng minh được ranh giới phần lẻ. **Không đề xuất**, `needs_review`; không bỏ dấu câu để ép OCR khớp Vision. |
| [Ảnh người dùng có `26762回`](METER-RECONCILED-26762-20261030.json) | Ảnh nguồn **453 × 676 px**. OCR chọn `(209,237,141,44)`; một audit Vision chấp nhận khung. **Không gọi đọc chuỗi hoặc từng ô bằng Vision.** | Vùng số rộng **141 px**, dưới ngưỡng cạnh dài 180 px. Dù khung đúng vị trí, chất lượng vùng số là `retake`; **không đề xuất**, cần chụp gần hơn. Chưa thử bổ sung ô cuối từ Vision ở ảnh này vì không vượt qua kiểm tra chất lượng. |
| [Ảnh tổng hợp làm mờ](METER-RECONCILED-BLUR-20261030.json) | Fixture làm mờ mức 10 bị chặn trước gửi ảnh/xử lý nền. Không OCR hoặc Vision. | `retake` vì thiếu nét; không có bộ gửi, thông báo đọc ảnh hoặc chỉ số được tạo. |

Cả ba ảnh thật có `modelCallsBeforeSend:0` và mỗi bộ gửi chạy một tác vụ nền. Kết quả, ghi chú nhận dạng và thông báo kiểm tra chỉ dành cho chủ nhà; người thuê chỉ nhận ảnh/trạng thái. Báo cáo không thực hiện bước review vì không có đề xuất hợp lệ. Chỉ số và hóa đơn không đổi; **không sửa dữ liệu nghiệp vụ thật**.

## Giới hạn còn lại

**Chưa có ảnh thật nào trong bốn báo cáo này tạo được đề xuất hợp nhất đủ điều kiện.** Các nhánh khớp toàn bộ, khác hàng đơn vị và bổ sung một ô đã đạt kiểm thử có kiểm soát; đây chưa phải minh chứng model thật làm đúng các nhánh đó. Chưa có tập đánh giá độc lập, tỉ lệ chính xác được đo hoặc xác suất đúng đã hiệu chuẩn; điểm văn bản OCR và đọc lặp lại không phải xác suất chỉ số đúng.

Chưa kiểm thử camera/trình duyệt điện thoại thật hoặc xác minh hình thức bố cục bằng mắt trong lượt này. Không tải/huấn luyện model mới, không nới ngưỡng chất lượng để tạo kết quả. Các phân tích đã lưu vẫn là snapshot của chế độ cũ; chủ nhà cần chủ động đọc lại ảnh để tạo kết quả bằng luồng hiện tại.

Chạy tại `D:\Trozy` bằng `npm run dev`. Tiến độ và cách tiếp tục nếu phiên bị ngắt được ghi trong `CODEX_PROGRESS.md`.

Sau kiểm chứng đã dừng đúng runtime Ollama do lượt này mở. Các launcher tự dọn thư mục tạm riêng; thư mục worker và Vite tạm trống. Giữ nguyên những thư mục Node/log dev chưa xác định là tệp của lượt này. Dữ liệu mẫu, model và báo cáo cần thiết vẫn ở trong dự án.
