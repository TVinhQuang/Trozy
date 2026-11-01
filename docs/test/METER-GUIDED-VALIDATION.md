# Kiểm chứng Vision định vị và kiểm tra OCR — 29/10/2026

Luồng hiện hành: Vision định vị hàng số trước → kiểm tra vùng ảnh gốc → OCR đề xuất → Vision đọc độc lập toàn dãy và từng ô → so sánh. Cấu hình công tơ, baseline, quyền và phiên bản vẫn do server kiểm tra. Chênh đúng ô hàng đơn vị và không quá 1 kWh hoặc 1 m³ có trạng thái riêng; chủ nhà bắt buộc đối chiếu ảnh và ghi lý do, không tự lưu số hoặc hóa đơn. Ngưỡng riêng điện/nước chỉ nhận 0 hoặc 1.

## Kiểm thử tự động

- Tại `D:\Trozy`: 272 kiểm thử Node đạt, không lỗi hoặc bỏ qua; gồm Python worker, ngưỡng, ảnh mờ, timeout/lỗi runtime, không truyền đáp án sang Vision, ánh xạ khung, chống giả mạo kết quả, quyền, dữ liệu thay đổi và xác minh có lý do.
- 70 kiểm tra tương tác UI bằng DOM cô lập và 132 lượt render trang/vai trò đạt; build/TypeScript đạt cả trước và sau chuyển. Hồi quy định vị chạy lại sau chỉnh schema. UI hiển thị cả quan sát OCR chưa đủ điều kiện đề xuất mà không đoán vị trí/dấu thập phân hoặc mở quyền áp dụng.
- Chưa kiểm tra camera điện thoại hoặc trình duyệt thật trong lượt này. Các ca khớp/chênh trong ngưỡng dùng fixture để kiểm chứng logic, không được tính là model đã đọc đúng ảnh thật.

## Model thật và API trong DB RAM

Không truyền đáp án OCR, cấu hình số ô hoặc lịch sử tiêu thụ vào Vision. Bước định vị chỉ nhận ảnh; schema tách trạng thái vị trí khỏi độ rõ của chữ số. Hai tác vụ kiểm tra của Vision không nhận đáp án của nhau. Không gọi model trước khi người thuê gửi ảnh; chỉ chủ nhà nhận kết quả và thông báo. Không chỉnh dữ liệu ứng dụng thật.

| Ảnh | Kết quả quan sát | Quyết định |
| --- | --- | --- |
| Điện mẫu | Vision định vị vùng `65,257,292,66`; OCR giữ `00766` nhưng chưa ổn định/thiếu ô đỏ. Vision chép `00766.4 kWh` nhưng lượt ô số khai 7 ô, mâu thuẫn chuỗi 6 chữ số. | `needs_review`, không đề xuất để áp dụng. [JSON](METER-GUIDED-ELECTRIC-20261029.json) |
| Nước xanh | Vision định vị vùng `240,440,874,277`; OCR giữ nguyên chuỗi lỗi `000010:56m`. Vision chép `00001.056` nhưng quy ước phần lẻ chưa nhất quán. | `needs_review`, không đề xuất để áp dụng. [JSON](METER-GUIDED-WATER-20261029.json) |
| Ảnh tổng hợp làm mờ | Kiểm tra kỹ thuật từ chối trước nhận dạng. | `retake`, không tác vụ nền/model. [JSON](METER-GUIDED-BLUR-20261029.json) |

Hai ảnh thật mỗi ảnh gọi 3 lượt Vision: định vị, chép dãy và kiểm tra ô. JSON có hash mã nguồn, hash ảnh, trạng thái, snapshot kết quả và kiểm tra quyền. Đây là kiểm chứng tích hợp và khả năng từ chối khi bằng chứng mâu thuẫn; chưa chứng minh độ chính xác hoặc mức cải thiện tổng quát. Model vẫn có thể tự tin đọc sai, nên chủ nhà tiếp tục xác minh.

## Chuyển và gom dữ liệu dự án

- Người dùng chọn `D:\Trozy` vì ổ C chỉ còn khoảng 2,8 GB, không đủ cho khoảng 9,5 GB runtime/model.
- Sao chép toàn bộ dự án ban đầu: 17.627 tệp / 562.647.885 byte, gồm `.git`, `node_modules`, tài liệu, database và khóa dữ liệu; kiểm tra SHA-256 mọi tệp và kiểm tra lại nguồn không đổi.
- Ollama: 98 tệp / 9.652.165.980 byte → `.runtime/ollama/`; PaddleOCR/Python và thử nghiệm AMR cũ: 13.514 tệp / 492.782.634 byte → `.runtime/paddleocr/`. Xóa hai nguồn runtime trùng lặp chỉ sau khi hash nguồn/đích khớp. Không tải/cài lại model.
- Ba ảnh dùng trong lượt này lưu trong `.runtime/datasets/meter/`, hash bản sao khớp; ảnh gốc người dùng giữ nguyên. Dữ liệu/model/cache riêng dự án đều dưới root mới. Lịch sử báo cáo cũ giữ đường dẫn cũ theo thời điểm chạy.
- Cache npm trong `.cache/npm`; tiến trình Node/OCR có thư mục tạm riêng trong dự án và dọn sau khi thoát, kể cả khi lỗi. Không xóa dữ liệu, model, báo cáo hoặc tệp tạm có sẵn chưa rõ nguồn gốc.
- Sau các lượt kiểm tra đã dọn 18 log npm do chính lượt này sinh, tổng 19.225 byte; giữ các log cũ. Thư mục tạm Node/OCR của lượt này đã trống; Ollama do lượt kiểm thử mở đã được dừng. Bản dự án C chỉ được loại sau khi mọi tệp nguồn có bản tương ứng đúng SHA-256 ở D.

Chạy tại root mới:

```powershell
cd D:\Trozy
npm run dev
```

Model có sẵn được dùng lại; `npm run dev` tự mở Ollama cục bộ. Xem [thiết kế](../analysis%20and%20design/METER-VISION-GUIDED-OCR.md) và [quy tắc dự án](../../AGENTS.md).

Kết thúc chuyển: mọi tệp trong bản C đã được đối chiếu SHA-256 và loại bỏ; bản dùng chính tại `D:\Trozy`. Thư mục C còn rỗng nhưng Windows đang giữ mở theo phiên làm việc hiện tại, nên không thể xóa chính vỏ thư mục đó trong phiên này. Không còn dữ liệu dự án trong thư mục cũ. Minh chứng: [biên bản chuyển](METER-PROJECT-RELOCATION-20261029.json).
