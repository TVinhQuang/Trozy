# Đánh giá hướng phát triển OCR công tơ Trozy — 08/11/2026

**Kết luận:** Có nhiều ứng viên đáng thử, nhưng chưa có bằng chứng rằng một model mới sẽ đọc ảnh Trozy tốt hơn hai bộ hiện tại. Hướng thực dụng là giữ hai bộ làm mốc, thử **OpenOCR RepSVTR mobile và PARSeq-tiny trên cùng vùng ảnh**, đồng thời dùng **PP-OCRv6 medium** để kiểm tra lợi ích của việc tăng năng lực ngay trong họ Paddle. Với nước, cần đo riêng lỗi định vị/tách bánh trước khi thay VisionState. VLM phù hợp với một nhánh nghiên cứu bổ sung.

Bộ này gồm báo cáo lựa chọn, [quy trình benchmark](meter-ocr-evaluation-20261108/PROTOCOL.md) và [ma trận/mẫu ghi kết quả JSON](meter-ocr-evaluation-20261108/assessment.json). Đây là **thẩm định tài liệu và kiểm toán bằng chứng cục bộ**, chưa phải cuộc thi chạy thực nghiệm giữa các model mới. Các chỉ số benchmark mới để `null`; không dùng điểm ước đoán làm độ chính xác.

## 1. Phạm vi và mức độ chắc chắn

- Đối tượng chính: ảnh công tơ điện/nước cơ có bánh số, ảnh chụp điện thoại, số 0 đầu, bánh đỏ phần lẻ, bánh đang chuyển số, góc xoay và phản sáng. LCD/LED và mặt kim là phạm vi mở rộng, phải đo riêng.
- Ưu tiên: chạy cục bộ trên Windows, dùng CPU được, ảnh không rời máy, có thể huấn luyện bằng dữ liệu hợp lệ. Kiểm tra qua Node trong lượt này thấy CPU i7-13620H, 16 luồng logic, RAM khoảng 32 GiB. Chưa đo VRAM hay hiệu năng model mới.
- Đã kiểm tra trạng thái hai runtime và hash artifact hiện tại; đã đọc code, báo cáo và manifest liên quan. Không chạy lại nhận dạng, huấn luyện, tải model hay mở database nghiệp vụ trong lượt nghiên cứu này.
- Các nhận định “phù hợp”, “đáng thử”, “chi phí tích hợp” bên dưới là đánh giá kỹ thuật của báo cáo. Kích thước trọng số không phải RAM khi chạy; benchmark OCR tài liệu của tác giả không phải benchmark công tơ Trozy.

## 2. Hai bộ đang dùng và bằng chứng hiện có

| Nhánh | Artifact hiện tại | Điểm mạnh cần giữ | Điểm cần kiểm tra |
| --- | --- | --- | --- |
| Điện | PP-OCRv6 small det/rec đã fine-tune, ONNX; khoảng 9,9 MB det + 21,2 MB rec | Có polygon, văn bản, điểm OCR; đã nối luồng xác minh; dùng ngữ cảnh kWh và hai quan sát | Dãy số dính kWh, bỏ bánh đỏ/0 đầu, dấu thập phân, từ chối do kiểm tra vùng |
| Nước | `trozy_water_yolov8_obb.pt` khoảng 12,7 MB + `wheels-v2.onnx` khoảng 6,1 MB | Wheel Reader mô hình hóa trạng thái bánh đang quay, thay vì chỉ chọn 0–9 | Tìm cửa sổ, đủ bánh và đúng chiều; suy phần lẻ; ảnh cũ/bẩn và vùng bị cắt |

Mã đang ghim YOLO SHA-256 `e02e60b02f4f24321390782de099079cbc3b060b4a8894adb00794126470ef16`, trùng file thật và báo cáo train ngày 05/11. Hash `d104…` trong [báo cáo 03/11](../test/reports/METER-OCR-TRAINING-20261103.md) là phiên bản lịch sử. Paddle det `5269b6…`, rec `97d8a2…`, Wheels `564470…` cũng trùng file hiện tại. Tham chiếu triển khai: [meter-reader.mjs](../../src/ai/meter-reader.mjs), [hướng dẫn bộ đọc](../METER-READER.md).

