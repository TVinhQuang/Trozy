# Chụp ảnh công tơ, kiểm tra từng ô và xác minh hai bên

**Mốc hiện tại đã chuyển sang OCR chuyên công tơ:** xem [báo cáo OCR](METER-OCR-SPECIALIZED.md). Camera và luồng chỉ gửi ảnh được giữ; phần Vision/đồng thuận từng ô và hash trong tài liệu này là lịch sử. Kiểm tra mới: 246 Node, 58 UI, 132 render và build đạt; bản thử vẫn cần chủ nhà xem ảnh và xác minh.

Ngày ghi nhận mốc camera: **28/10/2026**. Phạm vi gồm camera có kiểm tra chất lượng, kiểm tra lại ảnh trên server, quan sát từng ô số, nhiều ảnh thật và luồng người thuê gửi/chủ nhà xác minh. Hệ thống vẫn có thể không đọc được hoặc đọc sai ảnh khó; ảnh đủ nét không phải bằng chứng chỉ số chính xác.

## Điều chỉnh mới: người thuê chỉ gửi ảnh

Yêu cầu sau cùng thay luồng xem kết quả nhận dạng ở phía người thuê bằng **chụp/chọn ảnh → kiểm tra kỹ thuật → gửi ảnh**. OCR/Vision chỉ chạy ngầm phía server sau khi bộ ảnh đã được tiếp nhận; kết quả và thông báo xử lý chỉ dành cho chủ nhà. Không có ô nhập/sửa chỉ số điện/nước, phần quan sát AI, lựa chọn số đọc được hoặc xác nhận ghi số ở phía người thuê.

Người thuê nhận biên nhận cùng trạng thái đã gửi/chờ chủ nhà/đã xác minh/cần chụp lại và xem lại ảnh gốc của mình. API, bootstrap và bản xuất dữ liệu dành cho người thuê cũng không chứa kết quả OCR/Vision, các ứng viên, số chủ nhà đang xác minh, giá trị đã duyệt hoặc ghi chú nội bộ của chủ nhà. Thông báo riêng cho chủ nhà không xuất hiện trên bảng tin người thuê. Khi web chủ nhà đang mở ở tab hiện, digest trạng thái được kiểm tra khoảng mỗi 10 giây rồi tự tải thông báo mới khi có thay đổi, tùy độ trễ mạng. Thông báo trong ứng dụng có lối mở ảnh công tơ; không gửi email/push hoặc tin nhắn bên ngoài. Lịch sử chỉ số đã chốt và hóa đơn theo quyền hiện có vẫn là nghiệp vụ riêng.

Kiểm chứng cuối cho luồng chỉ gửi ảnh: **214 kiểm thử Node, 50 kiểm tra DOM, 132 lượt render và build đạt**. Lượt [ảnh thật đọc ngầm](METER-PHOTO-ONLY-LIVE.json) có `modelCallsBeforeSend:0`, một lần xử lý nền bằng PaddleOCR/Vision cục bộ, phản hồi gửi `202 processing`, kết quả chỉ ở phía chủ nhà, thông báo chủ nhà duy nhất và dữ liệu tenant đã lọc qua list/bootstrap/export cả sau xác minh. Chỉ số vẫn cần chủ nhà xem xét; lượt thử nhập tay trong DB RAM chưa chốt kỳ và hóa đơn không đổi. Lượt [ảnh mờ](METER-PHOTO-ONLY-BLUR-LIVE.json) có không lần gọi AI, không tạo bộ gửi, yêu cầu chụp lại. Hash 14 module của cả hai báo cáo khớp mã cuối; ảnh gốc không được sao chép vào repo.

Các mục kết quả model thật và số kiểm thử phía dưới là minh chứng của mốc camera trước điều chỉnh này. Chúng vẫn có giá trị chẩn đoán chất lượng model, **không phải minh chứng của API nhận ảnh rồi đọc nền mới**; không gán lại hash hiện tại cho kết quả lịch sử. Các kiểm thử UI dùng camera/media giả lập, chưa thử phần cứng điện thoại thật.

