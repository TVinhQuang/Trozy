# Quy trình đánh giá model OCR công tơ Trozy

Ngày đề xuất: 08/11/2026. Trạng thái: **đặc tả benchmark, chưa triển khai adapter mới hoặc chạy model mới**. Các ngưỡng dưới đây là mục tiêu đề xuất để thảo luận phát triển, chưa phải tiêu chuẩn đã nghiệm thu.

Xem [báo cáo lựa chọn](../METER-OCR-MODEL-ASSESSMENT-20261108.md) và [ma trận/mẫu JSON](assessment.json).

## 1. Câu hỏi mà phép thử phải trả lời

1. Model có đọc đúng nguyên chuỗi, giữ số 0 đầu và đúng vị trí phần lẻ không?
2. Khi sai hoặc ảnh thiếu bằng chứng, nó có biết trả về cần kiểm tra không?
3. Lợi ích đến từ tìm vùng, đọc crop, suy layout hay chỉ từ ngưỡng nhận kết quả?
4. Nó giúp được bao nhiêu ảnh mà baseline hiện từ chối, và làm hỏng bao nhiêu ảnh baseline đang đúng?
5. Có chạy ổn định trên Windows cục bộ với thời gian/tài nguyên chấp nhận được không?

Không truyền chỉ số kỳ trước hoặc nhãn chuẩn vào mô hình nhận dạng. Kiểm tra lượng dùng hợp lý chỉ làm cờ review sau nhận dạng; không dùng để sửa chữ số hoặc chọn dấu thập phân.

## 2. Tập dữ liệu và cách chia

**Khởi đầu khả thi:** khoảng 400 ảnh thật, cân bằng điện/nước; cố gắng có ít nhất 40 công tơ vật lý mỗi loại và nhiều thiết bị chụp/điều kiện sáng. Đây là quy mô sàng lọc ứng viên, chưa đủ để khẳng định sai dưới 1% ở từng nhóm. Ảnh tổng hợp chỉ bổ sung train hoặc kiểm tra kỹ thuật; báo cáo riêng.

- Gán `meter_group_id` theo công tơ vật lý, thêm nhóm cơ sở/kiểu máy nếu có. Chia train/val/test theo nhóm, ví dụ 60/20/20; không chia ngẫu nhiên từng ảnh của cùng một đồng hồ sang nhiều tập. Kiểm tra cả byte hash và ảnh gần trùng. Nếu số nhóm ít, dùng cross-validation theo nhóm trên development set và giữ một final test riêng.
- Khóa final test bằng manifest/hash. Mọi góc xoay, crop, tăng cường và các lần chụp của một nguồn cùng thuộc một nhóm. Bốn ảnh xoay từ một ảnh không phải bốn quan sát độc lập.
- Dùng val để chọn model, prompt, quantization, crop, threshold, decoder và checkpoint. Chỉ chạy bộ cấu hình đã khóa trên test. Ghi mọi lần truy cập test; nếu dùng kết quả test để chỉnh, chuyển nó thành development set và cần test mới.
- Không đưa các fixture phát triển đã dùng nhiều lần vào final test. Bộ dữ liệu public chỉ được dùng theo điều khoản thực tế; ghi nguồn/đồng ý sử dụng cho ảnh nghiệp vụ. Chưa tự xuất ảnh từ database trong bộ nghiên cứu này.
- Có tập âm: ảnh trắng, ảnh không phải đồng hồ, chỉ số sê-ri/tem, mất đầu/cuối hàng, nhiều công tơ trong khung, lóa/mờ không thể đọc, phần lẻ không xác định được. Không loại hết ảnh khó trước khi tính tỷ lệ trả lời.

Các slice có thể chồng nhau: điện/nước; kiểu máy mới/cũ; 0°/90°/180°/270°; có 0 đầu; đỏ phần lẻ/không đỏ; dấu chấm nhìn thấy; số ô khác nhau; bánh chuyển 9→0; bóng/lóa/bẩn/mờ; ảnh chụp lại màn hình; crop sát biên; LCD/LED/mặt kim ngoài phạm vi chính. Báo `n` của từng slice; không cộng các slice chồng nhau thành tổng ảnh.