VisionState công bố đầu ra 100 vị trí quanh mỗi bánh, có ngữ cảnh lân cận và giải mã quan hệ truyền số. Điều này sát bài toán bánh cơ. Nó vẫn cần đúng vùng ảnh; điểm tin cậy không tự thành xác suất toàn chỉ số đúng. [Model card VisionState](https://huggingface.co/oleost/visionstate-wheel-reader).

### Không diễn giải các số cũ thành độ chính xác thực tế chung

| Bằng chứng đã lưu | Số liệu đáng chú ý | Diễn giải đúng |
| --- | --- | --- |
| [HTTP không cấu hình, 05/11](../test/METER-ZERO-SETUP-LIVE-20261105.json) | `water-blue` → `00001.056`, 4.891 ms; `electric-clear` → `00766.4`, 7.682 ms. Ba ảnh thật khó còn lại cần review | Ảnh phát triển được tái sử dụng, nhãn chưa được chủ nhà xác minh; không suy ra tỷ lệ chung hoặc p95 |
| `.runtime/meter-digits/runs/water_yolov8n_obb_eval.json`, 05/11 | 332/436 lượt chọn được window; 111/436 lượt qua `refine_row` | 109 ảnh gốc gồm **19 thật + 90 tổng hợp**, xoay 4 lần. Có truyền số bánh chuẩn; không kiểm IoU với vùng chuẩn hay đọc đúng toàn chuỗi. Không phải 436 ảnh thật độc lập hoặc bài đo zero-setup |
| Cùng báo cáo nước, 20 ảnh UD | 2 đề xuất `ready`, 2 đúng phần nguyên | Mẫu rất nhỏ; chưa đo đầy đủ chuỗi/phần lẻ; 100% của 2 đề xuất không chứng minh tổng quát hóa |
| Báo cáo train điện, 03/11 | 100% trên 207 nhãn chỉ gồm chữ số; 74/80 đúng end-to-end có cấu hình chuẩn | 207 nhãn số và 80 mặt công tơ này đều tổng hợp. Không phải 100% trên ảnh điện thật Việt Nam |

Code train nước còn dùng các fixture và một phần tập mang tên test khi chọn checkpoint. Vì vậy những tập đó đã tham gia chọn model; dù không trùng byte với train, chúng không còn là final test chưa từng xem. Bộ 403 ảnh `eval_readings` cũng không đồng nghĩa đã chạy 403 ảnh end-to-end: script hiện chỉ chấm 20 ảnh UD trong phần này.

Phép đo recognition điện rộng hơn có 478/518 chuỗi khớp, nhưng tập trước lọc gồm 497 nhãn tổng hợp và 29 nhãn Henrik thật trên tổng 526 nhãn; loader loại một số nhãn không phù hợp. Số 92,28% đó cũng không đại diện cho ảnh thật Việt Nam hoặc khả năng đọc toàn ảnh.

**Khoảng trống quyết định:** chưa có `data/meter-gold/` ở thời điểm kiểm tra. Công cụ [meter-gold](../../scripts/meter-gold.mjs) có sẵn, nhưng evaluator hiện nhận bố cục chuẩn, bỏ ảnh thiếu bố cục và so **phần nguyên**. Cần bổ sung bài đo toàn chuỗi/phần lẻ, zero-setup và ảnh không đọc được trước khi dùng kết quả để chọn bộ thay thế. Đây là nhận xét kiểm toán; lượt này không sửa công cụ.

## 3. Ma trận 10 ứng viên/họ model khác

“CPU khả thi” nghĩa là có đường triển khai để thử; chưa chứng minh tốc độ trên Trozy. “Ưu tiên” là thứ tự đầu tư thử nghiệm, không phải bảng xếp hạng độ chính xác.

| Ứng viên | Vai trò và lợi ích có thể có | Chạy cục bộ / fine-tune | Hạn chế với công tơ | Giấy phép đã xác minh | Ưu tiên |
| --- | --- | --- | --- | --- | --- |
| **OpenOCR RepSVTR mobile**; SVTRv2 là biến thể riêng | Đọc chuỗi trên crop; đối thủ gọn, có CTC và hướng triển khai ONNX | Có mobile ONNX và tài liệu train/export chính thức | Không tự giải quyết vùng số, vị trí phần lẻ hoặc cơ chế truyền bánh | Code Apache-2.0; điều khoản riêng của checkpoint chưa xác minh được | **Thử sớm**, xác minh quyền trọng số trước áp dụng |
| **PARSeq-tiny** | Bộ đọc chuỗi có kiến trúc khác; thử NAR/AR riêng để xem có bổ sung lỗi cho Paddle | Có checkpoint tác giả, train/fine-tune; ONNX cần kiểm parity và decoder | Cần crop đúng; ngữ cảnh ngôn ngữ không bảo đảm có ích cho chuỗi số | Code và model card tác giả Apache-2.0 | **Thử sớm** |
| **PP-OCRv6 medium det/rec** | Đối chứng nâng cấp trong họ hiện tại; thử rec trước, rồi det+rec | Có ONNX chính thức, cùng hệ sinh thái | Tăng cỡ model không tự sửa sai layout; model gốc phải so riêng với model đã fine-tune | Model card Apache-2.0 | **Thử sớm**, công tích hợp dự kiến thấp hơn đổi nền tảng |
| **Florence-2-base-ft** | `<OCR>` / `<OCR_WITH_REGION>`, có thể đọc và xuất vùng bằng một model | 0,23B, trọng số chính thức khoảng 463 MB; có bản chuyển ONNX cộng đồng | Nhiều graph/decoder; toàn ảnh làm số nhỏ mất chi tiết; vẫn là mô hình sinh | Microsoft MIT; cần ghim và kiểm bản chuyển đổi | Thử sau nhóm OCR gọn |
| **Qwen3-VL-2B-Instruct** | Nhận diện ngữ cảnh số đọc/sê-ri/đơn vị; ý kiến bổ sung cho ảnh khó | GGUF chính thức, CPU qua llama.cpp/Ollama; cần cả vision projector | Tích hợp nặng hơn OCR; có thể sinh số hợp lý nhưng sai, thiếu bằng chứng từng bánh | Model/code Apache-2.0 | Nhánh VLM tùy chọn, đường CPU rõ hơn |
| **Qwen3.5-2B** | Đối chứng VLM nhỏ mới hơn, đáng khảo sát nếu cần đọc ảnh linh hoạt | Model multimodal chính thức; lượng tử hóa là artifact/đường runtime cần kiểm riêng | Không có chứng cứ thắng trên công tơ; không coi model chat Qwen3 văn bản hiện có là model ảnh này | Model card Apache-2.0 | Nhánh VLM tùy chọn |
| **SmolVLM2-500M-Video-Instruct** | VLM nhỏ để kiểm tra giới hạn tài nguyên | Có ONNX trong kho chính thức và GGUF; CPU cần đo | Thiết kế ảnh/video tổng quát; chưa có bằng chứng về chỉ số công tơ | Model card Apache-2.0 | Dự phòng, chưa cần thử cùng lúc mọi VLM |
| **EasyOCR English generation 2** | CRNN/CTC độc lập, có allowlist và kết quả vùng/text/score | PyTorch CPU; có hướng train riêng. Chưa xác minh đường ONNX chính thức | Thêm detector chung chưa chắc giúp; không có trạng thái bánh quay chuyên biệt | Code Apache-2.0; điều khoản checkpoint riêng chưa xác minh | Đối chứng phụ |
| **Tesseract 5 + tessdata_fast** | Mốc đơn giản cho crop sạch, chi phí vận hành dễ hiểu | CPU; fast là model integer, muốn fine-tune phải bắt đầu từ best | Cần deskew/segmentation tốt; ít phù hợp làm hướng chính cho ảnh bánh cơ khó | Engine và fast data Apache-2.0 | Mốc phụ rẻ |
| **nliaudat digit_recognizer_v16, 10/100 lớp** | Bộ phân loại từng ô rất nhỏ; có lịch sử thử trong Trozy | Hai ONNX cộng khoảng 0,64 MB; cần detector/tách ô riêng | Mapping pha 100 lớp chưa được xác minh; không phải OCR toàn ảnh | Apache-2.0 được ghi nhận ở revision lịch sử; quyền dữ liệu train cần kiểm riêng | Chỉ xem xét lại sau khi chuẩn hóa crop/nhãn |

Nguồn trực tiếp cho từng nhóm: [OpenOCR và tài liệu triển khai](https://github.com/Topdu/OpenOCR/blob/main/docs/openocr.md), [fine-tune OpenOCR](https://github.com/Topdu/OpenOCR/blob/main/docs/finetune_rec.md), [PARSeq-tiny của tác giả](https://huggingface.co/baudm/parseq-tiny), [Paddle medium rec ONNX](https://huggingface.co/PaddlePaddle/PP-OCRv6_medium_rec_onnx), [Paddle medium det ONNX](https://huggingface.co/PaddlePaddle/PP-OCRv6_medium_det_onnx), [Florence chính thức](https://huggingface.co/microsoft/Florence-2-base-ft), [Florence chuyển ONNX](https://huggingface.co/onnx-community/Florence-2-base-ft), [Qwen3-VL GGUF chính thức](https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF), [Qwen3.5-2B chính thức](https://huggingface.co/Qwen/Qwen3.5-2B), [SmolVLM2 chính thức](https://huggingface.co/HuggingFaceTB/SmolVLM2-500M-Video-Instruct), [EasyOCR API](https://www.jaided.ai/easyocr/documentation/), [EasyOCR model hub](https://www.jaided.ai/easyocr/modelhub/), [Tesseract data](https://tesseract-ocr.github.io/tessdoc/Data-Files.html), [giấy phép fast data](https://github.com/tesseract-ocr/tessdata_fast).

Các bản ONNX/GGUF chuyển đổi phải được kiểm cùng tokenizer, preprocessing, hình học và decoder; có file chuyển đổi không có nghĩa là đổi một đường dẫn model trong Trozy là đủ.

### Trường hợp v16 đã thử trước đây

[Báo cáo lịch sử](../test/archive/meter-ocr/METER-DIGIT-MODEL-TRIAL.md) dùng 2 ảnh điện, mỗi ảnh khoanh tay 6 ô. Bản 10 lớp đọc ảnh rõ thành `007664`; ảnh khó ra `135110` nhưng thiếu nhãn chuẩn đáng tin. Thời gian khoảng 15–16 ms gồm khởi tạo model và đọc 6 ô **không gồm tìm vùng**. Bản 100 lớp giữ nguyên nhãn pha, chưa có decoder đã kiểm chứng. Không tìm thấy model v16 hay script trial tương ứng trong dự án hiện tại; đường dẫn ngoài dự án trong báo cáo cũ chỉ là bằng chứng lịch sử. Do đó không coi đây là ứng viên đang cài sẵn, cũng không so 15 ms này với 4,9–7,7 giây của luồng HTTP.

## 4. Những khác biệt ảnh hưởng trực tiếp tới quyết định

**Với điện:** RepSVTR hoặc PARSeq thay được phần đọc crop, không tự thay được logic chọn hàng số kWh. Chạy trước trên crop chuẩn để tách lỗi đọc khỏi lỗi tìm vùng. PP-OCRv6 medium giúp kiểm tra liệu model lớn hơn có cải thiện trên cùng crop; phép thử này chưa tự cô lập được ảnh hưởng của dữ liệu pretrain/fine-tune. So zero-shot riêng với fine-tune cùng dữ liệu/công sức; không kết luận một model thua chỉ vì đối thủ đã được train riêng cho Trozy.

**Với nước:** chữ số đang quay là trạng thái vật lý, còn vị trí phần lẻ là ý nghĩa của từng bánh. Ví dụ pha `3,7` của một bánh không có nghĩa chỉ số công tơ có thêm một chữ số thập phân. General OCR không mặc nhiên có giải mã truyền số. Nếu VisionState đọc tốt crop chuẩn nhưng luồng toàn ảnh vẫn thấp, đầu tư vào locator/rectification/tách ô trước. Có thể thử bộ đọc bánh hiện có trên crop điện như một thí nghiệm riêng; chưa có bằng chứng để đưa biến thể đó vào sản phẩm.

**Với VLM:** Qwen và Florence có thể cung cấp ngữ cảnh để phân biệt sê-ri/nhãn/chỉ số, nhưng JSON đúng mẫu hoặc hai model đồng ý vẫn có thể cùng sai. Không dùng câu “confidence 99%” do model sinh ra làm ngưỡng duyệt. Đo riêng ảnh gốc, crop và crop+kèm ảnh gốc; cố định độ phân giải, prompt, lượng tử hóa và giới hạn token. Qwen3-VL-2B GGUF Q4 có file LLM khoảng 1,11 GB và projector Q8 khoảng 445 MB; đó là dung lượng file, **không phải mức RAM cần thiết**. [Kho chính thức](https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF/tree/main).

## 5. Dữ liệu và giấy phép cần cân nhắc khi chọn hướng

Model có giấy phép code thoáng không đồng nghĩa trọng số và dữ liệu train có cùng điều khoản. Riêng baseline nước, card nguồn YOLO ghi MIT trong khi runtime Ultralytics có điều khoản AGPL/Enterprise riêng; VisionState ghi Apache-2.0. Cần đối chiếu đúng artifact và cách phát hành sản phẩm, không gộp cả nhánh thành “MIT”. Đây là ghi nhận điều khoản công bố, không phải kết luận pháp lý. [Card YOLO](https://huggingface.co/ntarekp/watermeter-yolov8-obb), [Ultralytics licensing](https://www.ultralytics.com/license).

Metadata dataset hiện tại còn đánh dấu các nhóm DL7981/Henrik `commercial_ok:false` và nhãn “Open Access”. Cần kiểm điều khoản từ nguồn gốc trước khi mở rộng sử dụng; metadata này tự nó chưa đủ kết luận quyền của model đã train. Không tự tải thêm dữ liệu trong lượt nghiên cứu.

UFPR-AMR/Copel-AMR sát bài toán nhưng bị giới hạn nghiên cứu học thuật/phi thương mại theo nguồn tác giả; Copel có cả ảnh hỏng/không đọc được, hữu ích để tham khảo cách thiết kế bài đo từ chối. AI-on-the-edge-device có kiến trúc bánh số đáng học, nhưng bản license hiện công bố là Dual Use, có yêu cầu thỏa thuận riêng cho thương mại. Không chọn các nguồn này làm đường tích hợp mặc định chỉ vì tải được. [Copel và điều khoản](https://github.com/raysonlaroca/copel-amr-dataset), [UFPR-AMR và điều khoản](https://github.com/raysonlaroca/ufpr-amr-dataset), [AI-on-edge license](https://github.com/jomjol/AI-on-the-edge-device/blob/main/Licence.md).

## 6. Hướng phát triển đề xuất

| Hướng | Khi phù hợp | Công việc cần làm trước | Đánh đổi |
| --- | --- | --- | --- |
| **A. Củng cố hai nhánh hiện tại** | Cần kết quả ổn định với ít thay đổi vận hành | Gold ảnh thật; tách lỗi locator/reader/layout; đo chi phí khởi tạo và queue | Tiết kiệm tích hợp nhưng vẫn phụ thuộc vùng số và dữ liệu hiện tại |
| **B. Thử reader gọn thay thế — đề xuất làm cùng A** | Muốn biết model khác có giúp trên ảnh khó không | RepSVTR, PARSeq-tiny, Paddle medium; cùng crop, cùng split; rồi thử toàn luồng | Cần adapter và có thể fine-tune; có khả năng chỉ cải thiện một nhóm đồng hồ |
| **C. Nhánh VLM hỗ trợ review** | Có nhu cầu ảnh đa dạng và chấp nhận thêm tài nguyên | Chọn một trong Qwen3-VL-2B/Qwen3.5-2B hoặc Florence; đo trên phần baseline từ chối và toàn tập | Tăng độ phức tạp, latency/RAM; cần kiểm soát đầu ra sinh và hiệu chuẩn chấp nhận |

Thứ tự nên làm: **gold + baseline → ba reader gọn → một VLM nếu vẫn cần**. Không cần cài cả 10 ứng viên cùng lúc. Giữ lại model chỉ khi nó tăng số **đề xuất đúng toàn chuỗi** ở mức sai-chấp-nhận tương đương, hoặc giảm đáng kể thời gian/tài nguyên. Không dùng mAP, OCR tài liệu, độ tin cậy trung bình hay độ đúng phần nguyên đơn lẻ để quyết định thay bộ đọc.

Trong mọi hướng, người thuê tiếp tục chỉ gửi ảnh; OCR tiếp tục là đề xuất và chủ nhà đối chiếu ảnh trước khi lưu. Bộ nghiên cứu không thay đổi chỉ số, hóa đơn hay quyền nghiệp vụ.

## 7. Bộ đánh giá dùng để chốt lựa chọn

[PROTOCOL.md](meter-ocr-evaluation-20261108/PROTOCOL.md) định nghĩa tập ảnh, nhãn, các chế độ thử, công thức đo, điều kiện thay model và cách báo cáo sai số. [assessment.json](meter-ocr-evaluation-20261108/assessment.json) lưu mốc model hiện tại, danh sách ứng viên và mẫu kết quả còn trống.

Một lần khảo sát tài liệu chỉ trả lời được **model nào đáng bỏ công thử và cần chuẩn bị gì**. Kết luận “khả thi hơn” về độ chính xác phải chờ kết quả trên bộ ảnh thật độc lập theo quy trình đó.