## Cách dùng cho người thuê

1. Vào **Điện nước**, chọn **Chụp điện** hoặc **Chụp nước** và kỳ ghi chỉ số thuộc hợp đồng đang hoạt động.
2. Chọn **Mở camera để chụp**, cấp quyền camera và đặt cả hàng số, đơn vị cùng trọng số ngay cạnh bộ đếm vào khung. Hai thanh điều chỉnh thay đổi vị trí/chiều rộng khung. Giữ máy yên đến khi nút **Chụp ảnh đủ nét** được bật.
3. Sau khi chụp, đợi kiểm tra chất lượng kỹ thuật của ảnh. Nếu mờ/tối/quá nhỏ, chụp lại; ảnh có sẵn cũng phải qua bước này. Không có kết quả chỉ số hoặc công cụ chỉnh số ở bước này.
4. Có thể gửi **1–3 ảnh thật khác nhau** của cùng công tơ trong cùng kỳ. Chỉ chọn/giữ ảnh muốn gửi; không phải chọn đáp án AI hoặc xác nhận phần nguyên/phần lẻ. Các chữ số không được ghép từ nhiều thời điểm/ảnh để tạo một chỉ số mới.
5. Chọn **Gửi ảnh cho chủ nhà**. Server trả biên nhận rồi tự đọc ảnh trong nền; người thuê không cần đợi model. Gửi ảnh và đọc ngầm chưa ghi chỉ số hoặc thay hóa đơn. Khi AI đọc thiếu hoặc không chắc, chỉ chủ nhà thấy kết quả đó để đối chiếu và quyết định yêu cầu chụp lại.

Camera trong web cần **HTTPS hoặc localhost** và quyền camera của trình duyệt. Truy cập bằng địa chỉ HTTP của máy tính từ điện thoại có thể không được cấp `getUserMedia`; dùng HTTPS khi thử trên điện thoại. Không có bằng chứng đã thử phần cứng camera, lấy nét tự động hoặc trải nghiệm trên điện thoại trong phiên này. Nút chụp kiểm tra độ nét/ánh sáng/độ ổn định, không bảo đảm trước khi chụp rằng cảnh đang hướng tới chứa đúng công tơ hay mọi chữ số đều đọc được. Kiểm tra vùng bộ đếm và từng ô tiếp tục diễn ra sau khi chụp.

## Cách dùng cho chủ nhà

Chủ nhà nhận thông báo trong ứng dụng sau khi xử lý bộ ảnh. Trong **Ảnh công tơ người thuê gửi**, bộ đang xử lý chưa mở xác minh. Khi sẵn sàng, mở **Xem ảnh & xác minh**, xem bản gốc, đổi giữa các ảnh, đối chiếu OCR/Vision và các ô được đánh dấu. Các khung vàng chỉ nơi cần xem lại; đây là vị trí do model đề xuất và được ánh xạ về ảnh gốc, không phải kết luận chắc chắn về chữ số. Chỉ chủ nhà có phần kết quả đọc và biểu mẫu xác minh chỉ số.

Khi đủ căn cứ, nhập/kiểm tra chỉ số nguyên, xác nhận đã đối chiếu từng ô và đơn vị rồi xác minh. Phần lẻ được giữ để đối chiếu; nếu kết quả có phần lẻ, cần xác nhận quy ước ghi phần nguyên. Nếu AI chưa thống nhất hoặc chủ nhà sửa giá trị được đề xuất, cần lý do thủ công ít nhất 10 ký tự. Khi ảnh chưa đủ căn cứ, nhập lý do và chọn **Yêu cầu chụp lại**.

Chủ nhà xác minh riêng điện và nước; kỳ chỉ số được chốt khi cả hai đã được kiểm tra. Đợt xác minh một công tơ không tự thay đổi công tơ còn lại hoặc tạo hóa đơn. Luồng ảnh mới từ chối cập nhật kỳ đã chốt, kỳ có hóa đơn chưa hủy (kể cả nháp), kỳ trước khi kỳ sau đã chốt hoặc dữ liệu nền/lượt thuê đã thay đổi. Các luồng chỉ số/điều chỉnh thủ công có sẵn vẫn riêng biệt.

