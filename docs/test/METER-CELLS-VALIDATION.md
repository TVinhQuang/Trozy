# Kiểm tra ô số đang chuyển vòng

Ngày kiểm tra: 28/10/2026. Mã mới bổ sung bằng chứng từng ô và điều kiện từ chối khi không rõ số. Các thử nghiệm dưới đây không chứng minh độ chính xác chung của model.

## Cơ chế đang chạy

`meter-vision-reader.mjs` thực hiện tối đa **hai tác vụ Vision trong cùng ngân sách timeout**:

1. Quan sát toàn cảnh và vùng số để chép nguyên văn bộ đếm, vai trò vùng, đơn vị và trọng số. Yêu cầu này không nhận đáp án OCR, chỉ số cũ hoặc tiện ích đang chọn.
2. Quan sát riêng ảnh vùng số với schema gọn để liệt kê các ô không đỏ và đỏ, kể cả chữ trắng trên nền đỏ. Tác vụ này không nhận câu trả lời của tác vụ 1 hoặc đáp án OCR. Mỗi ô có chữ số quan sát, trạng thái `clear`, `transition`, `occluded`, `unknown`, các khả năng nhìn thấy và `bbox_2d`.

Đây là hai tác vụ của cùng một model, không được tính như hai phiếu độc lập. Không có lần hỏi thứ ba để ép kết quả phù hợp. Nếu tác vụ ô số lỗi hoặc hết thời gian, kết quả chép toàn dãy được giữ để xem xét nhưng không được xác nhận.

Định dạng grounding gốc là tọa độ nguyên `0..1000`, chuyển bằng phép tính hình học sang `rectangle` chuẩn hóa `0..1` cho API. Hệ tọa độ này tham khảo [trao đổi trong repository Qwen3-VL](https://github.com/QwenLM/Qwen3-VL/issues/1486); không coi tọa độ do model dự đoán là phép đo chính xác. Thiếu tọa độ được giữ `null`, không dựng khung giả. `meter-cell-geometry.mjs` ánh xạ ngược qua phóng/cắt/xoay và EXIF để UI khoanh ô trên ảnh gốc khi có khung hợp lệ.

`meter-cells.mjs` giữ nguyên số 0 đầu, thứ tự và số ô do model khai báo. Hai nhóm màu đôi khi liệt kê cùng một cửa sổ; chỉ gộp khi vùng vật lý trùng trên 85% và tỷ lệ diện tích trên 70%. Hai quan sát trùng mà khác chữ số/trạng thái được giữ là chưa rõ, không chọn một đáp án. Số ô khai báo sai sau gộp vẫn gây từ chối, không tự sửa để khớp dãy cần đọc.

OCR chỉ được đối chiếu theo **vị trí trong chuỗi ổn định**; ứng dụng không gán điểm tin cậy OCR riêng cho từng chữ số khi engine chưa cung cấp bằng chứng đó. Một ô đang chuyển, bị che, thiếu vị trí, trùng thứ tự, khác chữ số, thiếu đối chiếu hoặc không khớp số ô đều ngăn tạo `confirmedReading`, kể cả khi OCR và chuỗi Vision giống nhau. Giao diện có thể dùng `?` cho ô chưa rõ. Không dùng quy tắc “luôn lấy chữ số nhỏ hơn” hoặc lịch sử tiêu thụ để điền ô trống.

## Minh chứng trực tiếp với model cục bộ

Ba lượt dưới đây dùng Qwen3-VL cục bộ thật và hình học/quan sát OCR đã lưu từ lượt kiểm tra trước; **không chạy lại OCR, không gọi luồng HTTP người thuê và không truy cập dữ liệu nghiệp vụ**. Báo cáo giữ hash ảnh/mã tại lúc chạy, trước lần sửa giới hạn schema LCD 13 ô; không gán lại hash mới vào kết quả cũ. Chúng là chẩn đoán lịch sử. Bốn kiểm tra HTTP toàn luồng đã chạy lại với hash cuối được ghi riêng ở [METER-CAPTURE-IMPROVEMENT.md](METER-CAPTURE-IMPROVEMENT.md).

| Ảnh | Quan sát thực tế sau hai tác vụ | Kết quả |
| --- | --- | --- |
| Điện rõ `images (5).jpg`, vùng `134,260,222,46` | Chép `00766.4 kWh`; liệt kê đủ sáu ô rõ nhưng model khai báo chỉ năm ô. | `needs_review`, không tự đổi số ô. [Minh chứng](METER-CELLS-ELECTRIC-5-LIVE.json) |
| Điện khó, một số ô chưa hiện trọn | Chép `13624.6`; liệt kê bảy ô với khai báo sáu, khác OCR cache `13621`. | `conflict`, không có chỉ số áp dụng. [Minh chứng](METER-CELLS-ELECTRIC-OPEN-LIVE.json) |
| Fixture điện tổng hợp `012345` | Sáu ô rõ khớp OCR; tác vụ chép toàn dãy còn điền mâu thuẫn giữa trường số điện tử và trường bánh số. | `needs_review` dù phần từng ô đã khớp. [Minh chứng](METER-CELLS-SYNTHETIC-LIVE.json) |

Các điều kiện từ chối đã hoạt động, nhưng model 4B vẫn chưa ổn định ở việc khai báo số ô và cấu trúc trường. Đây là giới hạn hiện tại cần công bố; không gọi cả ba lượt là đọc đúng tự động. Luồng chủ nhà xem ảnh và xác minh/sửa thủ công vẫn cần thiết. Đánh giá thêm bộ nhận dạng chữ số chuyên biệt, chạy thật trên hai ảnh với model nhỏ, nằm trong [METER-DIGIT-MODEL-TRIAL.md](METER-DIGIT-MODEL-TRIAL.md); kết quả đó chưa được nối để xác nhận hoặc tính tiền.

## Kiểm thử hồi quy có ý nghĩa

Các kiểm thử thêm bao phủ: đồng thuận cùng chuỗi nhưng một ô đang chuyển; trường hợp `9 → 0`; thiếu/ghép/trùng ô; tọa độ ngoài ảnh hoặc không hữu hạn; hình học bị thiếu không được bịa; chuyển đổi định dạng bbox; gộp trùng hình học mà không sửa số ô khai báo; hỗ trợ đủ 13 chữ số trên LCD một màu và tối đa 17 quan sát trước gộp nhưng chỉ 13 ô vật lý; tác vụ ô số không sửa câu chép toàn dãy; tối đa hai yêu cầu, tác vụ 2 chỉ nhận một ảnh và không chứa đáp án tác vụ 1, OCR hoặc lịch sử. Bộ kiểm thử tập trung hiện có 25 ca đạt; số kiểm thử toàn project được ghi tại báo cáo tích hợp cuối.
