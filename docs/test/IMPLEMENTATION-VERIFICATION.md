# Kết quả kiểm tra bản ứng dụng Trozy

## Bản hiện tại: OCR đọc, Vision bổ sung một ô thiếu

Mốc **30/10/2026**: **407 Node, 116 UI, 132 render và TypeScript/build đạt**. Bỏ so sánh cả dãy OCR/Vision; OCR đủ bằng chứng trả trực tiếp, Vision chỉ đọc đúng một ô thiếu đã xác định vị trí trước. Kiểm tra khung, chất lượng, đơn vị/phần lẻ, quyền và chủ nhà xác minh trước lưu vẫn giữ. Thông tin kỹ thuật nằm trong chi tiết.

Bốn HTTP/model cục bộ thật và một tác vụ đọc ô riêng có **98 hash nguồn khớp mã cuối**; xem [kiểm chứng OCR với một ô Vision bổ sung](METER-ASSISTED-VALIDATION.md). Các ảnh thật chưa có đề xuất đủ điều kiện; smoke đọc riêng ô được chỉ định thủ công trả chữ số nhưng cấu trúc ô/phần lẻ mâu thuẫn và đã bị từ chối. Chưa chứng minh bổ sung ô thành công toàn luồng trên ảnh thật. Các nhánh OCR trực tiếp/bổ sung một ô đạt kiểm thử có kiểm soát; không phải tỉ lệ chính xác chung. Không sửa dữ liệu nghiệp vụ thật.

## Lịch sử cùng ngày: một chỉ số đề xuất từ OCR và Vision so sánh

Mốc **30/10/2026**: **358 Node, 97 UI, 132 render và TypeScript/build đạt**. OCR tự tìm khung, Vision kiểm tra khung và đọc độc lập để tạo tối đa một đề xuất: khớp toàn bộ hoặc chỉ khác hàng đơn vị thì giữ OCR; đúng một ô OCR chưa đọc rõ chỉ được bổ sung khi Vision có bằng chứng ô rõ và các vị trí còn lại khớp. Chủ nhà vẫn xác minh trước lưu. Giao diện chính được thu gọn, bằng chứng kỹ thuật nằm trong phần chi tiết.

Bốn báo cáo HTTP cuối có **104 hash nguồn khớp mã cuối**; xem [kiểm chứng hợp nhất OCR và Vision](METER-RECONCILED-VALIDATION.md). Điện mẫu thiếu ô đỏ và bằng chứng Vision không khớp số ô; nước chưa chứng minh được ranh giới thập phân; ảnh người dùng `26762回` bị chặn vì vùng số 141 × 44 px; ảnh mờ bị chặn trước AI. **Chưa có đề xuất hợp lệ trên các ảnh thật trong mốc này**. Kiểm thử có kiểm soát đã xác nhận các nhánh tạo đề xuất; không phải phép đo độ chính xác model. Không sửa dữ liệu nghiệp vụ thật. Các mốc bên dưới là lịch sử.

## Lịch sử: OCR tự định vị, Vision chỉ kiểm tra khung

Mốc 29/10/2026: **302 Node, 81 UI, 132 render và build/TypeScript đạt**. Bốn lượt HTTP thật/ảnh mờ, nhánh tìm lại một lần và 72 hash nguồn được ghi tại [báo cáo kiểm tra khung OCR](METER-FRAME-VALIDATION.md). Cả ba ảnh thật còn `needs_review`; đây là kiểm chứng luồng và giới hạn, chưa phải đo độ chính xác. Các mốc bên dưới là lịch sử.

## Lịch sử: OCR chuyên công tơ

Đã chuyển B03 sang OCR cục bộ, không gọi Vision; một chỉ số đề xuất cho chủ nhà, profile công tơ có phiên bản và đọc lại ảnh pending. Người thuê vẫn chỉ chụp/gửi ảnh, không xem/chỉnh số. **246 Node, 58 UI, 132 render và TypeScript/build đạt.** Năm lượt HTTP thật và 80 hash nguồn khớp mã cuối được ghi tại [báo cáo OCR chuyên biệt](METER-OCR-SPECIALIZED.md). Ảnh điện rõ đề xuất 00766.4 kWh; ảnh nước nhiễu/ảnh khó chưa đủ điều kiện vẫn không có đề xuất. Không có tập đo độ chính xác chung hoặc model mới được huấn luyện.

