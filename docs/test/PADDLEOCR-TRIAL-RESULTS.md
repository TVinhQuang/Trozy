# Kết quả thử PaddleOCR cục bộ

PaddleOCR đọc được thêm bằng chứng hữu ích trên ảnh đồng hồ nước cũ mà Tesseract hiện tại bỏ sót. Kết quả đủ để tiếp tục phát triển một bộ đọc OCR dùng PaddleOCR, nhưng chưa đủ để tự xác nhận chỉ số hoặc thay thế toàn bộ luồng đọc công tơ. Lượt thử này chạy riêng; ứng dụng, database, hóa đơn và Vision/Ollama không tham gia.

Nguồn kiểm chứng là [JSON kết quả đầy đủ](PADDLEOCR-TRIAL.json), gồm văn bản nguyên gốc, polygon từng dòng, điểm nhận dạng, SHA-256 đầu vào, cấu hình, lỗi và thời gian. Lượt được ghi nhận chạy ngày 27/10/2026, khoảng 19:50:31–19:50:56 giờ Việt Nam; dữ liệu thô và ảnh chuẩn bị giữ tại `D:\TrozyOCRTrial\work\benchmark-2026-10-27T12-50-27-186Z-7f4afb3a`. Cách thực hiện ở [PADDLEOCR-TRIAL-PROTOCOL.md](PADDLEOCR-TRIAL-PROTOCOL.md).

## Phạm vi

Có **hai ảnh đồng hồ nước thật**, một ảnh điện tổng hợp và hai ảnh đối chứng tự tạo: ảnh trắng, ảnh chỉ có số sê-ri/thông số kỹ thuật. Tổng cộng 13 biến thể, gồm ảnh toàn cảnh tại các góc 0°/90°/270° và hai vùng cắt do người chọn trước. Các biến thể của cùng ảnh không phải những đồng hồ độc lập.

Hai engine nhận cùng bytes ảnh đã kiểm SHA-256. Nhãn tham chiếu chỉ dùng sau khi nhận dạng; không truyền đáp án, chỉ số kỳ trước hoặc mức tiêu thụ mong đợi vào model. Tesseract chạy qua `recognizeMeter` hiện có; PaddleOCR dùng `PP-OCRv6_small_det` và `PP-OCRv6_small_rec`, ONNX Runtime CPU, bốn luồng. Các bộ phân loại hướng tài liệu/dòng chữ và nắn tài liệu của Paddle được tắt; góc xoay là biến đổi ảnh khai báo riêng.

## Kết quả nhận dạng

Trong bảng, `/` phân cách các dòng OCR riêng, không có nghĩa hệ thống đã ghép hoặc xác nhận chúng thành chỉ số.

