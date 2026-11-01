# Third party notices

## Impeccable design skill (2026-11-01)

The project-local skill in `skills/impeccable/` was copied from the user's `E:\Downloads\impeccable-main` checkout, skill version 4.8.0. It supplies design guidance for the Trozy rose redesign and is a development resource, not a browser runtime dependency. Its complete Apache-2.0 license is retained at [skills/impeccable/LICENSE](skills/impeccable/LICENSE). Launch it through `scripts/impeccable.ps1` to keep downloaded engines and temporary files inside this project. The engine was unavailable during this redesign, so the skill's documented direct-reading fallback was used.

The previous OCR/vision pipeline was removed on 2026-10-31. Its attribution below is retained as historical evidence. A separate offline YOLO + VisionState trial was subsequently authorized, followed by the owner-guided production integration documented in docs/METER-READER.md. The previous pipeline remains removed.

## YOLO + VisionState trial and owner-guided integration (2026-10-31)

The trial uses `wheels-v2.onnx` from [oleost/visionstate-wheel-reader](https://huggingface.co/oleost/visionstate-wheel-reader), revision `563f365a5b377c10c7248517ef2576ac5cee3cbf`, SHA-256 `5644705e1f0e684b30bf3c7a6cb23e7eb1ddda616cd16b5321423f45bf7fd8b6`. Its model card declares Apache-2.0. The original license is retained in [licenses/VisionState-Apache-2.0.txt](licenses/VisionState-Apache-2.0.txt). `scripts/meter-trial/wheel_reader.py` adapts VisionState preprocessing and mechanical decoding; `src/ai/meter_wheels.py` ports that verified implementation into the owner-guided application. Their headers identify the origin and Trozy modifications. Upstream weights are unmodified.

Window detection uses `stage1_meter_window_digits.pt` from [ntarekp/watermeter-yolov8-obb](https://huggingface.co/ntarekp/watermeter-yolov8-obb), revision `c00b2752e3ad762eb269a05e1dceb28f48c1f27b`, SHA-256 `f2882a477bc12ecc5526cf73438d254945271c3e1b2b4214aa8e4deb637c3be9`. The model card declares MIT. This is separate from the installed Ultralytics software's license; its original license and the CPU runtime dependency notices remain in their installed packages inside `.runtime/meter-digits/visionstate-yolo/`.

The trial does not claim authorship of upstream models, calibrated accuracy, endorsement or verified business readings. Source images and provisional annotations are kept separate from model outputs. No training images or extra datasets were downloaded. Model hashes, dependency versions and results are recorded in `docs/test/visionstate-yolo-20261031/`.

The Trozy UI uses design guidance and component patterns from evondevKit (`D:\UI_UX`, https://github.com/evondev/evondevKit), adapted for this React application. The following license notice is retained for those materials.

MIT License

Copyright (c) 2026 Tuấn Trần

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Runtime and build dependencies (React, Vite, TypeScript, Lucide, ExcelJS, Nodemailer, Tesseract.js, the English Tesseract trained data, Sharp and transitive packages) retain their own license files in their distributed packages. Versions are recorded in package-lock.json. Trozy's illustrations and favicon are project-local SVG/CSS assets. Synthetic OCR fixtures are generated specifically for testing and contain no user photographs.

The optional portable Ollama runtime is downloaded from its official releases with SHA256 verification and is stored outside the repository. The Qwen3 model is separately downloaded to the selected local model directory; its license is provided with the model and on the [official Ollama model page](https://ollama.com/library/qwen3:4b-instruct). Runtime and model files are not vendored into this source repository.

## PaddleOCR code and PP-OCRv6 model weights

As of 2026-11-01 Trozy's electric-meter reader uses **PaddleOCR**, Copyright PaddlePaddle Authors, with the official **PP-OCRv6_small_det** and **PP-OCRv6_small_rec** ONNX inference models. Water continues to use YOLO + VisionState. Upstream packages are installed unmodified and retain their original notices. The 2026-10-27 reports describe an earlier runtime; current artifacts are pinned below and in `.runtime/paddleocr/runtime-manifest.json`.

| Component | Version / artifact | License source |
| --- | --- | --- |
| PaddleOCR Python package | `3.7.0` | [Upstream v3.7.0 LICENSE](https://github.com/PaddlePaddle/PaddleOCR/blob/v3.7.0/LICENSE), Apache-2.0 |
| Detection model weights | `PP-OCRv6_small_det_onnx` | [Official PaddlePaddle model card](https://huggingface.co/PaddlePaddle/PP-OCRv6_small_det_onnx), explicitly `apache-2.0` |
| Recognition model weights | `PP-OCRv6_small_rec_onnx` | [Official PaddlePaddle model card](https://huggingface.co/PaddlePaddle/PP-OCRv6_small_rec_onnx), explicitly `apache-2.0` |
| PaddleX inference pipeline | `3.7.2` | [Upstream v3.7.2 LICENSE](https://github.com/PaddlePaddle/PaddleX/blob/v3.7.2/LICENSE), Apache-2.0 |
| ONNX Runtime CPU | `1.23.2` | [Upstream LICENSE](https://github.com/microsoft/onnxruntime/blob/v1.23.2/LICENSE), MIT; Copyright (c) Microsoft Corporation |
| Portable CPython, shared with water reader | `3.12.10` | [Python 3.12.10 license](https://docs.python.org/release/3.12.10/license.html), Python Software Foundation License Version 2 and included historical notices |

The complete Apache-2.0 license is retained at [licenses/PaddleOCR-Apache-2.0.txt](licenses/PaddleOCR-Apache-2.0.txt), copied byte-for-byte from the user's upstream PaddleOCR source `LICENSE` (SHA-256 `3840c5c0c61c294264d2dd77b8777be6ddd90121ef4e0e64abcd22edea581d6e`). The complete ONNX Runtime MIT notice is retained at [licenses/ONNX-Runtime-MIT.txt](licenses/ONNX-Runtime-MIT.txt). No top-level `NOTICE` file was present in that PaddleOCR checkout; this document is Trozy's attribution, not an invented upstream NOTICE.

The current installer obtains official model files from pinned PaddlePaddle Hugging Face revisions. The SHA-256 values identify `inference.onnx` and match the historical official-archive artifacts:

| Weight | Official download | SHA-256 of `inference.onnx` |
| --- | --- | --- |
| `PP-OCRv6_small_det` | [Official detection files, revision 28fe5895c24fd108c19eb3e8479f4ab385fbfc62](https://huggingface.co/PaddlePaddle/PP-OCRv6_small_det_onnx/tree/28fe5895c24fd108c19eb3e8479f4ab385fbfc62) | `d73e0058b7a8086bbd57f3d10b8bcd4ff95363f67e06e2762b5e814fe9c9410e` |
| `PP-OCRv6_small_rec` | [Official recognition files, revision b8f84f0b80c529de40b4fbb3544b84fa7233a513](https://huggingface.co/PaddlePaddle/PP-OCRv6_small_rec_onnx/tree/b8f84f0b80c529de40b4fbb3544b84fa7233a513) | `5435fd747c9e0efe15a96d0b378d5bd157e9492ed8fd80edf08f30d02fa24634` |

The recognition hash also matches the [official model file's published SHA-256](https://huggingface.co/PaddlePaddle/PP-OCRv6_small_rec_onnx/blob/main/inference.onnx). Model license declarations were checked separately from the code license; Trozy does not infer a weight license solely from the repository's code license.

Trozy adds its own Node/Python adapter, bounded image processing, utility-specific dispatch, OCR observation/spatial checks and confirmation UI. Upstream PaddleOCR/PaddleX code and model weights are installed unmodified; the runtime imports the project-local package, not the user's downloaded source checkout. Trozy does not claim model authorship or endorsement from PaddlePaddle. Runtime/model files are stored inside the project under ignored `.runtime/` paths and are not bundled into the source distribution. Paddle dependencies are isolated in `.runtime/paddleocr/site-packages`; they do not replace the water reader's packages.

If redistributing a package containing these third-party works, include the corresponding license texts, preserve applicable copyright/attribution notices and any NOTICE files supplied by those packages, and mark any upstream files that are modified. Keep upstream dependency license files, including bundled third-party notices, when packaging the external Python environment. The setup entry point copies this attribution and the retained license texts alongside that environment; this does not replace the licenses supplied in installed packages. Apache-2.0 does not grant use of upstream trademarks.

Research acknowledgments requested by upstream: [PaddleOCR 3.0 Technical Report](https://arxiv.org/abs/2507.05595), [PaddleOCR-VL](https://arxiv.org/abs/2510.14528), and the model-specific [PP-OCRv6 technical report](https://arxiv.org/abs/2606.13108). Trozy uses PP-OCRv6 small for electric OCR, not PaddleOCR-VL or Qwen3-VL meter recognition. The upstream citation request is recorded separately from the Apache license conditions.

## Optional experimental rotating-digit models

The offline experiment `scripts/check-meter-digit-model.py` evaluates unmodified `digit_recognizer_v16` ONNX artifacts (10 and 100 classes) from [nliaudat/digit_recognizer](https://github.com/nliaudat/digit_recognizer/tree/3f11e197d3111ec7e7fb5daae3f58a4b98f80268), credited to that project's authors and contributors. The exact revision is `3f11e197d3111ec7e7fb5daae3f58a4b98f80268`. Its repository declares [Apache-2.0](https://github.com/nliaudat/digit_recognizer/blob/3f11e197d3111ec7e7fb5daae3f58a4b98f80268/license.md); that license text is retained unchanged at [licenses/Digit-Recognizer-Apache-2.0.txt](licenses/Digit-Recognizer-Apache-2.0.txt), SHA-256 `c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4`, and beside the external trial models. No separate upstream NOTICE file was identified for these artifacts. Trozy does not claim authorship, model accuracy on its own data, or upstream endorsement.

These weights are not bundled with source and are not used to confirm or bill a reading. The optional installer pins each model hash; the experiment retains upstream README and training metadata alongside them. The upstream repository describes training-data lineage from other projects. A repository license declaration does not establish all underlying training-data permissions; those and local validation remain to be reviewed before production use. Trial scope, artifact hashes and actual results are recorded in [docs/test/METER-DIGIT-MODEL-TRIAL.md](docs/test/METER-DIGIT-MODEL-TRIAL.md). No third-party training images were downloaded, and the test script stores no copies of user photographs or cell crops. Redistribution of the external environment must preserve its upstream license and notices.
