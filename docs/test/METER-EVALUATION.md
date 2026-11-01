# Kế hoạch đánh giá Vision + OCR công tơ

Đây là kế hoạch đánh giá, chưa phải kết quả đo độ chính xác. Hiện có fixture tổng hợp để kiểm thử kỹ thuật và một ảnh đồng hồ nước thực tế do người dùng cung cấp đang được dùng để điều chỉnh prompt và kiểm tra hồi quy. Ảnh đó không phải mẫu held-out độc lập; kết quả của nó không chứng minh chất lượng trên ảnh mới. Cần tập ảnh/thiết bị mới trước khi công bố tỷ lệ đọc đúng hoặc khả năng hỗ trợ các loại đồng hồ.

## Dữ liệu và đáp án đối chiếu

Mỗi ảnh cần có mã ảnh, mã **thiết bị vật lý**, loại điện/nước, kiểu mặt số, điều kiện chụp và đáp án do người kiểm tra đọc độc lập. Đáp án gồm đơn vị nhìn thấy, toàn bộ dãy hiển thị, chuỗi phần nguyên, chuỗi phần thập phân, bằng chứng vị trí thập phân và việc ảnh có thực sự đọc được hay không. Giữ số 0 đầu; không lấy chỉ số kỳ trước hoặc mức tiêu thụ dự kiến để đoán đáp án. Ảnh không rõ phải được ghi là không đủ bằng chứng, không ép gán một con số.

Ví dụ một dòng manifest JSON, chỉ minh họa cấu trúc:

```json
{"imageId":"water-017-a","deviceId":"water-017","split":"heldout","path":"D:/TrozyMeterEval/heldout/water-017-a.jpg","utility":"water","meterType":"mechanical","conditions":["clear","slight_skew"],"readable":true,"unit":"m3","displayText":"01234.789","integerDigits":"01234","fractionalDigits":"789","decimalEvidence":"red_digits","expectedFormValue":1234}
```

`expectedFormValue` phản ánh quy ước form hiện chỉ ghi đơn vị nguyên, sau khi đã xác nhận cách đọc trên thiết bị. Nó không thay thế đáp án dãy đầy đủ. Cần người thứ hai kiểm tra ảnh khó hoặc đáp án bất đồng. Giữ ảnh ngoài repo; chỉ đưa ảnh vào Git khi có quyền sử dụng/phân phối phù hợp. Manifest và bằng chứng đánh giá không cần chứa ảnh base64.

Tách tập điều chỉnh prompt/tham số và tập kiểm tra cuối theo **thiết bị vật lý**: các lần chụp cùng một đồng hồ phải thuộc cùng tập. Nếu sau này huấn luyện/fine-tune, cũng giữ nguyên nguyên tắc này giữa train/validation/test. Khóa prompt, model, phiên bản runtime và quy tắc trước khi chạy tập held-out; không sửa theo từng đáp án trong tập này.

## Các nhóm cần phủ

| Nhóm | Trường hợp kiểm tra |
| --- | --- |
| Đồng hồ nước bộ số cơ | Số 0 đầu, nhóm đen/đỏ, vị trí thập phân rõ hoặc chưa rõ, có kim kiểm tra nhỏ bên cạnh bộ số. |
| Đồng hồ điện bộ số cơ | Bộ số chính so với số sê-ri/thông số; cách chia phần lẻ khác nhau. |
| Màn hình LCD/LED | Điện và nước, dấu chấm/phẩy, nhiều thanh ghi/màn hình, số hoặc ký hiệu không đầy đủ. |
| Mặt số chính chỉ có kim | Hiện thuộc nhóm kiểm tra thủ công; đánh giá hệ thống có từ chối suy đoán chỉ số hay không. |
| Điều kiện khó và ảnh âm tính | Lóa, tối, nghiêng, mờ, che khuất, bánh số đang chuyển, ảnh sai loại đồng hồ, chỉ có nhãn/sê-ri, nhiều thiết bị hoặc nhiều dãy số hợp lý. |

Chạy mỗi nhóm với toàn ảnh và vùng chọn hợp lệ; thử thêm vùng chọn bỏ mất đơn vị/phần số. Ghi nhận riêng các trường hợp chỉ số đọc được thấp hơn kỳ trước: bằng chứng vẫn phải hiện, nhưng không được đề xuất để tạo mức tiêu thụ âm.

## Chỉ số báo cáo

- **Đọc đúng toàn bộ dãy:** số ảnh khớp toàn bộ phần nguyên, phần lẻ và đơn vị / số ảnh có đáp án đọc được. Chuẩn hóa dấu chấm/phẩy theo quy ước đã khóa, giữ số lượng chữ số và số 0 đầu; đúng riêng phần nguyên chưa tính là đúng cả dãy.
- **Coverage và từ chối:** tỷ lệ trả kết quả đọc được, tỷ lệ có `suggestedValue` và tỷ lệ yêu cầu kiểm tra/không đọc được. Báo riêng trên ảnh đọc được và ảnh không đủ bằng chứng, để việc từ chối nhiều không che lỗi nhận dạng.
- **Đề xuất sai trong số đề xuất:** số `suggestedValue` sai / tổng lượt có `suggestedValue` khác `null`. Đây là đề xuất của hệ thống trước xác nhận người dùng, không phải hóa đơn được tự động chấp nhận. Báo riêng kết quả Vision, OCR và kết hợp.
- **Lỗi đơn vị/thập phân:** đếm nhầm đơn vị, nhầm vị trí dấu thập phân, mất/ghép phần số đỏ và trường hợp phần nguyên đúng nhưng phần lẻ sai. Báo thêm số lượt hai bộ đọc bất đồng và số lượt chỉ khớp phần nguyên.

Luôn công bố số mẫu, số thiết bị và kết quả từng nhóm kèm tổng; ghi model/tag, phiên bản Ollama, chế độ crop, thời gian xử lý và lỗi/quá hạn. Chỉ đặt ngưỡng nghiệm thu sau khi thống nhất mục tiêu với nhóm, rồi giữ ngưỡng đó khi chạy tập held-out.

## Chạy kiểm tra cục bộ

Sau khi model Vision sẵn sàng, kiểm tra một ảnh đọc được qua HTTP/API, dùng database trong bộ nhớ:

```powershell
npm run ai:vision-check -- --file 'D:\TrozyMeterEval\heldout\water-017-a.jpg' --utility water --expected-display 01234.789 --expected-value 1234 --evidence 'docs/test/water-017-a-evidence.json'
```

CLI đối chiếu cả dãy Vision và giá trị đề xuất, đồng thời kiểm tra yêu cầu xác nhận, lịch sử và việc nhận dạng không sửa dữ liệu nghiệp vụ. Có thể thêm `--rectangle left,top,width,height` theo pixel ảnh gốc. Đây là kiểm tra một ca đọc thành công, chưa phải bộ chấm điểm hàng loạt; assertion thất bại phải được ghi nhận trong đánh giá, không bỏ khỏi mẫu số. Các ca cần từ chối/mâu thuẫn phải kiểm tra qua UI/API và ghi trạng thái, ứng viên, cảnh báo, giá trị đề xuất `null` cùng bằng chứng tương ứng.