| Ảnh/biến thể | Tesseract hiện tại | PaddleOCR | Ý nghĩa |
| --- | --- | --- | --- |
| Đồng hồ xanh, toàn ảnh 0° | `00001056` / `00001`; nhóm đen `00001` ổn định, cả dãy chưa ổn định | `000010:56m`, và dòng `3` riêng phía trên vùng đơn vị | Các chữ số của hàng chính có thể đối chiếu được, nhưng dấu `:` không phải bằng chứng về dấu thập phân. Paddle chưa tự xác định nhóm đen/đỏ hoặc `m³`. |
| Đồng hồ xanh, cắt vùng số 0° | `80001056` / `00001` | `000010:56m` | Cắt vùng không loại bỏ lỗi dấu câu; Tesseract vẫn có kết quả cạnh tranh ở cả dãy. |
| Đồng hồ xanh, toàn ảnh 90° | Văn bản nhiễu, không đúng dãy | Có `00010:56`, mất một số 0 đầu; một dòng `0` được phát hiện riêng | Không ghép các dòng để sửa đáp án. |
| Đồng hồ xanh, toàn ảnh 270° | `1111` | Các mảnh như `u95:0`, `0000` | Cả hai chưa đọc được đầy đủ. |
| Đồng hồ cũ, toàn ảnh 0° | Rỗng | `1303` / `8`, cùng các ký hiệu khác | Hai polygon nằm tại hàng số, nhưng vẫn là hai quan sát riêng. Đây là cải thiện rõ so với không có văn bản. |
| Đồng hồ cũ, toàn ảnh 90° | Rỗng | Các mảnh như `000`, `20.0X` | Không đọc đúng hàng số. |
| Đồng hồ cũ, toàn ảnh 270° | Rỗng | Một dòng `13038` | Đúng chuỗi chữ số nhìn thấy; chưa xác nhận đơn vị hoặc vị trí thập phân. |
| Đồng hồ cũ, cắt vùng số rồi xoay 270° | `8 : : a` | Một dòng `13038` | Nhận chữ tốt hơn khi người chọn vùng và xoay đúng chiều. Chưa chứng minh tự tìm vùng số. |
| Điện tổng hợp, toàn ảnh 0° | `012345`, ổn định | `012345` và `kWh` ở hai polygon riêng | Ca kiểm tra kỹ thuật thuận lợi; không đại diện cho đồng hồ điện ngoài thực tế. |
| Điện tổng hợp, toàn ảnh 90° | Có `012345`, đơn vị chưa rõ | `012345`, nhưng vùng đơn vị đọc thành `AN` | Đúng số chưa đồng nghĩa đúng cả chỉ số và đơn vị. |
| Điện tổng hợp, toàn ảnh 270° | Văn bản sai | `0345`, mất ký tự đầu | Chưa ổn định theo hướng ảnh. |
| Ảnh trắng | Rỗng | Rỗng | Không phát hiện chữ ở ca đối chứng này. |
| Chỉ có thông số kỹ thuật | Nhận được số sê-ri, điện áp, lưu lượng; không có ứng viên chỉ số | `S/N 99887766`, `230 V 50 Hz`, `Q3=2.5 m3/h` | OCR đọc chữ đúng nhưng ảnh không có bộ đếm. Cần bộ lọc nghiệp vụ để loại các số này. |

Ở ảnh đồng hồ cũ, tham chiếu thủ công ghi nhóm đen `1303`, nhóm đỏ `8`; đơn vị để `null` vì ảnh chưa cho thấy rõ. Kết quả Paddle `13038` **không tự chứng minh** giá trị `1303.8 m³`. Ở ảnh xanh, đối chiếu thủ công thấy nhóm đen `00001`, nhóm đỏ `056`, đơn vị `m³`; không được coi dấu `:` trong `000010:56m` là dấu thập phân thật.

Đã kiểm tra polygon để phân biệt dòng số chính với ký hiệu phụ. Ví dụ ảnh cũ 0° có hộp bao dòng `1303` khoảng `(842,555)–(968,891)` và dòng `8` khoảng `(847,875)–(938,952)` trên ảnh chuẩn bị. Ảnh xanh 0° có polygon hàng `000010:56m` tại `(250,572), (1104,443), (1127,596), (273,725)`. Đây là bằng chứng vị trí trong lượt thử, không phải tọa độ cố định để đưa vào sản phẩm.

Điểm nhận dạng cao vẫn đi cùng lỗi: dòng xanh `000010:56m` có điểm khoảng `0.981`; bản xoay 90° mất số 0 đầu vẫn khoảng `0.978`. Các điểm này không phải xác suất chỉ số công tơ đúng. `normalizedConcatMatch` trong JSON chỉ bỏ ký tự không phải số trên từng quan sát để chẩn đoán; nó không xác nhận nhóm màu, đơn vị hay giá trị tính tiền. `unitTextPresent` cũng chỉ là kiểm tra văn bản, không phân biệt đầy đủ `m3` và `m3/h`.

## Tài nguyên và thời gian

Các số dưới đây thuộc một lượt thử trên CPU Intel Core i7-13620H, RAM khoảng 32 GiB:

