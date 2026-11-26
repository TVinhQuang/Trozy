# Thiết lập OCR sau fine-tune — 03/11/2026

Đã đọc [báo cáo huấn luyện](METER-OCR-TRAINING-20261103.md), đối chiếu artifact thực tế và kiểm chứng lại luồng sản xuất. Cả hai nhánh điện/nước sẵn sàng với model đã fine-tune. Không tải/cài lại dependency, không huấn luyện lại và không mở database nghiệp vụ thật trong kiểm thử.

## Cấu hình đã xác minh

| Nhánh | Model sản xuất | Thực thi |
| --- | --- | --- |
| Điện | `PP-OCRv6_small_det_trozy_onnx_infer/inference.onnx` và `PP-OCRv6_small_rec_trozy_onnx_infer/inference.onnx` trong `.runtime/paddleocr/models/` | PaddleOCR/PaddleX, ONNX Runtime CPU |
| Nước — tìm hàng số | `.runtime/meter-digits/visionstate-yolo/models/trozy_water_yolov8_obb.pt` | YOLOv8-OBB, PyTorch CPU |
| Nước — đọc bánh số | `.runtime/meter-digits/visionstate-yolo/models/wheels-v2.onnx` | VisionState, ONNX Runtime CPU |

SHA-256 của cả bốn trọng số khớp phần 5 của báo cáo huấn luyện. Cấu hình/bảng ký tự Paddle cũng được kiểm hash trước khi báo sẵn sàng. Python portable dùng bản `torch 2.8.0+cpu`, `torch.version.cuda = None` từ thư viện trong dự án.

Mã nguồn trước lượt này đã chọn đúng các đường dẫn fine-tune. Lượt này bổ sung các phần vận hành còn thiếu:

- Worker sản xuất bỏ `TROZY_USE_TRAIN_GPU` và `TROZY_TRAIN_GPU_SITE` khỏi môi trường kế thừa trước khi Python khởi động. Kiểm thử tạo tiến trình thật xác minh vẫn nạp Torch CPU khi tiến trình cha bật training GPU.
- Backend kiểm `modelDigest` từ worker, giữ digest trong đề xuất và lưu thêm `locatorDigest` cho đề xuất tự động. Đề xuất cũ thiếu/sai digest bị ẩn khỏi polling và bị từ chối khi xác minh, yêu cầu đọc lại ảnh. Vùng thủ công không phụ thuộc model tìm vùng nước.
- Hai lệnh npm training gọi Python portable bằng launcher `--python`, thay cho truyền `python.exe` vào Node. Launcher giữ mã thoát và dọn đúng thư mục tạm riêng. Script training dùng lại thư mục tạm của launcher; chạy trực tiếp có thư mục riêng và kiểm tra đường dẫn trước khi dọn.
- README và hướng dẫn vận hành nêu đúng model sản xuất. Setup gốc vẫn giữ nguyên; máy mới cần chép thêm artifact fine-tune cùng `inference.yml`/`inference.json`, đúng đường dẫn và hash. Setup thư viện/model gốc thành công chưa chứng minh OCR fine-tune đã sẵn sàng.

## Kết quả kiểm chứng

| Kiểm tra | Kết quả |
| --- | --- |
| Python: production, automatic, Paddle, YOLO, wheels, row geometry | **46/46 đạt** |
| `npm.cmd test` | **169/169 đạt**, không bỏ qua |
| `npm.cmd run check:ai-ui` | **41/41 đạt** trong DOM cô lập |
| `npm.cmd run build` | TypeScript/Vite thành công; còn cảnh báo kích thước bundle trên 500 kB |
| Launcher Python | Kiểm tra tiến trình thật, truyền tham số Unicode, mã thoát 0/7, từ chối đường dẫn ngoài dự án và dọn temp đều đạt; nằm trong bộ Node trên |
| Hai script training | Biên dịch và kiểm tra bootstrap thư mục tạm đạt; không chạy huấn luyện |
| HTTP điện/nước với model thật | **`ok: true`**, SQLite RAM, nguồn/model không đổi trong phép thử |

Kiểm thử bridge đã mở rộng ảnh `water-blue.jpg` sang cả bốn góc `0°`, `90°`, `180°`, `270°`: đều `ready`, chuỗi `00001056`, hiển thị `00001.056`. Request tự động chỉ nhận số bánh/phần lẻ đã xác nhận, không nhận tọa độ hoặc đáp án mẫu.

[Hồi quy năm ảnh và đối chứng](../METER-OCR-CONFIGURATION-SAMPLES-20261103.json):

| Ảnh | Tự động | Khoanh vùng thủ công |
| --- | --- | --- |
| `electric-clear.jpg` | `needs_review`, không có chỉ số | `ready`: `00766.4` |
| `electric-26762.jpg` | `needs_review`, không có chỉ số | `needs_review`, không có chỉ số |
| `electric-screenshot.jpg` | `needs_review`, không có chỉ số | `needs_review`, không có chỉ số |
| `water-blue.jpg` | `ready`: `00001.056` | `ready`: `00001.056` |
| `water-weathered.webp` | `needs_review`, không có chỉ số | `ready`: `1303.8` |

Ảnh trống ở cả hai loại và ảnh chỉ có số sê-ri điện đều `needs_review`, không sinh chỉ số 0. Ảnh điện tổng hợp kỹ thuật trả `01234.5`, chỉ dùng kiểm tra đường đi xử lý.

[Kiểm chứng HTTP](../METER-OCR-CONFIGURATION-LIVE-20261103.json) xác nhận điện thật tự động từ chối an toàn; chọn vùng đọc `00766.4`; nước tự động đọc `00001.056`; ảnh tổng hợp đọc `01234.5`. Digest của proposal khớp bộ model đã ghim. Tenant và chủ nhà khác không truy cập được đề xuất. Thiếu `imageChecked` hoặc `fractionalChecked` không thể lưu đề xuất có phần lẻ. Chỉ thao tác xác minh rõ ràng của chủ nhà trong RAM mới cập nhật chỉ số; hóa đơn không đổi, kỳ chưa tự chốt. File JSON giữ SHA-256 nguồn/model để đối chiếu lại.

Các ảnh này có nhãn tham chiếu tạm được khóa từ thử nghiệm trước, không phải giá trị tính tiền đã được người dùng xác nhận hoặc benchmark đại diện. Không suy rộng kết quả thành độ chính xác 100% trên mọi loại đồng hồ. Điện mờ/thiếu bánh lẻ và nước cũ vẫn cần chọn vùng hoặc nhập tay; LCD/LED và mặt kim tiếp tục nhập tay.

## Sử dụng

Khởi động lại backend đang dùng (ví dụ dừng phiên cũ rồi `npm.cmd run dev`) và tải lại trang. Giữ cấu hình số bánh/phần lẻ đã xác nhận đúng cho từng phòng và loại công tơ. Với đề xuất có từ trước khi đổi model, bấm **Đọc tự động lại** hoặc đọc lại vùng; không cần gửi lại ảnh gốc.

Người thuê chỉ gửi ảnh. OCR tiếp tục là đề xuất để chủ nhà đối chiếu ảnh, phần lẻ và xác nhận; không tự ghi chỉ số hoặc lập hóa đơn. Các tác vụ dùng thư mục tạm riêng trong dự án và tự dọn khi kết thúc; model, ảnh gốc, dữ liệu và báo cáo cũ được giữ nguyên.
