# Thử ngoại tuyến YOLO + VisionState — 31/10/2026

**Kết luận:** khả thi để thử tiếp bộ đọc bánh số, nhưng chưa đủ bằng chứng bật nhận dạng tự động trong Trozy. Crop được chỉ đúng vùng cho kết quả hứa hẹn; định vị/căn hàng tự động hiện là điểm yếu. Không tích hợp vào UI/API nhận dạng, không thay chỉ số, hóa đơn hoặc dữ liệu nghiệp vụ.

## Kết quả ảnh thật

Nhãn và crop tay được tác nhân khác xem ảnh, khóa trước dự đoán. Có 5 ảnh sẵn có, 3 nhãn toàn chuỗi và 2 ảnh chưa xác định được ô cuối. Đây là nhãn tham khảo do tác nhân đọc, chưa được người dùng xác nhận; không phải benchmark đại diện hoặc nhãn thanh toán.

| Ảnh | Tham khảo trước thử | Crop tay + wheels-v2 | YOLO window trực tiếp | Thử căn hàng bằng hình học ô YOLO |
| --- | --- | --- | --- | --- |
| electric-clear | `00766.4` | Khớp `00766.4`, confidence 0,952 | Đọc sai `00661.1`, confidence 0,399; window dư chữ kWh | Từ chối: có nhiều lưới 6 ô hợp hình học |
| electric-26762 | `26762.?` | Phần nguyên khớp; ô cuối dự đoán 9 **chưa được kiểm chứng** | Từ chối: 2 window | Không thử cứu trường hợp window mơ hồ |
| electric-screenshot | `13624.?` | Phần nguyên khớp; ô cuối dự đoán 0 **chưa được kiểm chứng** | Đọc sai phần nguyên `03641`, confidence 0,370 | Phần nguyên khớp `13624`, confidence 0,961; ô cuối vẫn chưa có nhãn |
| water-blue | `00001.056` | Khớp `00001.056`, confidence 0,911 | Khớp `00001.056`, confidence 0,792 | Khớp `00001.056`, confidence 0,954 |
| water-weathered | `1303.8` (nhãn tạm, kính cũ) | Khớp `1303.8`, confidence 0,997 | Không tìm thấy window | Không dùng crop tay để tính thành công tự động |

Với **3 ảnh có nhãn đầy đủ**: crop tay khớp 3/3; YOLO window trực tiếp khớp 1/3 (một kết quả sai, một không đọc). Sau căn hàng thử nghiệm, vẫn khớp 1/3, hai trường hợp còn lại bị từ chối. Ảnh screenshot được cải thiện phần nguyên, nhưng không được cộng vào số ảnh đúng toàn chuỗi. Không chuyển các con số này thành tỷ lệ chính xác dự kiến trên ảnh mới.

Confidence ở đây là điểm ô yếu nhất của model, **không phải xác suất đúng đã hiệu chuẩn**. Ngưỡng 0,7 được lấy từ cấu hình upstream để quan sát, không được huấn luyện/chọn lại theo kết quả năm ảnh này. Hai chuỗi YOLO sai rõ ở bảng đều dưới ngưỡng này. Điều đó không chứng minh hệ thống sẽ từ chối mọi lỗi ngoài tập thử.

## Đối chứng và quy tắc đọc

- Tạo 4 đối chứng trong RAM từ ảnh điện rõ/nước xanh: Gaussian blur radius 12 và ảnh xám phẳng. Không sửa ảnh gốc. Cả 4 có confidence crop tay dưới 0,25; ba không có YOLO window, một ảnh nước mờ còn window nhưng đọc sai với confidence dưới 0,19. Không trường hợp nào vượt ngưỡng 0,7. Nhận dạng vẫn có thể sinh chuỗi số từ ảnh trống; vì vậy chuỗi trả về tự nó không phải bằng chứng đủ.
- Model suy luận mỗi bánh ở 100 vị trí rồi giải mã truyền số cơ khí. Mã thử giữ riêng giá trị chưa làm tròn, chuỗi lấy sàn để chẩn đoán và chuỗi làm tròn upstream. Với 3 nhãn toàn chuỗi, chuỗi upstream khớp 3/3 qua crop tay, chuỗi lấy sàn chỉ 1/3. Không dùng việc lấy sàn thô để thay quy tắc giải mã cơ khí hoặc để tự quyết định chỉ số thanh toán.
- Số bánh, đơn vị và số chữ số thập phân do manifest cấu hình thủ công. Nhận dạng tự động ở thử nghiệm này nghĩa là tự tìm/căn vùng khi đã biết cấu hình, không phải tự suy ra mọi thông số từ ảnh.
- Thử xoay thêm 180 độ chỉ là chẩn đoán riêng; không chọn đáp án bằng nhãn tham khảo. OBB không xác định được chiều đọc 180 độ. Crop tay dùng thứ tự góc đã được chú thích trước, còn YOLO dùng quy ước hình học độc lập.
- Đối chiếu kỳ trước không tham gia dự đoán/ghép số. Không bổ sung chữ số thiếu, không dùng kết quả Wheel Reader để tìm crop có đáp án mong đợi.

