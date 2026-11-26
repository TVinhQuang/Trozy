# Chẩn đoán ảnh có nhiều dãy số — 28/10/2026

Đây là mốc trước triển khai. Bản cải tiến và minh chứng hiện tại ở [METER-REGIONS-IMPROVEMENT.md](METER-REGIONS-IMPROVEMENT.md); nội dung chẩn đoán bên dưới được giữ để đối chiếu nguyên nhân ban đầu.

Đã chạy PaddleOCR và bước định dạng OCR hiện tại trên sáu ảnh người dùng cung cấp, giữ ảnh gốc nguyên trạng. Đây là kiểm tra chẩn đoán, không sửa provider, không gọi Vision, không mở database và không suy ra tỷ lệ chính xác chung. Văn bản, polygon, các lượt xoay/cắt và SHA-256 ảnh được giữ ở [METER-MULTINUMBER-DIAGNOSTIC.json](METER-MULTINUMBER-DIAGNOSTIC.json).

## Kết quả quan sát

| Ảnh | Bằng chứng OCR hiện tại | Giới hạn |
| --- | --- | --- |
| `images (5).jpg` | Hàng `00766kWh`, register `00766` chưa ổn định | Bỏ sót ô số đỏ; đơn vị đúng không chứng minh đã đọc đủ bộ đếm. |
| `images (4).jpg` | Hàng bộ đếm thành `26762回`; register ổn định lại là `2017` | Chọn nhầm năm sản xuất. Hai lượt đọc trùng không xác nhận vai trò của dãy số. |
| `images (3).jpg` | Register `09610` ổn định, nhãn đơn vị đọc thành `kWb` | Ảnh chỉ 196×257 px; chưa xác nhận đủ số/ô đỏ/đơn vị. Không coi chuỗi ổn định là chỉ số hoàn chỉnh. |
| `cach_xem_cac_loai_dong_ho_dien_4_ae698dd3b1.jpg` | Register `13621` ổn định, đơn vị `kWh` | Cần đối chiếu từng ô, nhất là ô chuyển tiếp/phần lẻ; không gán chuỗi này làm đáp án tham chiếu. |
| `images (2).jpg` | Chuỗi `100000158` chưa ổn định | Đọc sai/thừa ký tự vẫn có thể xảy ra trên đồng hồ nước. |
| `images (1).jpg` | Register `409971` ổn định ở góc 270°; hàng bộ đếm trên ảnh gốc đọc thành `0101917151` | Chọn nhầm dãy trên vành; hàng bộ đếm nghiêng khoảng 35° vượt ngưỡng hàng ngang ±30° hiện tại. |

Không có nhãn đúng toàn bộ các chỉ số được đưa cho engine. Các ví dụ `2017` và `409971` chỉ được phân loại vai trò sau nhận dạng bằng đối chiếu ảnh; không dùng chúng để điều hướng hoặc sửa OCR.

## Những điểm yếu trong code

- Worker chọn một vùng số đủ điều kiện có diện tích lớn nhất để đọc lại; bước chuẩn bị Vision cũng ưu tiên vùng hình học lớn nhất. Diện tích không xác nhận vùng là bộ đếm tích lũy.
- Bộ lọc có nhãn serial/spec tiếng Anh nhưng chưa bao quát đầy đủ `Số SX`, `Số sản xuất`, `Cấp`, năm sản xuất hoặc nhãn tiếng Việt bị OCR biến dạng/tách vùng.
- Ngưỡng hướng hàng số và regex chỉ nhận dạng văn bản làm mất một số hàng nghiêng, có ô đỏ khó đọc hoặc bị nhận nhầm ký tự. Dãy ngoài bộ đếm có thể trở thành ứng viên ổn định còn lại.
- Hai engine có thể cùng đọc đúng một dãy sê-ri nếu cùng nhìn crop chọn sai. So khớp chữ số cần đi sau kiểm tra vai trò/vị trí bộ đếm.
- Validator Vision hiện giới hạn `red_digits` với `m3`, chưa hỗ trợ đầy đủ điện cơ có ô đỏ và trọng số in `1/10`. Cần bằng chứng trọng số, không tự coi mọi ô đỏ là cùng quy ước.

## Hướng sửa đề nghị

1. Tách bước tìm/chọn **vùng bộ đếm** khỏi bước nhận chữ: xem cửa sổ bánh số/LCD, hàng ô số, đơn vị liên quan, nhãn thông số và bố cục xung quanh. Không cố định tọa độ hoặc vị trí giữa ảnh.
2. Giữ nhiều vùng ứng viên với vai trò `counter`, `serial`, `specification`, `inspection_label`, `unknown`. Vùng chưa rõ không trở thành bộ đếm chỉ vì đọc lặp lại hoặc có điểm cao. Các nhãn năm/sê-ri bị loại phải vẫn có trong bằng chứng thô.
3. Xác minh vùng và đọc số độc lập; Vision nhận toàn cảnh cùng crop và có quyền từ chối crop khi không phải bộ đếm. Khi có nhiều bộ đếm/không đủ bằng chứng, hiện các khung để người dùng chọn vùng thay vì chọn một số để áp dụng.
4. Đọc trọng số từng ô hoặc dấu phân cách, đơn vị tích lũy `kWh`/`m³`, phân biệt `vòng/kWh` và `m³/h`. Đối chiếu vai trò vùng, đủ chữ số, ranh giới phần lẻ và đơn vị trước khi tạo kết quả chính.
5. Giữ sáu ảnh này làm ca hồi quy, thêm ảnh chỉ có bảng thông số, sê-ri lớn hơn bộ đếm, nhiều màn hình và ô số chuyển tiếp. Đánh giá thêm thiết bị chưa dùng phát triển. Nếu quy tắc bố cục chưa đủ, cân nhắc bộ phát hiện vùng công tơ chuyên biệt sau khi có dữ liệu gán nhãn; chưa có bằng chứng bảo đảm đổi model sẽ tự giải quyết vấn đề.

Phép chẩn đoán này chưa triển khai các thay đổi đề nghị vào ứng dụng. Quy tắc đồng thuận hiện có vẫn giữ nguyên.