## 3. Nhãn chuẩn

Nhãn chính phải được người có thẩm quyền đối chiếu ảnh. Với ca chuyển bánh/phần lẻ/khó, cần hai người đọc độc lập rồi phân xử. Người gán val/test không nhìn gợi ý AI. Không lấy đầu ra model làm ground truth.

Lưu tối thiểu:

| Trường | Ý nghĩa |
| --- | --- |
| `id`, `sha256`, `meter_group_id`, `split`, `source` | Danh tính ảnh, nhóm chống rò rỉ và nguồn hợp lệ |
| `utility`, `meter_type`, `unit` | Điện/nước, bánh cơ/LCD/mặt kim, kWh/m³ |
| `legibility` | `readable`, `unreadable`, `layout_ambiguous`, hoặc ngoài phạm vi |
| `digits` | Chuỗi đầy đủ dạng string, ví dụ `00001056`; không ép thành Number |
| `decimals` | Số bánh lẻ, ví dụ 3; `null` nếu ảnh và bố cục chưa đủ xác định |
| `display_text`, `integer_digits`, `fractional_digits` | Ví dụ `00001.056`, `00001`, `056` |
| `register_quad`, `digit_quads`, `orientation` | Vùng chuẩn cho bài đo crop/locator; không cấp cho bài toàn ảnh |
| `transition_flags`, `quality_tags`, `reviewers`, `adjudication` | Trạng thái chuyển bánh, ca khó và dấu vết duyệt nhãn |

Một pha quay của bánh không phải vị trí thập phân của toàn chỉ số. Nhãn phải ghi cách quy đổi/carry của kiểu công tơ; nếu người đọc cũng không thể quyết định thì nhãn là cần review, không ép một đáp án số.

## 4. Các bài thử bắt buộc

| Mã bài | Đầu vào được phép | Mục đích và lưu ý |
| --- | --- | --- |
| `crop_reader` | Cùng crop chuẩn đã rectification, cùng chiều; có thể cung cấp số ô nếu ghi rõ | Chấm chuỗi chữ số và CER, tách reader khỏi locator. Bản 10/100 lớp dùng các ô chuẩn; model chuỗi dùng cả hàng. Không bắt model suy đơn vị/phần lẻ vô hình trong crop; không tính đây là tự động toàn ảnh |
| `full_profiled` | Ảnh gốc + layout đã xác nhận, không có vùng chuẩn | So luồng thực tế đã có profile; giữ baseline cùng điều kiện |
| `full_zero_setup` | Ảnh gốc + loại điện/nước, không có số ô/phần lẻ/vùng chuẩn | So nhu cầu ảnh mới chưa cấu hình. Không bỏ ảnh thiếu layout khỏi mẫu số |
| `negative_rejection` | Ảnh âm/không đọc được/ngoài phạm vi | Đo việc tạo đề xuất sai khi đáng ra cần review |
| `runtime_and_queue` | Cùng chuỗi yêu cầu, ảnh và máy | Đo khởi tạo, nhận dạng, tác vụ HTTP và chờ hàng đợi riêng |

Baseline B0 là Paddle điện hiện tại; B1 là YOLO + VisionState nước hiện tại, ghi điều kiện `existing_production_checkpoint` vì chúng đã được fine-tune từ trước. Với từng ứng viên, thử zero-shot trước; nếu fine-tune thì có run riêng, dùng cùng nguồn train, ngân sách và tập chọn model. So với baseline sản xuất trả lời câu hỏi có nên thay; so các ứng viên zero-shot hoặc cùng ngân sách train trả lời câu hỏi kiến trúc nào phù hợp hơn. Nếu thay cả detector lẫn reader, cần run tách `baseline crop + new reader` và `new detector + baseline reader` khi giao diện tương thích, để biết thành phần nào giúp.