## Kiểm tra ảnh và ô số đang chuyển

Camera dùng các khung xem trước liên tiếp để kiểm tra kỹ thuật và độ ổn định trong ít nhất 750 ms; các khung này không được tính là nhiều phiếu OCR độc lập. Nút chụp kiểm tra lại chính các điểm ảnh sắp lưu. Server giải mã ảnh gốc trong RAM, xoay theo EXIF và kiểm tra ảnh/vùng khung chụp trước khi tiếp nhận. Ảnh toàn cảnh qua kiểm tra kỹ thuật có thể gửi mà chưa cần có kết quả xác định vùng bộ đếm; việc tìm vùng và đọc ô diễn ra trong nền, không bắt người thuê thao tác nhận dạng.

Các ngưỡng hiện tại là **heuristic có thể cần hiệu chỉnh theo thiết bị và dữ liệu thực**, không phải ngưỡng đã được chứng minh trên tập đánh giá đại diện:

| Kiểm tra | Ngưỡng hiện tại ở ảnh đo |
| --- | --- |
| Kích thước toàn cảnh | Cạnh lớn ít nhất 320 px và cạnh nhỏ ít nhất 240 px. |
| Kích thước vùng số | Cạnh lớn ít nhất 180 px và cạnh nhỏ ít nhất 28 px. Không phóng ảnh lên để vượt ngưỡng. |
| Ánh sáng | Độ sáng trung bình 20–245; tỷ lệ rất tối và rất sáng đều dưới 94%. |
| Tương phản | Độ lệch chuẩn độ sáng ít nhất 20. |
| Độ nét | Phương sai Laplacian ít nhất 45. |
| Cháy sáng | Tỷ lệ điểm RGB gần trắng dưới 80%, hoặc còn tương phản ít nhất 35 và năng lượng cạnh ít nhất 80. |
| Ổn định xem trước | Ít nhất 4 khung qua kiểm tra, kéo dài ít nhất 750 ms; sai khác độ sáng lấy mẫu trung bình không quá 9. |

Server chỉ giảm kích thước mẫu xuống giới hạn xử lý, không dùng tăng độ phân giải sinh ảnh để tạo nét số. Các chỉ số trên có thể bị ảnh hưởng bởi nền nhiều hoa văn, kính phản chiếu, kích thước/góc của số hoặc bộ đếm đang chuyển. Ảnh qua ngưỡng chỉ được hiểu là **qua kiểm tra kỹ thuật**.

Vision phải liệt kê đủ từng ô vật lý, gồm ô rõ, đang chuyển, bị che hoặc chưa xác định. Ô chưa rõ giữ vị trí và dấu `?`, không bỏ ô rồi nối phần còn lại. Thiếu vị trí được giữ là `null`; khung có tọa độ âm/vượt ảnh bị từ chối. Kiểm tra số ô, thứ tự, chồng lấn, cùng hàng và khớp dãy chữ số được thực hiện trước khi cho kết quả tự động. Không dùng quy tắc chung “luôn lấy số nhỏ hơn” và không dùng chỉ số cũ để đoán chữ số đang chuyển.

Đối chiếu OCR ở từng vị trí hiện dựa vào **chuỗi OCR độc lập**, không phải điểm OCR riêng của từng ô. Nếu không có chuỗi ổn định cùng độ dài, có ô chưa rõ, OCR/Vision khác nhau hoặc đơn vị/phần lẻ chưa đủ bằng chứng, hệ thống không đưa chỉ số tự động để áp dụng. Model vẫn có thể tự báo một ô là rõ dù thực tế đọc sai; chủ nhà luôn phải kiểm tra ảnh.

## API, bằng chứng và quyền