Các kết quả và câu “hash khớp mã cuối” bên dưới là theo mã tại thời điểm mốc lịch sử tương ứng, không phải hash của bản OCR hiện tại.

## Lịch sử điều chỉnh: người thuê chỉ gửi ảnh

Đã đổi luồng thành chụp/chọn ảnh, kiểm tra kỹ thuật và gửi; OCR/Vision chạy nền sau gửi, chỉ chủ nhà nhận kết quả và thông báo. Người thuê không có trường sửa chỉ số hoặc dữ liệu nhận dạng trong receipt/list/bootstrap/export/lịch sử B03; chỉ số chưa chốt cũng không xuất hiện ở phía tenant. Chủ nhà đang mở tab hiện nhận cập nhật qua digest 10 giây và có nút mở trang ảnh công tơ.

**214 Node, 50 UI, 132 render và build đạt.** [Minh chứng ảnh thật](METER-PHOTO-ONLY-LIVE.json) xác nhận không chạy AI trước gửi, một lần đọc nền thật, thông báo riêng chủ nhà và dữ liệu tenant không lộ kết quả; [ảnh mờ](METER-PHOTO-ONLY-BLUR-LIVE.json) bị chặn trước gửi/AI. Cả hai hash khớp mã cuối. Các mốc phía dưới là lịch sử trước điều chỉnh giao diện/API này; không suy ra model đã đọc đúng mọi ảnh.

## Cập nhật luồng ảnh công tơ ngày 28/10/2026

Đã bổ sung camera có kiểm tra kỹ thuật trước chụp, kiểm tra vùng số trên server, quan sát từng ô/chuyển vòng, ảnh thật riêng biệt và người thuê gửi/chủ nhà xác minh. Xem hướng dẫn, ngưỡng heuristic, API, minh chứng và giới hạn ở [METER-CAPTURE-IMPROVEMENT.md](METER-CAPTURE-IMPROVEMENT.md). Các kết quả bên dưới giữ nguyên lịch sử của mốc 27/10; cơ chế xác nhận chỉ phần nguyên ở mốc cũ không còn là điều kiện chấp nhận hiện tại.

Mốc cuối: **204 Node**, **47 kiểm tra DOM**, **132 lượt render** và build đạt. Bốn báo cáo HTTP cuối có hash khớp mã: [điện](METER-CAPTURE-ELECTRIC-LIVE.json) và [nước](METER-CAPTURE-WATER-LIVE.json) vẫn `needs_review`, đã thử gửi và chủ nhà xác minh **thủ công** trong DB RAM; [ảnh mờ](METER-CAPTURE-BLUR-LIVE.json) bị yêu cầu chụp lại trước OCR/Vision; [ảnh điện khó](METER-CAPTURE-TRANSITION-LIVE.json) bị từ chối vì vùng số quá nhỏ trước Vision. Không ca nào tạo kết quả tự động đủ điều kiện xác nhận. Đây là kiểm tra tích hợp/cách từ chối, không phải bằng chứng đọc đúng mọi ảnh. [Bộ nhận dạng chuyên biệt](METER-DIGIT-MODEL-TRIAL.md) đã thử ngoại tuyến nhưng còn sai trên ảnh khó, chưa được bật để xác nhận hoặc tính tiền.

Không có kiểm thử phần cứng camera/trình duyệt điện thoại thật trong phiên này. Ngưỡng độ nét không bảo đảm các chữ số được đọc đúng; kết quả vẫn cần chủ nhà đối chiếu ảnh.

Ngày ghi nhận: **27/10/2026**. Phạm vi là mã ứng dụng trong `src/`, không phải hai prototype HTML ở `pa/`. Các lệnh dưới đây đã chạy thành công trong phiên triển khai; kết quả không thay thế nghiệm thu bằng thao tác người dùng trên trình duyệt.