Với VLM: crop đơn, ảnh gốc, crop+ảnh gốc là ba cấu hình riêng. Khóa prompt, schema, cách xử lý `unreadable`, độ phân giải/pixel, max tokens, decoding, seed và quantization. Không chấm chỉ các ảnh baseline từ chối rồi so tỷ lệ với toàn tập baseline: vừa báo toàn tập chung, vừa báo slice baseline từ chối. Model đồng ý với nhau chưa phải nhãn đúng.

Thử raw checkpoint và bản ONNX/GGUF trên cùng một development subset để kiểm parity. Khác preprocessing hoặc decoder phải ghi thành cấu hình khác. Không dùng confidence do model tự viết thành văn bản như xác suất đã hiệu chuẩn.

## 5. Công thức đo và mẫu số

Gọi `R` là tập ảnh đọc được và có nhãn layout đầy đủ; `U` là tập ảnh cần từ chối theo nhãn. `N = |R| + |U|` trong phạm vi thử. Mọi lỗi, timeout và từ chối giữ trong mẫu số. Ngoài phạm vi được báo thành slice riêng và cần không sinh đề xuất đọc số.

Các chỉ số toàn chỉ số bên dưới áp dụng cho `full_profiled`/`full_zero_setup` và bài từ chối tương ứng. Riêng `crop_reader`, dùng `R_digits` gồm crop có chuỗi chữ số chuẩn và chấm `crop_string_exact_rate`/`raw_digit_CER`; các chỉ số đòi hỏi unit/layout là không áp dụng (`null` kèm lý do). Nếu cấp layout/unit chuẩn cho bài crop, phải ghi `oracle_profile_supplied:true` và gọi kết quả là có hỗ trợ cấu hình chuẩn, không phải suy layout từ ảnh.

`ready` nghĩa là pipeline đưa ra đề xuất cho chủ nhà xem, **không có nghĩa đã lưu hay tự duyệt**.

| Chỉ số | Cách tính / sử dụng |
| --- | --- |
| `strict_exact_rate` | Số ảnh R có đề xuất khớp `digits + decimals + unit` / `|R|`; sai 0 đầu, thiếu phần lẻ hoặc dấu thập phân là sai |
| `crop_string_exact_rate` | Chuỗi chữ số raw khớp hoàn toàn / `|R_digits|`, bất kể sau đó gate chấp nhận hay từ chối; thiếu raw output tính là sai |
| `accepted_coverage` | Tổng ảnh có đề xuất `ready` / `N`; cần đi cùng precision, không đứng một mình |
| `precision_when_ready` | Số đề xuất đúng toàn chuỗi / tổng đề xuất `ready`; mọi đề xuất trên U đều sai |
| `wrong_ready_rate` | Số đề xuất sai / `N`; khác mẫu số với `1 - precision_when_ready` |
| `readable_abstention_rate` | Ảnh R không có đề xuất / `|R|`; tách rõ review hợp lý và timeout/lỗi |
| `unsafe_on_negative_rate` | Ảnh U có đề xuất / `|U|`; đo riêng với precision trên ảnh đọc được |
| `integer_exact_rate`, `decimal_position_accuracy`, `leading_zero_exact_rate` | Chỉ số phụ; luôn ghi mẫu số hợp lệ và không dùng thay strict exact |
| `raw_digit_CER` | Tổng Levenshtein giữa chuỗi chữ số raw và nhãn / tổng ký tự chuẩn trên cùng tập đọc được; raw đúng nhưng bị gate từ chối vẫn chấm theo raw; thiếu raw tính là chuỗi rỗng |
| `accepted_digit_CER` | Chấm chuỗi đề xuất cuối cùng trên R; ảnh không có đề xuất tính chuỗi rỗng. Đo ảnh hưởng của gate, báo riêng với raw CER |
| `locator_recall` | Vùng dự đoán khớp vùng chuẩn theo ngưỡng IoU đã khóa; báo cả giữ đủ hai đầu hàng và số bánh; không chỉ đếm “có box” |
| `latency` | p50/p95, cold start riêng, inference riêng, HTTP wall time riêng; số ảnh/timeout và concurrency phải kèm theo |
| `resources` | Peak RSS của cả cây tiến trình, VRAM nếu có, dung lượng artifact và phụ thuộc mới; không suy RAM từ cỡ file |
| `review_effort` | Nếu làm user study: thời gian chủ nhà sửa/xác minh, số ảnh phải chụp lại; cùng nhiệm vụ và thiết kế so sánh |