Các route mới gồm `/api/meter/quality`, `/api/meter/analyses`, `/api/meter/submissions` và `/api/meter/submissions/:id/review`; schema và điều kiện chi tiết ở [AI-B01-B04-CONTRACT.md](../analysis%20and%20design/AI-B01-B04-CONTRACT.md). Route B03 cũ vẫn dành cho chủ nhà. Upload mới được gắn phòng ở server; người thuê không được gửi đáp án OCR, chỉ số cũ, model/provider hoặc dữ liệu nhận dạng do client tự khai làm bằng chứng.

Mỗi bộ gửi lưu ảnh gốc được cấp quyền và trạng thái xử lý trước; hàng đợi server sau đó bổ sung chất lượng/quan sát hai bộ đọc vào bằng chứng dành cho chủ nhà. Người thuê gửi ảnh không được nhận các trường đó; người thuê khác cùng chủ nhà không đọc được bộ gửi hoặc ảnh riêng. Bộ gửi không sửa qua CRUD chung; review có phiên bản, kiểm tra dữ liệu nền và giao dịch nguyên tử kèm audit. Chưa có thao tác tính tiền/phát hành hóa đơn tự động từ ảnh.

## Các lượt thử HTTP với model thật — mốc trước khi chuyển đọc nền

**Minh chứng lịch sử của mốc camera trước:** bốn lượt dưới đây chạy sau lần sửa giới hạn 13 ô điện tử và trước thay đổi người thuê chỉ gửi ảnh/đọc nền. Hash trong JSON mô tả mã tại lúc chạy, không phải mã hiện tại của luồng mới. `passed:true` có nghĩa kiểm tra tích hợp/cách xử lý ở mốc đó đạt, không có nghĩa mọi chữ số được nhận dạng đúng. Chưa có kết quả tự động được xác nhận trong các mẫu này.

| Lượt thử | Quan sát tại mốc đã ghi | Kết quả nghiệp vụ |
| --- | --- | --- |
| [Ảnh điện rõ, vùng `134,260,222,46`](METER-CAPTURE-ELECTRIC-LIVE.json) | PaddleOCR có dãy `007664`; Vision trả `00766.4 kWh`, liệt kê sáu ô nhưng khai báo năm. Chất lượng vùng số đạt. Kết quả `needs_review`, không có `confirmedReading` hay giá trị tự động. | Tenant gửi bộ ảnh `pending`. Chủ nhà thử xác minh **thủ công 766** trong DB RAM; chỉ điện được duyệt nên `periodConfirmed:false`, hóa đơn không đổi. |
| [Ảnh nước, vùng `220,440,850,300`](METER-CAPTURE-WATER-LIVE.json) | Vision trả sai cách chia thành `00000.1056`, liệt kê tám ô nhưng khai báo bảy; OCR chưa đối chiếu ổn định toàn dãy. Chất lượng kỹ thuật đạt nhưng `needs_review`, không có chỉ số áp dụng. | Chỉ gửi minh chứng chờ xem xét. Chủ nhà thử nhập tay **1** trong DB RAM kèm lý do, xác nhận phần lẻ; chưa chốt kỳ và hóa đơn không đổi. Giá trị thử luồng không phải nhãn chuẩn dùng huấn luyện. |
| [Ảnh được làm mờ trong RAM](METER-CAPTURE-BLUR-LIVE.json) | Không đạt tương phản/độ nét; trả `retake`, `canSubmit:false`, `id:null`, `result:null` trước OCR/Vision. Đây là ảnh dẫn xuất dùng kiểm thử, không phải ảnh chụp mới độc lập. | Không tạo bộ gửi hoặc review; dữ liệu nghiệp vụ không đổi. |
| [Ảnh điện khó, toàn cảnh](METER-CAPTURE-TRANSITION-LIVE.json) | OCR tìm được vùng bộ đếm, nhưng vùng này quá nhỏ theo ngưỡng kỹ thuật nên trả `retake` trước Vision. Không suy ra được chữ số đang chuyển trong ảnh này chỉ từ lý do chất lượng. | Không tạo bộ gửi hoặc review. Người dùng được yêu cầu chụp gần hơn. |