| Kiểm tra | Kết quả đã ghi nhận | Phạm vi |
| --- | --- | --- |
| `npm test` | **98/98 test pass** | API, quyền, nghiệp vụ, B01–B04, số liệu/citation, OCR thật, tìm vùng/chuẩn hóa ảnh/đọc nhiều biến thể, đối chiếu phần nguyên, MIME ảnh khai báo sai, timeout, tệp và HTTP. |
| `npm run check:pages` | **132 lượt render pass** | Các trang theo vai trò/cơ sở, gồm trang trợ lý mới, dữ liệu API/SQLite thử nghiệm và dữ liệu rỗng. |
| `npm run check:ai-ui` | **19/19 kiểm tra tương tác React pass** | DOM trong bộ nhớ: xác nhận Vision/OCR, vùng tìm/góc nắn/lượt đọc, nhóm đen ổn định và đỏ chưa chắc, đối chiếu phần nguyên/chữ số, xung đột, thấp hơn kỳ trước, trạng thái model, phân loại, lịch sử/nguồn và xác nhận gửi nháp. Không phải trình duyệt thật. |
| `npm run ai:live-check` | **8/8 pass** | 7 lượt gọi Ollama thật với `qwen3:4b-instruct`, 1 lượt từ chối vượt quyền cục bộ; dùng dữ liệu tổng hợp riêng. |
| `npm run ai:vision-check -- …` | **3 lượt HTTP pass** | Một ảnh đồng hồ nước thực tế (toàn cảnh và chọn vùng) cùng một fixture điện tổng hợp; model `qwen3-vl:4b-instruct`, đúng dãy mong đợi, lịch sử/quyền/chỉ số cũ do server kiểm soát, không sửa nghiệp vụ. Không phải phép đo độ chính xác tổng thể. |
| OCR cải tiến, độc lập và hybrid | **Pass trên ảnh nước đã cung cấp** | OCR tự tìm hàng số nghiêng, đọc ổn định nhóm đen `00001` ở hai biến thể (94/93); phần đỏ và toàn hàng chưa ổn định. Hybrid qua HTTP xác nhận chỉ phần nguyên, không sửa dữ liệu nghiệp vụ. |
| `npm run build` | **Pass** | TypeScript và build Vite tạo `dist/`. |
| HTTP bản build thực tế | **200** cho HTML, bundle JavaScript, CSS và `/api/health` | Xác nhận Node phục vụ tài nguyên đã build bằng HTTP; không bao gồm chạy JavaScript hay tương tác trình duyệt. |
| `npm audit --omit=dev` | **0 lỗ hổng được báo ở dependencies production** | Kết quả tại thời điểm kiểm tra; không phải cam kết cho lần cài đặt tương lai hoặc dependencies phát triển. |

Các cập nhật dependency đi kèm kết quả audit gồm Nodemailer **10.2.1** và override `uuid` **11.x** cho ExcelJS. ExcelJS tạo chunk tải bất đồng bộ khoảng **937 kB**, chỉ nạp khi dùng nhập/tải mẫu Excel; đây vẫn là giới hạn dung lượng cần theo dõi.

Ollama portable **0.40.11** được tải từ bản phát hành chính thức và đối chiếu SHA256 trước khi chạy. Model văn bản `qwen3:4b-instruct` và ảnh `qwen3-vl:4b-instruct` đã tải; `/api/tags` và `/api/show` xác nhận có model/capability Vision. Runtime và model ở thư mục riêng `D:\TrozyLocalAI`, không nằm trong Git. Dùng tag `4b-instruct` rõ ràng: tag chung `qwen3-vl:4b` đã trỏ tới bản thinking trong lần thử và không hoàn tất phản hồi trong giới hạn. Bản tải thử đó đã được dọn, giữ model instruct đã kiểm chứng. Đây là trạng thái máy thử, không phải cam kết model tự có trên máy clone repo khác.

## Kết quả B01 đến B04

