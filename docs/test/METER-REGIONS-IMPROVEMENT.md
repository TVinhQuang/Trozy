# Cải tiến đọc công tơ có nhiều dãy số — 28/10/2026

Luồng B03 đã tách kiểm tra **đúng vùng bộ đếm** khỏi nhận dạng chữ số. Trước đây một dãy được OCR đọc lặp lại như năm sản xuất `2017` hoặc số trên vành `409971` có thể được chọn làm register dù không phải chỉ số tích lũy. Sáu ảnh chẩn đoán ở [METER-MULTINUMBER-DIAGNOSTIC.md](METER-MULTINUMBER-DIAGNOSTIC.md) được dùng làm ca hồi quy; báo cáo chẩn đoán và các minh chứng cũ được giữ nguyên.

Thay đổi này cải thiện chọn vùng và cách từ chối khi thiếu bằng chứng. Nó chưa làm cả sáu ảnh toàn cảnh đọc được đầy đủ. Các chữ số bên dưới là **quan sát của từng engine**, không phải nhãn đúng được cung cấp cho OCR/model hoặc cam kết độ chính xác.

## Thay đổi đã thực hiện

- `meter-regions.mjs` giữ tối đa 12 vùng với vai trò `counter`, `serial`, `specification`, `inspection_label`, `unknown`. Kiểm tra cửa sổ/nhóm màu, đơn vị tích lũy, trọng số in và nhãn lân cận trước khi chọn vùng; điểm OCR cao hoặc diện tích lớn riêng lẻ không đủ. Các quan sát trùng từ nhiều hướng được gộp theo vùng vật lý, giữ hiệu lực loại sê-ri/thông số dù hướng khác chỉ thấy dãy số trong khung. Một vùng phù hợp được chọn; nhiều vùng hoặc thiếu bằng chứng trả `ambiguous`/`unresolved`.
- PaddleOCR đọc toàn cảnh ở 0°, 90°, 270°, rồi tối đa hai cửa sổ phù hợp cho mỗi hướng, tổng tối đa chín lượt. Vùng nghiêng được làm thẳng từ tứ giác; văn bản/polygon mỗi lượt được giữ nguyên. Không bỏ ký tự lỗi, ghép dòng, thêm số thiếu hoặc dùng lịch sử để sửa chữ.
- Vision nhận toàn cảnh và crop từ hình học vùng đã chọn, không nhận chữ số OCR, điểm OCR, chỉ số kỳ trước hoặc đáp án mong đợi. Model phải tự xác minh `regionRole:'counter'`; crop sê-ri/năm/thông số vẫn có thể bị từ chối. Khi vùng còn mơ hồ, không thay bằng một crop lớn nhất.
- Ô đỏ trên công tơ điện cơ có thể là phần lẻ khi đọc rõ các trọng số vị trí in tương ứng, như `1/10`; màu đỏ riêng lẻ không chứng minh điều đó. OCR chỉ ghi `boundarySource:'printed-weights'` khi nhãn quan sát được khớp số lượng/vị trí ô đỏ của chính bộ đếm. Đơn vị và bằng chứng chưa rõ được giữ chưa xác định.
- JSON Vision tự mâu thuẫn có thể được kiểm tra lại một lần trên cùng ảnh, trong cùng timeout. Đây không phải một engine độc lập. Nếu chữ số, đơn vị hoặc vai trò thay đổi, reader giữ `readable:false` và không cho áp dụng.
- UI vẽ các khung bằng `sourceRectangle` theo pixel ảnh gốc sau EXIF, bù đúng crop/xoay; hiện tối đa sáu lựa chọn `counter`/`unknown` và liệt kê vùng đã loại. Chọn khung xóa kết quả cũ và điền tọa độ; **Đọc lại vùng này** mới gọi API. Không tự áp dụng hoặc lưu chỉ số.

Đây là các quy tắc hình học/bố cục có giới hạn quanh model OCR hiện có, chưa phải bộ phát hiện vùng công tơ mới được huấn luyện. Chúng có thể bỏ sót hoặc phân loại chưa đúng trên bố cục/ảnh khác; Vision và đồng thuận toàn chuỗi tiếp tục là các bước kiểm tra riêng.

## Chạy thật trên sáu ảnh toàn cảnh

Mỗi lượt qua HTTP B03 với PaddleOCR và Qwen3-VL cục bộ, database trong bộ nhớ; ảnh gốc không bị sửa hoặc sao chép vào repo. JSON giữ SHA-256 ảnh, hash các module nguồn, thời điểm, vùng, văn bản thô và kết quả. Cờ `passed:true` xác nhận hợp đồng tích hợp/từ chối và bất biến dữ liệu, không nói rằng chỉ số đã được đọc đúng.

