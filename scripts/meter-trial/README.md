# Offline YOLO + VisionState trial

This is a feasibility harness, separate from the Trozy app. It never opens a database or applies a reading. Tenant photo submission and landlord manual verification remain the active app flow.

Prepared Python and model files live in `.runtime/meter-digits/visionstate-yolo/`. Cache and temporary files remain in the project. No inference call downloads a missing model. See [the report](../../docs/test/VISIONSTATE-YOLO-TRIAL-20261031.md) for limitations, provisional labels, observed failures and exact model revisions.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/meter-trial/run-trial.ps1 -Output docs/test/visionstate-yolo-20261031/new-run -Controls -OrientationDiagnostics
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/meter-trial/run-trial.ps1 -Refinement -Output docs/test/visionstate-yolo-20261031/new-refinement
```

Use a new output directory for each run. The refinement experiment consumes the frozen baseline detections, verifies their source/label hashes, and never receives reference digits. Its result must be reported separately from the initial pipeline.

Tests use the prepared interpreter and make no downloads:

```powershell
.runtime/meter-digits/visionstate-yolo/python/python.exe -B tests/meter-trial-wheel.test.py
.runtime/meter-digits/visionstate-yolo/python/python.exe -B tests/meter-trial-yolo.test.py
.runtime/meter-digits/visionstate-yolo/python/python.exe -B tests/meter-trial-row.test.py
```

If preparing a fresh machine, `setup-runtime.ps1` requires a distinct directory beneath project `tmp/` via `-TaskDirectory`. It obtains official CPU dependencies and verifies pinned model/Python archive hashes. Preserve the resulting models/runtime and remove only that task's temporary directory after verification. Do not delete existing runtime/model directories to repeat a trial.