Thiếu quan sát hoặc không có đề xuất thì precision là `null`, không ghi 0% hoặc 100%. Không đánh giá layout sai như trường hợp “bỏ qua”. Giữ raw output, raw transcription và chuỗi đề xuất cuối riêng; quy tắc parse raw phải được khóa trước, không thay O thành 0 hoặc ghép chữ số từ các dòng. Nếu runtime không cung cấp raw transcription thì ghi raw metrics không khả dụng, không suy ngược từ đề xuất. Giữ lý do từ chối để phân loại lỗi: tìm vùng, thiếu ô, chiều, chữ số, carry, phần lẻ, số sê-ri, ngưỡng, timeout.

Với dữ liệu theo công tơ, báo khoảng tin cậy và so sánh bằng bootstrap **theo nhóm công tơ**, trên các cặp kết quả cùng ảnh. Nếu dùng Wilson cho tỷ lệ ảnh để tham khảo, ghi giả định độc lập bị hạn chế bởi ảnh cùng thiết bị. Không dùng các phép xoay như số mẫu thống kê bổ sung.

## 6. Điều kiện chọn model đề xuất

1. Artifact, quyền sử dụng, nguồn dữ liệu, khả năng chạy offline và cách tái lập phải rõ trước khi đưa vào sản phẩm. Chưa rõ checkpoint terms thì giữ ở trạng thái nghiên cứu.
2. Trên val, khóa điểm vận hành nhắm precision toàn chuỗi ít nhất 99%; sau đó đo coverage tại điểm đó trên test. Đây là mục tiêu đề xuất, chưa phải kết quả đạt được.
3. Ưu tiên model có ít `wrong_ready` hơn; trong các model có độ an toàn tương đương, chọn coverage/strict exact tốt hơn. Một model từ chối mọi ảnh có 0 sai nhưng không có giá trị sử dụng, precision của nó là `null`.
4. Mốc lợi ích để cân nhắc thay: tăng ít nhất khoảng 5 điểm phần trăm strict exact hoặc coverage ở điểm precision đã khóa, với khoảng tin cậy chênh lệch có ích; hoặc đạt chất lượng tương đương với giảm tài nguyên/thời gian đáng kể. 5 điểm là đề xuất về lợi ích kỹ thuật, không phải quy tắc thống kê đủ cho mọi cỡ tập.
5. Không chấp nhận cải thiện chung che regression ở điện/nước, 0 đầu, phần lẻ hoặc ảnh âm. Nếu một slice quá ít mẫu, ghi chưa đủ bằng chứng.
6. Mục tiêu vận hành khởi đầu: p95 tổng tác vụ dưới 15 giây trên máy tham chiếu và dưới timeout hiện tại 30 giây; đo cả tải một job và hàng đợi 10 ảnh, một worker. Đây là ngân sách đề xuất cần điều chỉnh theo trải nghiệm chủ nhà, chưa có p95 hiện tại để đối chiếu.