## Cách thử và tính tái lập

Pipeline đầu: YOLO stage1 → một window không mơ hồ → căn nghiêng → chia hàng theo số bánh đã biết → wheels-v2. Không dùng stage2 YOLO hoặc model Vision ngôn ngữ. Nhánh crop tay dùng cùng Wheel Reader, chỉ thay hình học vùng được khóa trước.

Sau khi phát hiện window ảnh điện lấy cả đơn vị, đã thêm **một** thử nghiệm căn hàng: lấy hình học các hộp chữ số stage1 trong window, gộp hộp trùng, chỉ nhận một lưới đủ N ô có khoảng cách phù hợp. Giá trị class chữ số không tham gia chọn lưới; không đệm ô thiếu và không chọn khi có nhiều lưới. Thuật toán được viết/kiểm tra với dữ liệu tổng hợp trước khi tác nhân viết nó xem đầu ra baseline. Kết quả này vẫn là thử sau khi đã xem baseline trên cùng ảnh, không phải đánh giá độc lập. Không chỉnh tiếp ngưỡng/crop để làm đẹp kết quả.

- [Báo cáo ảnh baseline](visionstate-yolo-20261031/baseline/report.html), [JSON baseline](visionstate-yolo-20261031/baseline/results.json).
- [Báo cáo thử căn hàng](visionstate-yolo-20261031/geometry-refinement/report.html), [JSON căn hàng](visionstate-yolo-20261031/geometry-refinement/results.json).
- [Manifest ảnh/nhãn khóa trước](fixtures/visionstate-yolo-samples.json), [phiên bản dependency](visionstate-yolo-20261031/requirements-lock.txt).

JSON giữ SHA-256 nguồn ảnh, mã thử, manifest, trọng số, phiên bản runtime, tất cả window/box, ma trận biến đổi, phân bố 100 vị trí mỗi bánh và điểm từng ô. Ảnh crop/cells là dữ liệu chẩn đoán tạo ra, không sửa ảnh gốc. Nguồn ảnh ở đầu mỗi mục HTML là ảnh gốc; các đối chứng mờ/trống được thể hiện qua crop/cells bên dưới.

Trọng số:

- [YOLO watermeter stage1](https://huggingface.co/ntarekp/watermeter-yolov8-obb), revision `c00b2752e3ad762eb269a05e1dceb28f48c1f27b`, SHA-256 `f2882a477bc12ecc5526cf73438d254945271c3e1b2b4214aa8e4deb637c3be9`.
- [VisionState wheels-v2](https://huggingface.co/oleost/visionstate-wheel-reader), revision `563f365a5b377c10c7248517ef2576ac5cee3cbf`, SHA-256 `5644705e1f0e684b30bf3c7a6cb23e7eb1ddda616cd16b5321423f45bf7fd8b6`.

Runtime CPU nằm hoàn toàn trong `.runtime/meter-digits/visionstate-yolo/`, cache pip tại `.cache/pip/`. Có Python portable 3.12.10, torch 2.8.0+cpu, torchvision 0.23.0+cpu, ultralytics 8.4.194, onnxruntime 1.23.2. Không cài dịch vụ/PATH toàn hệ thống. Không gửi ảnh tới dịch vụ từ xa. Nguồn, sửa đổi và giấy phép được ghi tại `THIRD-PARTY-NOTICES.md`; license Apache gốc được giữ.

Chạy lại tại `D:\Trozy`, dùng output mới để giữ nguyên bằng chứng trước:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/meter-trial/run-trial.ps1 -Output docs/test/visionstate-yolo-20261031/recheck -Controls -OrientationDiagnostics
```

Thử căn hàng từ baseline đã khóa:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/meter-trial/run-trial.ps1 -Refinement -Output docs/test/visionstate-yolo-20261031/refinement-recheck
```

Kiểm chứng: 8 kiểm tra wheel decoder/preprocessing, 10 kiểm tra hình học/định vị, 9 kiểm tra căn hàng đều đạt (**27 Python tests**). `pip check` đạt. **76 Node tests** hiện có đều đạt, gồm bảo vệ gửi ảnh/xác minh thủ công và chỉ số/hóa đơn. Không đổi mã ứng dụng nên không chạy lại build/UI đã đạt ở lượt trước. Đã xem trực tiếp crop/cells các trường hợp chính. Tệp tạm riêng của lượt thử được dọn sau khi kiểm chứng; giữ runtime/model, báo cáo và ảnh.

## Hướng tiếp theo phù hợp với bằng chứng

Nếu tiếp tục làm sản phẩm, bản đầu nên cho chủ nhà xác nhận vùng hàng số và cấu hình công tơ, dùng Wheel Reader đưa đề xuất rồi đối chiếu ảnh gốc. Muốn tự định vị ổn định cần tập ảnh nhiều loại công tơ Trozy hơn, nhãn được người dùng xác nhận, kiểm thử tách theo thiết bị và xử lý ảnh xoay/phối cảnh; chỉ cân nhắc fine-tune detector sau khi có tập đó. Chưa thử LCD/LED và không coi Wheel Reader là bộ đọc các loại màn hình đó.