- Python portable `3.11.9`; metadata gói PaddleOCR `3.7.0`, PaddleX `3.7.2`, ONNX Runtime `1.23.2`. Mã PaddleOCR thực tế được import từ thư mục `PaddleOCR-main` người dùng đã tải; JSON lưu đường dẫn và hash mã. Không dùng GPU.
- Khởi tạo Python/model: **4,636 giây (4636 ms)**. Lần nhận dạng đầu tiên trên ảnh xanh toàn cảnh: **706 ms**, tách khỏi thời gian khởi tạo. Các ảnh thật toàn cảnh còn lại: **638–700 ms/ảnh** sau khởi tạo. Hai vùng cắt: **58 ms** cho ảnh xanh và **28 ms** cho ảnh cũ. Đây là số đo tại máy trong lượt thử, không phải cam kết tốc độ.
- RSS Python lớn nhất được quan sát sau nhiều ảnh khoảng **1324 MiB, tương đương 1,29 GiB**, lấy mẫu mỗi 20 ms. Đây không phải mức bộ nhớ tăng thêm của riêng trọng số model hoặc bảo đảm bộ nhớ tối đa của hệ điều hành. Tesseract chưa được đo bộ nhớ tiến trình con tương ứng.
- Thời gian Tesseract trong cả 13 ca: **824–1665 ms/ca**, gồm khởi tạo tiến trình/worker và tiền xử lý nhiều lượt. Thời gian từng ảnh Paddle được đo sau khi khởi tạo model. Hai cách đo chưa đủ để kết luận engine nhanh hơn bao nhiêu lần.

Môi trường Python, model, cache và ảnh thử nằm trong `D:\TrozyOCRTrial`. Script có cấu hình cache/thư mục tạm trên D: và chặn ghi ngoài thư mục thử cùng kết nối mạng ở tầng Python. Kiểm tra cuối lượt không xác định được tệp tạm nào trên C: do thử nghiệm này tạo ra; các tệp gần đây không rõ nguồn gốc được giữ nguyên. Cơ chế audit không chứng minh tuyệt đối mọi thư viện native đều không tạo tệp ở C:. Chỉ dọn tệp tạm đã xác định nguồn gốc; giữ mã benchmark và báo cáo làm bằng chứng, không xóa ảnh gốc hoặc thư mục mã PaddleOCR của người dùng.

Đã dọn **502 tệp do lượt thử tạo trong `D:\TrozyOCRTrial`**, giải phóng **242,25 MiB**: bản tải cài đặt, cache pip, bốn thư mục benchmark cũ và hai JSON kiểm tra khởi động. Giữ môi trường/model, manifest, ảnh đối chứng và bằng chứng của lượt cuối để chạy lại; tổng phần giữ trên D: khoảng **469,3 MiB**. Không xóa tệp nào trên C: trong lượt thử này.

## Hướng phù hợp cho Trozy

Nên tiếp tục với PaddleOCR làm nguồn OCR cung cấp **văn bản và polygon**, rồi phát triển bước chọn đúng hàng công tơ, xử lý hướng ảnh, đối chiếu nhóm màu, đơn vị và dấu thập phân. Giữ nguyên văn bản thô, các trường chưa rõ và lý do từ chối; không xóa dấu câu rồi chuyển cả chuỗi thành số tính tiền. Chỉ số kỳ trước dùng để cảnh báo sau nhận dạng, không dùng để đoán lại chữ số.

Vision có thể cung cấp cách hiểu mặt đồng hồ độc lập, còn OCR đưa ra bằng chứng chữ/vị trí để đối chiếu. Khi không khớp hoặc thiếu đơn vị/quy ước, người dùng cần kiểm tra ảnh hoặc nhập tay. Chưa có thay đổi provider trong ứng dụng từ lượt thử này.

Trước khi công bố độ chính xác hoặc dùng rộng rãi, cần đánh giá trên ảnh của **các đồng hồ khác chưa dùng để phát triển**, gồm ảnh điện thật, nhiều kiểu mặt số, ánh sáng, góc chụp và mức mờ. Đo cả đúng toàn dãy, phần nguyên/thập phân, đơn vị, số lần từ chối và các trường hợp đọc nhầm thông số thành chỉ số, theo [METER-EVALUATION.md](METER-EVALUATION.md). Hai ảnh thật hiện tại chưa cho phép suy ra tỷ lệ chính xác chung.