[AI-LIVE-EXAMPLES.json](AI-LIVE-EXAMPLES.json) ghi đầu vào/kết quả/độ trễ của các lần gọi model thật, `passed: true` và `businessRecordsUnchanged: true`. Các ví dụ gồm công nợ đúng số liệu, giải thích hóa đơn tenant, câu hỏi ngữ nghĩa về nội quy, máy lạnh chảy nước, nguy cơ ổ điện, soạn lịch cắt nước theo chi tiết cung cấp và B01 qua HTTP có lưu lịch sử riêng. Lượt từ chối truy cập phòng khác được xử lý cục bộ theo thiết kế.

Các phép tính tài chính vẫn thực hiện bằng code. Model không được phát minh nguồn/số tiền, thay đổi nghiệp vụ hoặc dùng số Unicode để tránh kiểm tra. Các kiểm thử còn bao gồm cảnh báo không bị tenant mới xóa, review hết hiệu lực khi chỉ số đổi, review kỳ cũ đúng quyền, hai ảnh điện/nước riêng và lịch sử theo tài khoản.

OCR chạy Tesseract thật trên vùng fixture công tơ tổng hợp: `012345` đọc thành `12345`, điểm nhận dạng văn bản khoảng **96**. Điểm này **không phải** xác suất đọc đúng công tơ. Ảnh nước người dùng đã cho thấy OCR văn bản rỗng vẫn có thể báo điểm 95; đã sửa về 0 và bỏ nhãn tin cậy gây hiểu nhầm trên kết quả chính.

Các lượt trước khi cải tiến tiền xử lý OCR: Vision thật qua API đọc ảnh nước thành `00001.056 m³`, phần nguyên `00001`, phần lẻ `056`, đề xuất form nguyên `1`, cả toàn cảnh và chọn vùng đều đúng mong đợi; thời gian khoảng **2,3–2,4 giây** khi model đã nạp. Lúc đó kết quả là `vision_only`. Xem [toàn cảnh](METER-VISION-LIVE.json) và [vùng chọn](METER-VISION-CROP-LIVE.json). [Fixture điện tổng hợp](METER-VISION-ELECTRIC-LIVE.json) đọc `012345 kWh`, đề xuất `12345`, khoảng 4 giây. Các JSON lưu SHA256, không lưu bản sao ảnh người dùng vào repo.

Sau cải tiến OCR: [lượt OCR độc lập](OCR-IMPROVEMENT-LIVE.json) không dùng Vision đã tự tìm vùng hàng số khoảng −9,7°, đọc nhóm đen `00001` ở hai biến thể với điểm văn bản **94 và 93**, khoảng **1,4 giây** trong lần ghi bằng chứng. Toàn hàng vẫn có các kết quả cạnh tranh (`00001056`, `00001096`, `80001096`); nhóm đỏ chưa ổn định nên không xác nhận `.056` bằng OCR. [Lượt hybrid qua HTTP](OCR-VISION-HYBRID-LIVE.json) ghi `engine:hybrid`, `agreementScope:integer`, khoảng 7,6 giây trong lượt nạp model khác; không so tốc độ trực tiếp với lượt đã nạp sẵn. Chỉ số/ảnh/lịch sử được kiểm tra quyền, không có bản ghi nghiệp vụ tự thay đổi. Chi tiết và cách chạy lại ở [OCR-IMPROVEMENT.md](OCR-IMPROVEMENT.md).

Đã sửa kiểm tra định dạng quá chặt khi ảnh PNG/WebP mang tên hoặc MIME JPEG: nhận diện dữ liệu ảnh thật, giữ giới hạn/giải mã đầy đủ ở cả OCR và Vision. Kiểm thử có PNG khai báo JPEG vẫn đọc `12345`, WebP khai báo PNG, JPEG khai báo WebP; ảnh cũ phục vụ đúng Content-Type sau kiểm tra quyền, upload mới lưu đúng MIME. GIF/SVG/HTML/PDF giả ảnh và dữ liệu hỏng vẫn bị từ chối; không thay đổi dữ liệu chỉ số khi đọc.