| Ảnh | Vùng và quan sát sau cải tiến | Trạng thái / minh chứng |
| --- | --- | --- |
| `images (5).jpg` | Chọn hàng bộ đếm. OCR còn `00766`, bỏ sót ô đỏ; Vision đọc `00766.4 kWh` và trọng số `1/10`. Không bổ sung số `4` cho OCR. | `conflict`; [ELECTRIC-5](METER-REGIONS-ELECTRIC-5-LIVE.json) |
| `images (4).jpg` | Chọn hàng bộ đếm thay cho năm `2017`. OCR giữ ký tự lỗi cuối hàng (`26762回`), không tạo register ổn định; Vision quan sát `26762.9 kWh`. | `vision_only`; [ELECTRIC-4](METER-REGIONS-ELECTRIC-4-LIVE.json) |
| `images (3).jpg` | Ảnh nhỏ 196×257 px; chưa đủ bằng chứng chọn vùng và xác định phần lẻ. Quan sát Vision không trở thành kết quả được xác nhận. | `needs_review`, vùng `unresolved`; [ELECTRIC-3](METER-REGIONS-ELECTRIC-3-LIVE.json) |
| `cach_xem_cac_loai_dong_ho_dien_4_ae698dd3b1.jpg` | Chọn hàng bộ đếm; OCR ổn định `13621`, quan sát Vision khác chữ số/phần lẻ và chưa xác định rõ quy ước. | `conflict`; [ELECTRIC-OPEN](METER-REGIONS-ELECTRIC-OPEN-LIVE.json) |
| `images (2).jpg` | Chưa đủ bằng chứng chọn vùng bộ đếm trên ảnh nhỏ; chưa có chuỗi OCR ổn định để đối chiếu. | `needs_review`, vùng `unresolved`; [WATER-2](METER-REGIONS-WATER-2-LIVE.json) |
| `images (1).jpg` | Chọn được hàng bộ đếm nghiêng thay cho dãy trên vành `409971`. OCR giữ hai chuỗi cạnh tranh `0101917151`/`01019171519`; Vision đổi quan sát khi tự kiểm tra nên giữ không đọc chắc. | `conflict`; [WATER-1](METER-REGIONS-WATER-1-LIVE.json) |

Cả sáu lượt toàn cảnh đều trả `confirmedReading:null`, `candidates:[]`, `suggestedValue:null`. Ứng dụng không hiện kết quả để áp dụng trong các trạng thái này. JSON từng lượt xác nhận các bản ghi nghiệp vụ không đổi, chỉ số kỳ trước/lịch sử dùng giá trị server thay cho giá trị client gửi. Thời gian toàn luồng của sáu lượt khoảng 8,6–14,6 giây; đây gồm khởi tạo OCR, các lượt nhận dạng, chuẩn bị ảnh và Vision, không phải thời gian inference nóng của riêng model.

## Đọc lại vùng đã chọn

Thử thêm chính ảnh `images (5).jpg` với vùng bộ đếm theo tọa độ gốc `134,260,222,46`: OCR đọc ổn định đủ chuỗi `007664`; Vision độc lập đọc `00766.4 kWh`, nhận đúng vai trò bộ đếm và `1/10`. Kết quả `agreed`, `agreementScope:'digits'`, đơn vị từ cả hai engine, ranh giới phần lẻ từ Vision. Crop không chứa đủ nhãn trọng số để coi OCR đã xác minh độc lập quy ước phần lẻ; provenance vẫn giữ điều này rõ ràng.

Minh chứng: [METER-REGIONS-SELECTED-CROP-LIVE.json](METER-REGIONS-SELECTED-CROP-LIVE.json). Giá trị vật lý là `766.4`, chuỗi hiển thị giữ số 0 đầu `00766.4`; biểu mẫu hiện dùng phần nguyên `766` và vẫn yêu cầu xác nhận riêng về phần lẻ, đối chiếu ảnh, rồi xác nhận cả form trước khi lưu. Lượt nhận dạng không đổi bản ghi nghiệp vụ. Tọa độ trên là thao tác chọn vùng của ca hồi quy, không được hardcode vào pipeline.

## Tái hiện

Chuẩn bị môi trường PaddleOCR và Ollama theo [AI-INTEGRATION.md](<../analysis and design/AI-INTEGRATION.md>), rồi chạy từ gốc repo:

