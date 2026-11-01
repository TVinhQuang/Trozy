# Trozy room overview and dashboard refinement — 2026-11-01

Implemented the user's supplied Trozy/Lozido references while retaining the fresh pastel-pink visual system and existing business permissions.

## Implemented

- The wordmark and loading brand read **Trozy.** A continuous 2px pink divider separates the horizontal navigation from page content. The existing hide-on-downward-scroll/reveal-on-upward-scroll behavior remains.
- The dashboard starts with the current Vietnamese weekday/date and working room, utility and report buttons. Greeting, introductory prose and the question banner are removed. The date follows Vietnam time, refreshes each minute and refreshes when the page becomes visible.
- Room management defaults to **Bảng tổng hợp**, naturally sorted and grouped by property/floor. Its scrollable table fixes room identity and brings together area/capacity, contract/listed rent, actual deposits, issued-invoice debt, current tenant profiles, contract dates/state, confirmed utility readings, room status, requests not yet closed and amenities.
- **Xem từng phòng** is a separate keyboard-accessible tab retaining room cards, photos, detail and edit dialogs. Both views share filters and use the same contract-or-listed rent; individual cards identify the price source.
- Search, property, floor, room status and price filters also scope the metrics and export. Global property selection and tenant data permissions remain enforced. Tenant views have no owner create/edit/export buttons.
- **Xuất Excel** downloads a genuine `.xlsx` using the already installed ExcelJS dependency. It includes the filtered rooms in displayed order, Vietnamese headings, numeric money, date cells, frozen headings/property/room columns, autofilter, readable column widths and wrapped text. Empty results disable export; download failures expose an error and allow retry.

## Data semantics

Room joins require both room and property identity. Current tenancy uses the active contract, or the ended contract for a room awaiting handover. A later draft does not displace the current tenancy.

Current-lease deposits come from matching receipt/refund/deduction entries. Actual reservation receipts on draft contracts are separate; promised contractual amounts never count as cash. The UI shows the combined room total with a reservation breakdown, and Excel has separate current-lease, reservation and total columns.

Room debt sums the remaining balance on issued invoices, including a former tenancy where applicable. Draft/cancelled invoices are excluded. The UI and workbook explain this scope. Listed rent totals are explicitly labelled as catalogue prices rather than actual income.

Utility columns use only confirmed readings. A real zero stays zero; missing data stays blank. Tenant counts describe maintained profiles, without inferring occupants from free-text member notes. Requests resolved but not yet closed are included and labelled accordingly.

The export allowlist omits internal record IDs, identity documents, phone/account details, photos and pending AI proposals. Formula-looking text stays literal text. No invoices, meter readings or business records are changed by viewing or exporting.

## Verification

| Command / check | Result |
| --- | --- |
| `npm.cmd run build` | TypeScript and Vite passed |
| `npm.cmd run check:rooms-ui` | 8 room/dashboard UI groups passed |
| `npm.cmd run check:room-summary` | 5 calculation/XLSX groups passed |
| `npm.cmd run check:shell-ui` | 11 groups passed |
| `npm.cmd run check:scroll-navigation` | 4 groups passed |
| `npm.cmd run check:pages` | 132 route/role/property renders passed |
| `npm.cmd run check:ai-ui` | 41 groups passed during this task before the final room-only fixes |
| `npm.cmd test` | 149 passed, 0 failed, 0 skipped |
| Changed stylesheets and design sidecar | PostCSS / JSON parsing passed |
| `git diff --check` | Passed; LF/CRLF notices are informational |

Room checks use synthetic records and isolated DOMs. They cover current/old/draft contracts, mismatched joins, actual current/reservation cash after refund and deduction, overdue debt, missing readings versus zeros, discounted-rent filtering in both tabs, keyboard tab selection, details/edit dialogs, global-property/tenant scope, empty/error/retry states, date/actions and a real downloaded-Blob XLSX roundtrip. Export checks also cover Vietnamese text, leading-zero room codes, numeric amounts/dates, long descriptions, literal formula-like strings and an empty header-only workbook.

Vite reports large JavaScript chunks as an advisory; the production build succeeds. ExcelJS is loaded dynamically when export is requested.

## Limits and workspace handling

The browser access host was unavailable. No screenshot comparison, real browser resizing, zoom or visual-layout pass is claimed. Automated DOM/render checks do not measure actual browser geometry.

Existing dependencies were reused. No user photos, business records or models were changed. Only the task-owned temporary test log under `tmp/rooms-overview-20261101` was removed after checking the resolved path and its owned-file allowlist. Source, reports, installed libraries and historical artifacts were retained.

Reload the running app to view the change. If it is not running, use `npm.cmd run dev` from `D:\Trozy`.
