# Thử bộ nhận dạng chữ số công tơ chuyên biệt

Ngày kiểm tra: 28/10/2026. Đây là thử nghiệm ngoại tuyến trên hai ảnh đã biết, không phải đo độ chính xác trên tập độc lập và không phải model đang xác nhận chỉ số trong ứng dụng.

## Artifact và cách chạy

Đã chạy hai model ONNX `digit_recognizer_v16`, 10 và 100 lớp, từ [nliaudat/digit_recognizer](https://github.com/nliaudat/digit_recognizer) tại commit `3f11e197d3111ec7e7fb5daae3f58a4b98f80268`. File model giữ nguyên trên D, không được đưa vào repository. Hai model cộng lại 639.926 byte; không cài TensorFlow hay tải tập ảnh huấn luyện. Thử nghiệm dùng ONNX Runtime CPU có sẵn, hai luồng, đầu vào RGB `float32 /255`, nội suy bilinear và NCHW `[1,3,32,20]` theo đường ONNX upstream.

| Artifact | SHA-256 |
| --- | --- |
| `v16-10cls.onnx` | `40da71350f10902eddf8fe49311aedfb4866b60abb3fee582beabf0407037147` |
| `v16-100cls.onnx` | `6c3f5eecefc06382fbb486fe55d7e0c9d93dee3a8b3d77dbeb40bac6af68ddb3` |

`scripts/setup-meter-digit-trial.ps1` tải đúng revision, kiểm tra hash và giữ nguyên file đã có; mặc định dùng `D:\TrozyOCRTrial\amr-prototype`. Bộ kiểm tra `scripts/check-meter-digit-model.py` nhận **khung từng ô đánh dấu thủ công** trên ảnh gốc sau EXIF; chưa có detector tự động nào được suy ra từ thử nghiệm này. Ảnh và vùng cắt chỉ nằm trong RAM. JSON lưu hash, khung ô, cấu hình và ba lớp đầu; không chứa ảnh/base64.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/setup-meter-digit-trial.ps1
$env:PYTHONDONTWRITEBYTECODE='1'
$env:TEMP='D:\TrozyOCRTrial\tmp'
$env:TMP=$env:TEMP
& 'D:\TrozyOCRTrial\python\python.exe' -B scripts/check-meter-digit-model.py --model 'D:\TrozyOCRTrial\amr-prototype\v16-10cls.onnx' --file 'E:\Downloads\images (5).jpg' --cells '137,275,20,29;161,273,20,29;185,272,20,29;209,270,20,29;233,268,20,29;258,267,20,29'
```

## Kết quả thực tế

| Ảnh / model | Các lớp cao nhất theo ô | Khoảng điểm top-1 | Thời gian khởi tạo và suy luận 6 ô | Minh chứng |
| --- | --- | --- | --- | --- |
| Điện rõ `images (5).jpg`, 10 lớp | `0,0,7,6,6,4` | 0,943–0,999 | 15 ms | [JSON](METER-DIGIT-TRIAL-ELECTRIC-5-10.json) |
| Cùng ảnh, 100 lớp | `0,0,68,59,59,39` | 0,226–0,710 | 16 ms | [JSON](METER-DIGIT-TRIAL-ELECTRIC-5-100.json) |
| Điện khó `cach_xem_cac_loai_dong_ho_dien_4_ae698dd3b1.jpg`, 10 lớp | `1,3,5,1,1,0` | 0,728–0,985 | 16 ms | [JSON](METER-DIGIT-TRIAL-ELECTRIC-OPEN-10.json) |
| Cùng ảnh khó, 100 lớp | `12,30,61,15,2,97` | 0,142–0,473 | 16 ms | [JSON](METER-DIGIT-TRIAL-ELECTRIC-OPEN-100.json) |

Ảnh rõ cho chuỗi 10 lớp phù hợp mẫu đã kiểm tra trước đó, nhưng ảnh khó chưa có kết quả đủ thuyết phục. Vùng cắt thủ công, góc nhìn và sự khác biệt dữ liệu huấn luyện đều có thể ảnh hưởng. Điểm softmax cao không bảo đảm ô được đọc đúng. Không chuyển các nhãn 100 lớp thành chữ số/phần chuyển vòng khi chưa xác minh đầy đủ quy tắc gán nhãn và hiệu chỉnh trên mẫu công tơ địa phương. Upstream có nhiều quy ước gán nhãn chuyển số; không áp dụng một quy tắc chung cho mọi bộ đếm.

Mọi báo cáo đều có `mode=experimental_observations_only`, `confirmedReading=null`, `billingEnabled=false`. Script không nhập module nghiệp vụ hoặc kết nối cơ sở dữ liệu, và chặn kết nối mạng trong lúc chạy. Kết quả này chưa đủ để thay PaddleOCR hoặc bỏ điều kiện đối chiếu OCR/Vision; model chỉ được giữ làm công cụ thử nghiệm.

## Bản quyền và giới hạn tiếp theo

[License của repository upstream](https://github.com/nliaudat/digit_recognizer/blob/3f11e197d3111ec7e7fb5daae3f58a4b98f80268/license.md) công bố Apache-2.0; bản nguyên văn được giữ ở [licenses/Digit-Recognizer-Apache-2.0.txt](../../licenses/Digit-Recognizer-Apache-2.0.txt) và cạnh model trên D. README và cấu hình huấn luyện nguyên bản cũng được giữ cạnh model; tác giả upstream được ghi nhận trong `THIRD-PARTY-NOTICES.md`. Đây là tuyên bố cấp phép tại repository, chưa phải kết luận riêng về quyền của toàn bộ dữ liệu huấn luyện có nguồn gốc khác.

Đã xem các lựa chọn khác: [UFPR-AMR](https://web.inf.ufpr.br/vri/databases/ufpr-amr/) giới hạn nghiên cứu học thuật phi thương mại và yêu cầu đăng ký; [AI-on-the-edge-device](https://github.com/jomjol/AI-on-the-edge-device/blob/main/Licence.md) có điều khoản riêng cho sử dụng thương mại. Không sao chép dữ liệu hoặc tích hợp các model đó vào ứng dụng. Chưa huấn luyện model mới và chưa công bố chỉ số chính xác chung. Trước khi dùng model chuyên biệt để xác nhận dữ liệu thật cần bộ ảnh có quyền sử dụng, nhãn từng ô và trạng thái chuyển vòng, tách tập theo công tơ, đồng thời đo tỷ lệ xác nhận sai và tỷ lệ từ chối trên tập chưa dùng để chỉnh model.