**Độ chắc chắn của tuyên bố 99%:** nếu có 0 sai trên n đề xuất độc lập, cận trên một phía 95% của tỷ lệ sai là `1 - 0.05^(1/n)`. Cần ít nhất 299 đề xuất độc lập không sai mới đưa cận đó xuống khoảng 1%. Ảnh cùng công tơ và ảnh tăng cường không bảo đảm độc lập; cần phân tích theo nhóm và thêm thiết bị. Hai hoặc vài chục đề xuất đúng không đủ xác nhận mục tiêu này. Ngưỡng chất lượng chỉ chọn đề xuất tốt hơn; chủ nhà vẫn phải đối chiếu ảnh.

## 7. Dùng hạ tầng hiện có và phần còn thiếu

Đã có lệnh để quản lý gold, không cần tạo một công cụ gán nhãn song song:

```powershell
node scripts/run-project.mjs scripts/meter-gold.mjs stats
node scripts/run-project.mjs scripts/meter-gold.mjs evaluate --split val
node scripts/run-project.mjs scripts/meter-gold.mjs evaluate --split test --final
```

Các lệnh này dành cho bước thực nghiệm sau khi có nhãn; lượt nghiên cứu chưa chạy evaluate. Không chạy `test --final` để thử cấu hình. Hiện `reader` của CLI dùng nhánh sản xuất với profile chuẩn, chỉ chấm phần nguyên, bỏ mục thiếu layout và chưa ghi latency/RAM/toàn chuỗi. Vì vậy **chưa đáp ứng toàn bộ protocol này**, cũng chưa có selector/adapters cho các model mới. Không ghi kết quả từ CLI đó như full zero-setup.

Code train hiện có còn cần đối chiếu đường dẫn/shape báo cáo gold: hook train tìm `reports`/`aggregate`, evaluator hiện ghi `runs`/`overall`. Đây là hạng mục triển khai sau, không tự sửa hoặc huấn luyện lại trong báo cáo.

Khi triển khai benchmark, tái sử dụng runtime đang có; artifact/cache/dataset đều ở trong dự án theo AGENTS.md. Mỗi tiến trình có thư mục tạm riêng và chỉ dọn đúng thư mục đã tạo sau khi kiểm đường dẫn. Ghim SHA-256 cho model, config, dictionary/tokenizer, manifest, prompt và code revision/working-tree snapshot. Chạy offline, không tải model trong inference và không ghi database nghiệp vụ.

Adapter phải dùng đường dẫn checkpoint/cache tường minh bên trong dự án và báo thiếu artifact khi khởi động thay vì tự tải. Không gọi fallback cache trong user profile của thư viện: OpenOCR có helper dùng `.cache/openocr` dưới home, EasyOCR mặc định dùng `.EasyOCR`; với EasyOCR cần đặt `model_storage_directory` cục bộ và `download_enabled=False`. Dùng cấu hình đường dẫn của thư viện, không đổi thư mục home toàn cục. [OpenOCR helper](https://github.com/Topdu/OpenOCR/blob/main/tools/infer_rec.py), [EasyOCR tham số](https://www.jaided.ai/easyocr/documentation/).

## 8. Kết quả phải giao sau một đợt thực nghiệm

- Manifest và dấu vết nhãn độc lập; phân bố ảnh thật/tổng hợp, công tơ/kiểu máy và các split.
- Ma trận mỗi model × chế độ × utility × slice: số ảnh, đúng, sai-ready, từ chối, lỗi/timeout, khoảng tin cậy, latency và tài nguyên.
- Danh sách ảnh baseline đúng nhưng challenger sai, baseline sai/từ chối nhưng challenger đúng; có vùng và raw output để chủ nhà kiểm.
- Bảng zero-shot tách fine-tune; đo tiền xử lý, model, toàn luồng và queue riêng.
- Quyết định giữ/thay/kết hợp theo số liệu; phần chưa đủ mẫu ghi rõ. Không thay đổi quyền gửi ảnh, xác minh hay tự ghi chỉ số/hóa đơn.

`assessment.json` cung cấp mẫu ghi run và prediction; các trường null là **chưa đo**, không phải thất bại hay 0%. File này là mẫu dữ liệu, chưa phải runner hoặc JSON Schema validator.