Ảnh nước đã được dùng để điều chỉnh prompt/phân nhóm số nên đây là kiểm tra hồi quy, **không phải tập đánh giá độc lập**. Một ảnh thật và fixture không đại diện cho mọi loại đồng hồ. Mặt kim chính cần đọc thủ công; mờ/lóa, số đang chuyển, đơn vị hoặc thập phân chưa rõ phải kiểm tra. Form nghiệp vụ hiện dùng đơn vị nguyên và luôn yêu cầu xác nhận; dãy thập phân được giữ trong kết quả/ảnh. Kế hoạch đo chất lượng trên thiết bị/ảnh mới ở [METER-EVALUATION.md](METER-EVALUATION.md).

Kiểm tra React trong bộ nhớ phát hiện và đã sửa lỗi xác nhận OCR có thể áp dụng nhiều lần; bước xác nhận hiện được tiêu thụ sau mỗi lần áp dụng. Cũng kiểm tra nội dung model được escape, nguồn chỉ mở trang cho phép và bản nháp chỉ tạo thông báo sau xác nhận rõ ràng. Chưa có bằng chứng kiểm tra hình thức bố cục trên màn hình thật.

## Những hành vi đã có kiểm thử tự động

- Tài khoản/session, lời mời tenant, token xác thực/đặt lại mật khẩu và thu hồi phiên; Origin và bảo vệ truy cập chưa đăng nhập.
- Cách ly chủ trọ và tenant cùng một chủ trọ; quyền file riêng và dữ liệu sau trả phòng; ngăn gán trường chủ sở hữu/người thuê/giá phí trái quyền.
- Hợp đồng, hóa đơn nháp/phát hành/điều chỉnh; kiểm tra dòng dịch vụ, phí xe, chỉ số, trùng kỳ và snapshot lịch sử.
- Thanh toán từng phần/dư, phân bổ tiền dư cùng tenant, hoàn số dư/hoàn phần đã phân bổ; bảo toàn số đã trả, số dư và dòng tiền, không nhận tiền hai lần khi chỉ phân bổ.
- Cọc và quyết toán; chống phát lại biên bản cũ làm trống phòng đã cho thuê lại; chi phí bảo trì đã ghi sổ không thay đổi ngầm.
- Luồng bảo trì hai bên, ticket và đọc thông báo; nhắc hạn chống trùng; đa phòng đúng cơ sở; tài sản đúng phòng; template/phiên bản tài liệu.
- Mã hóa số giấy tờ, mở lại database và khôi phục từ snapshot SQLite/khóa; import lỗi rollback cả lô.
- Ảnh đại diện/thư viện phòng và tùy chọn thông báo. SMTP được kiểm thử bằng transport thay thế, gồm cấu hình TLS và trạng thái thành công/thất bại; chưa gửi xác minh bằng tài khoản SMTP thật.
- Static handler phục vụ HTML/CSS/module/chunk đúng MIME/cache, HEAD, security headers, từ chối ghi tệp; không lộ backend/tệp ngoài thư mục build qua các đường dẫn traversal được thử. URL mã hóa sai trả lỗi client 400.

Test static dùng thư mục build-shaped tạm để `npm test` không phụ thuộc `npm run build`. Các fixture được xóa sau khi kiểm tra đường dẫn tuyệt đối; không thao tác database demo đang sử dụng.

## Giới hạn xác minh giao diện

**Chưa xác nhận kiểm thử tương tác hoặc kiểm tra hình ảnh bằng trình duyệt.** Công cụ CUA không xác thực được URL Windows cục bộ trong phiên kiểm tra, nên không có ảnh chụp giao diện hay bằng chứng kiểm tra bố cục bằng mắt. Không dùng công cụ trình duyệt thay thế để vượt giới hạn này.

132 lượt render là kiểm tra HTML phía server; 19 kiểm tra React là tương tác DOM trong bộ nhớ. Chúng không xác nhận responsive, độ tương phản, focus/upload/download thực tế hay quy trình end-to-end trong trình duyệt. Các mục này cần được kiểm tra riêng trên desktop/mobile trước nghiệm thu UI.

Chưa có bằng chứng kiểm thử tải, hosting công khai, SMTP thật, ngân hàng đối soát tự động hoặc tập đánh giá đại diện cho độ chính xác model/OCR. B01–B04 có triển khai và bằng chứng giới hạn ở trên; B05 chưa triển khai.
