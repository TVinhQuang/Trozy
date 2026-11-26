# Manual period-consumption entry — 2026-11-01

The user clarified that the screenshot's `1200` meant electricity consumed during the month. The existing fields represented cumulative meter readings, and their ambiguous “old/new” labels led to a decreasing counter being submitted.

## Implemented

- Added `MeterReadingEntry` to the landlord's manual reading editor. The default **Chỉ số trên công tơ** method labels cumulative start/end values and displays their difference as period usage.
- Added **Lượng tiêu thụ kỳ này** for nonnegative monthly quantities. Starts and calculated ends are read-only in this method. The saved canonical end is start + quantity: for example `9000 + 1200 = 10200`, even if the prior period's usage was `8000`.
- Explicitly explains that the start is the cumulative meter baseline, not the previous month's usage, and that calculated ends must be compared with the meter/photo before confirmation.
- Changing values or method clears confirmation and stale validation. Switching methods preserves a valid interval; selecting consumption after an invalid unsaved decrease resets that interval to zero usage for explicit re-entry. Room/period changes and a fresh modal default to cumulative entry.
- Empty, nonfinite, negative and decreasing-cumulative values are rejected before upload/save. Zero usage remains valid. Direct form submission cannot bypass the existing confirmation requirement.
- Preserved existing API storage, billing formula, baseline continuity, invoice immutability, tenant photo-only submission and landlord image verification. Historical data is not reinterpreted. Meter rollover/replacement/reset is outside this clarified request and has not been introduced.

## Verification

| Check | Result |
| --- | --- |
| `npm.cmd run check:readings-entry` | 6 groups passed |
| `node scripts/run-project.mjs --test tests/reading-consumption.test.mjs` | 2 integration tests passed |
| `npm.cmd test` | 151 passed, 0 failed, 0 skipped |
| `npm.cmd run build` | TypeScript / Vite passed |
| `npm.cmd run check:shell-ui` | 12 groups passed |
| `npm.cmd run check:pages` | 132 route/role/property renders passed |
| `npm.cmd run check:ai-ui` | 41 groups passed |
| Changed CSS / design sidecar | PostCSS / JSON parsing passed |
| `git diff --check` | Passed; LF/CRLF notices are informational |

The UI suite renders the actual Readings component in an isolated DOM and intercepts its save payload. It checks labels, read-only derived fields, lower monthly usage, method changes, confirmation reset, empty/negative/zero quantities, context changes, historical editing and tenant exclusion. The integration tests use an in-memory application store to issue a real synthetic invoice, assert quantity `1200` and cost `1200 × 3500`, carry `10200` into the next period and verify unchanged baseline/decrease/issued-invoice guards.

The billing-test agent stopped at its usage limit before creating a file; the root agent confirmed that the target did not exist and completed those tests without redoing the finished UI work. The final full suite includes both new tests.

Vite's large-chunk advisory and the shared HMR test-port notice did not fail verification. No rendered browser layout or real meter photo was verified; browser access was unavailable in this session. Tests did not open or modify the user's business database, readings, invoices or photos. Existing dependencies were reused.

Only the task-owned `tmp/reading-consumption-20261101/backend-tests.log` and its directory were removed after checking the resolved path, file allowlist and absence of links. Source, historical reports, business data and models were retained.

Reload Trozy, open **Ghi chỉ số** or **Chỉnh sửa**, then select **Cách nhập điện nước → Lượng tiêu thụ kỳ này**. If the app is not running, use `npm.cmd run dev` from `D:\Trozy`.