```powershell
npm run ai:paddle-check -- --file 'E:\Downloads\images (5).jpg' --utility electric --with-vision true --evidence 'docs/test/METER-REGIONS-ELECTRIC-5-LIVE.json'
npm run ai:paddle-check -- --file 'E:\Downloads\images (5).jpg' --utility electric --with-vision true --rectangle '134,260,222,46' --evidence 'docs/test/METER-REGIONS-SELECTED-CROP-LIVE.json'
```

Đổi tên ảnh/`--utility` để chạy các ca còn lại. Không truyền đáp án chữ số cho model; `--evidence` ghi báo cáo, không sao chép ảnh. Script dùng HTTP được kiểm quyền, database trong bộ nhớ và xác nhận nhận dạng không thay đổi dữ liệu nghiệp vụ. Kết quả model có thể khác giữa các lượt; kiểm tra `sourceHashes`, `checkedAt` và bằng chứng trong JSON khi so sánh.

Trên UI, tải ảnh, chạy đọc, chọn đúng khung hoặc dùng chọn vùng thủ công, rồi nhấn **Đọc lại vùng này**. Với ảnh quá nhỏ/mờ hoặc ô số chuyển tiếp, cần ảnh cận cảnh rõ hơn hoặc nhập tay; phóng lớn ảnh nhỏ không khôi phục chi tiết đã mất.

## Hai ca hồi quy từ giai đoạn trước

- [Ảnh điện tổng hợp](METER-REGIONS-REGRESSION-ELECTRIC-LIVE.json): OCR vẫn đọc ổn định `012345`, Vision cũng giữ chuỗi này và đơn vị `kWh`, nhưng model điền nhóm trường mâu thuẫn kể cả sau lượt tự kiểm tra. Kết quả `needs_review`, không đề xuất áp dụng. Ca từng có lượt đọc hợp lệ ở phiên bản trước; hiện chưa thể coi chất lượng model trên ca này là ổn định.
- [Ảnh nước cũ](METER-REGIONS-REGRESSION-WATER-LIVE.json): OCR vẫn đọc `13038`; Vision quan sát `1303.8` nhưng đơn vị/quy ước chưa rõ nên tiếp tục từ chối áp dụng. Cả hai lượt giữ nguyên bản ghi nghiệp vụ.

Các kiểm tra này xác nhận giữ bằng chứng và từ chối khi cần, không biến lượt model đọc chưa hợp lệ thành một phép thử nhận dạng thành công.

## Phạm vi kiểm chứng và giới hạn

Bản cải tiến đã đạt **166 kiểm thử Node**, **26 ca tương tác UI**, **132 lượt render trang/vai trò/cơ sở** và **build production**:

```powershell
npm test
npm run check:ai-ui
npm run check:pages
npm run build
```

Kiểm thử hồi quy bao gồm vai trò năm/sê-ri/thông số, nhiều vùng cạnh tranh, gộp vùng qua góc xoay và giữ nhãn loại đúng mà không mượn nhãn từ hàng khác, tọa độ crop/xoay, hàng nghiêng, chuỗi OCR dài tới 13 chữ số, trọng số điện cơ, tự kiểm tra Vision, và việc UI chọn vùng phải xóa kết quả cũ nhưng chưa gọi API. Các kiểm tra ACL, chỉ số kỳ trước do server xác định, xác nhận phần lẻ/cả form và không sửa dữ liệu sau nhận dạng vẫn được duy trì. Bảy lượt HTTP nêu trên được ghi lại sau khi cố định mã nguồn; các `sourceHashes` trong JSON khớp nhau và khớp các module hiện tại.

Sáu ảnh này đã được dùng để phát triển quy tắc và prompt. Một ca crop đồng thuận cùng các ca từ chối an toàn chưa đủ để suy ra độ chính xác trên thiết bị chưa gặp. Cần tập ảnh được gán nhãn độc lập, đa dạng bố cục/ánh sáng/góc chụp, gồm sê-ri lớn hơn bộ đếm, bảng thông số, nhiều màn hình và ô số chuyển tiếp, trước khi công bố tỷ lệ nhận dạng. Chưa có bằng chứng cho tuyên bố độ chính xác 100% hoặc bảo đảm mọi công tơ đều đọc được.

Nguồn và giấy phép PaddleOCR/model được giữ tại [THIRD-PARTY-NOTICES.md](../../THIRD-PARTY-NOTICES.md) và [licenses/PaddleOCR-Apache-2.0.txt](../../licenses/PaddleOCR-Apache-2.0.txt). Các thay đổi ở đây thuộc adapter, kiểm tra bằng chứng và giao diện Trozy; không sửa trọng số upstream.
