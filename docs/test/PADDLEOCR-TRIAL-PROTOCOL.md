# Local PaddleOCR trial protocol

This is a bounded local comparison of PaddleOCR with the existing Tesseract `recognizeMeter` function. It does not integrate PaddleOCR into the app, change the app dependencies, call Vision/Ollama, save a reading, or generate a bill. The trial can identify useful text evidence on the supplied photos; it cannot establish accuracy on new meters.

## Scope and evidence

- Keep the original photo files unchanged. Record a SHA-256 hash for each original and every derived image. Prepare EXIF-oriented color images with transparency flattened onto white. Use PNG, or lossless WebP when PNG exceeds the app's 5 MiB input limit. Both engines receive the same prepared bytes for each compared variant. Do not resize or use lossy recompression; explicitly skip a variant that still exceeds the limit.
- Run the original photo and fixed 90°/270° rotations. Rotation is an explicit image transform, separate from any orientation feature in an engine. Report each variant separately; do not select a successful orientation using the answer.
- A crop is permitted only when its rectangle is explicitly declared in the manifest before the run. Label it `human-assisted`. Report it separately from full-photo results; success on a crop is not automatic meter-window detection.
- Keep `previous: 0` for Tesseract. Do not use a previous reading, expected consumption, or expected text to rank or repair recognition.
- Preserve raw text, each detected PaddleOCR line, confidence and polygon, all Tesseract candidates, register/color-group evidence, warnings, errors, timings, and available memory measurements. Keep leading zeros as strings. Do not coerce a display string to a number.
- Keep the manual reference's integer digits, fractional digits, unit and color-group metadata separate. A concatenated digit match is only a diagnostic: it does not prove the fractional boundary, color groups, unit, correct register, or billing value.
- Keep every requested case, including empty detections, timeouts and errors. Repeated orientations and crops of one photo are correlated variants, not additional independent meters.

## Manifest

Store photos, Python environment/models, prepared images, logs and result JSON in the explicit external trial directory, for example `D:\TrozyOCRTrial`. Do not create temporary copies or a package/model cache on C:. The reusable script has no user-specific photo-path defaults. Relative input photo paths are resolved against the manifest's directory.

The input manifest contains a `samples` array. Each sample needs a unique `id`, `path`, and `utility` (`water` or `electric`). `expected` is either `null` or a manual reference with **string** fields `integerDigits`, `fractionalDigits`, and `unit` (which may be `null`). Optional metadata such as `deviceId`, `conditions`, `colorGroups`, `referenceNotes` and `source` is retained in the report. A manual reference is evaluation data only and must never be sent to either OCR engine.

Set `kind` to `physical_meter`, `synthetic_fixture` or `negative_control` to distinguish actual devices from generated inputs. Unclassified images are counted separately, never assumed to be physical meters. `deviceId` groups photos from the same physical device.

Example structure, with illustrative data rather than a claim about an actual photo:

```json
{
  "samples": [
    {
      "id": "water-example",
      "path": "photos/water-example.jpg",
      "utility": "water",
      "kind": "physical_meter",
      "deviceId": "water-example-device",
      "rotations": [0, 90, 270],
      "expected": {
        "integerDigits": "00123",
        "fractionalDigits": "456",
        "unit": "m3"
      },
      "colorGroups": [
        { "role": "integer", "color": "black", "digits": "00123" },
        { "role": "fractional", "color": "red", "digits": "456" }
      ],
      "manualCrops": [
        {
          "id": "register-window",
          "rotationDegrees": 0,
          "rectangle": { "left": 100, "top": 120, "width": 600, "height": 160 },
          "note": "Human selected the display window before OCR."
        }
      ]
    }
  ]
}
```

Crop coordinates refer to the decoded, EXIF-oriented source photo, before the explicit 90°/270° trial rotations. Only crop rectangles within that image are valid. A crop that excludes the unit is not evidence that the engine recognized the unit.

## Run the benchmark

After the isolated Python environment, local PaddleOCR source and local detection/recognition model directories exist, run the harness from the repository root. These paths are examples; substitute the actual local paths. Creating or downloading the environment/models is a separate setup step, not something the harness performs.