Bốn lượt dùng server HTTP và database trong RAM, không sửa dữ liệu demo thật. Ảnh gốc người dùng không được sao chép vào repo. Báo cáo giữ hash mã/ảnh và quan sát cần đối chiếu, không giữ ảnh/base64. Các ảnh đã dùng để điều chỉnh hệ thống là mẫu hồi quy đã biết, không phải tập kiểm tra độc lập. Các lượt Vision trực tiếp trong [METER-CELLS-VALIDATION.md](METER-CELLS-VALIDATION.md) dùng OCR cache và ghi mốc trước sửa giới hạn LCD; chúng là chẩn đoán lịch sử, khác với bốn lượt HTTP cuối này.

## Thử bộ nhận dạng công tơ chuyên biệt

Đã thực hiện thử nghiệm ONNX ngoại tuyến với model 10 lớp và 100 lớp có nhãn chuyển số; xem [METER-DIGIT-MODEL-TRIAL.md](METER-DIGIT-MODEL-TRIAL.md). Bốn minh chứng là [điện rõ 10 lớp](METER-DIGIT-TRIAL-ELECTRIC-5-10.json), [điện rõ 100 lớp](METER-DIGIT-TRIAL-ELECTRIC-5-100.json), [điện khó 10 lớp](METER-DIGIT-TRIAL-ELECTRIC-OPEN-10.json) và [điện khó 100 lớp](METER-DIGIT-TRIAL-ELECTRIC-OPEN-100.json).

Model 10 lớp cho kết quả phù hợp trên ảnh rõ với khung từng ô được đánh dấu thủ công, nhưng ảnh khó vẫn đọc sai; nhánh 100 lớp chưa đủ căn cứ diễn giải thành một chỉ số tin cậy. Cả bốn JSON đều là `experimental_observations_only`, `confirmedReading:null`, `billingEnabled:false`. Model thử nghiệm **không tham gia xác nhận chỉ số trong ứng dụng**, không thay PaddleOCR và không bỏ điều kiện chủ nhà kiểm tra. Chưa huấn luyện model mới hoặc xây dựng detector tự tìm ô từ thử nghiệm này.

Nguồn, revision, SHA-256, giấy phép Apache-2.0 được công bố bởi upstream và giới hạn về nguồn dữ liệu huấn luyện được ghi trong báo cáo chuyên biệt/[THIRD-PARTY-NOTICES.md](../../THIRD-PARTY-NOTICES.md). Không sao chép tập dữ liệu có điều khoản chưa phù hợp vào ứng dụng. Bước tiếp theo trước khi dùng model chuyên biệt cho dữ liệu thật là ảnh có quyền sử dụng, nhãn từng ô/chuyển vòng, tách tập theo công tơ và đo cả tỷ lệ xác nhận sai lẫn tỷ lệ từ chối trên tập chưa dùng điều chỉnh.

## Phạm vi kiểm chứng

Đã có **204 kiểm thử Node đạt**, bao gồm chất lượng ảnh, ô chuyển/chưa rõ/thiếu vị trí, 13 ô điện tử/17 quan sát trùng, hình học nguồn, ACL, chống giả kết quả, snapshot, review thủ công/phần lẻ/phiên bản và khóa dữ liệu đã thay đổi. **47 kiểm tra DOM trong bộ nhớ**, **132 lượt render trang** và TypeScript/build production đạt. Build còn cảnh báo kích thước chunk, gồm ExcelJS đã có từ trước; không phải lỗi biên dịch. Không mở rộng kiểm thử lặp lại sau khi các kiểm tra liên quan đạt và mã đã được chốt.

Các kiểm tra DOM có camera/media giả lập. Chưa kiểm thử camera vật lý, trình duyệt điện thoại, lấy nét tự động, ánh sáng thực tế, độ trễ mạng di động hoặc nghiệm thu hình thức bố cục trên thiết bị thật. Chưa có phép đo độ chính xác đại diện cho nhiều mẫu đồng hồ. Các giới hạn này cần được giữ rõ khi trình bày tính năng.