The optional Windows setup script downloads portable CPython and pinned OCR packages/models into the dedicated D: trial directory. It does not install a system Python, change PATH or add app dependencies. This setup step requires network access; inference uses local models. The reusable scripts are trial tools, not a production OCR service.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-paddle-trial.ps1
```

```powershell
node scripts/benchmark-paddle-ocr.mjs `
  --manifest 'D:\TrozyOCRTrial\work\manifest.json' `
  --python 'D:\TrozyOCRTrial\python\python.exe' `
  --source '..\PaddleOCR-main' `
  --det-model 'D:\TrozyOCRTrial\models\PP-OCRv6_small_det_onnx_infer' `
  --rec-model 'D:\TrozyOCRTrial\models\PP-OCRv6_small_rec_onnx_infer' `
  --work-dir 'D:\TrozyOCRTrial\work' `
  --output 'docs/test/PADDLEOCR-TRIAL.json' `
  --threads 4
```

The runner defaults to `scripts/paddle-ocr-trial.py`; `--runner` can select another compatible runner. The harness creates a unique `benchmark-*` directory under `--work-dir`, containing prepared images, `paddle-input.json`, `paddle-raw.json` and Python stdout/stderr logs. Its neutral runner input contains only `samples: [{id, path}]`. Temporary-directory environment variables for the OCR processes point to that run directory. The comparison report retains the manual reference and metadata, while the engines receive neither.

The fixed limits are 10 source photos, 30 total variants, at most three explicitly declared crops per photo, and rotations chosen only from 0/90/270. Paddle's `--threads` must be 1–8. On Windows, the harness requires `--work-dir` to be on D: for this trial. The Python subprocess timeout defaults to 900,000 ms and can be set with `--timeout-ms` (5,000–3,600,000 ms). The current Tesseract function retains its existing per-call timeout. A report checkpoint is written after each Tesseract case; the final report also records runner failures and byte-hash mismatches. The CLI exits nonzero for engine/preparation failures or invalid/missing Paddle output. A 5 MiB limit skip is counted separately from recognition failures.

The final JSON includes source and prepared hashes, source code hashes, hardware/runtime information, complete engine output, and per-observation diagnostics. `normalizedConcatMatch` means that one entire observed string equals the reference after removing non-digits. It does not select or repair a reading, join arbitrary fragments, or claim whole-reading accuracy. Individual observations and their transformation remain visible beside that flag.

This diagnostic also retains digits embedded in unit labels such as `m3`, so a false flag does not necessarily mean the counter digits are wrong. `unitTextPresent` is only a substring check and can match a flow-rate unit (`m3/h`). Inspect the raw text and polygons before drawing any conclusion about the register or unit.

## Runtime and reporting

Use only locally installed models and language data. Record the Node, Python, Paddle/PaddleOCR and Tesseract versions, selected model directories and settings. Distinguish model download/setup time, process/model initialization time, and per-image inference time. Report cold and warm measurements under their actual labels; do not compare a warm Python inference measurement with Tesseract's full subprocess elapsed time as if they measured the same work.

Run the engines sequentially and bound the sample count, variant count and subprocess timeout. Fix the variant set and model settings before execution. Save an engine's complete structured output before producing diagnostics. Paddle's CPU thread count is explicit; Tesseract uses the current application's engine-specific defaults, so this trial does not claim identical thread settings. The report should state which memory measurements include child processes and whether a reported peak is sampled RSS or an operating-system peak. Do not substitute the parent Node process's memory for Tesseract worker memory.

The harness invokes `recognizeMeter` directly and closes its worker resources when finished. It does not start the HTTP app or open a database. PaddleOCR runs through an isolated Python runner, with inputs containing image paths and opaque case IDs, not expected labels. The harness keeps Python raw output alongside the final comparison report.

For every variant, show text evidence from each engine before any diagnostic match flag. A digit token exactly matching a manual reference is recorded as an observed token match. A match formed by joining neighboring OCR lines, stripping separators, or joining integer/fractional groups must be labeled with that transformation. Do not search arbitrary subsets or reorder OCR lines to manufacture a match. The comparison must not invent a PaddleOCR billing suggestion or reinterpret OCR confidence as a probability of a correct reading.

Do not publish a general accuracy percentage from the small supplied set. Report the number of photos and physical devices, per-case success/failure evidence, rotation/crop dependence, leading-zero loss, integer/fractional ambiguity, unit evidence, latency and memory limitations. Any decision to integrate an engine needs a separate task and a held-out device-level evaluation, as described in [METER-EVALUATION.md](METER-EVALUATION.md).

## Cleanup

Track trial-created files and directories. Delete only trial-created temporary files; do not remove pre-existing user files, photos, environments or caches. Keep the requested reusable benchmark code, protocol and reviewable result report. Record where retained environment/models and results live, and list any trial-created temporary material removed from C:. A trial must not claim that C: is clean merely because a broad directory deletion was attempted.
