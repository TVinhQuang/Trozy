# Property management from the workspace header — 2026-11-01

Implemented the user's Lozido references for adding, editing, opening, deleting and managing rental properties, using Trozy's current pink/neutral design.

## Behavior

- Landlords have a header **+** button and dropdown footer actions **Quản lý danh sách cơ sở** / **Thêm cơ sở mới**. Tenant views omit them. Footer buttons sit outside the listbox options and support Tab/Shift+Tab without trapping focus.
- A single dialog changes between property list, editor and confirmation views. List rows show name, address, room count, active/archived state and current selection. Actions open, edit, archive/restore or request deletion.
- Creation uses the existing property fields: required name/address/floors and optional contact/phone/rules. It selects the returned property after bootstrap refresh and opens its dashboard, including creation from an empty workspace. Editing retains the property ID and workspace.
- Validation and request errors remain visible and preserve input. Pending requests disable duplicate submissions and close/cancel actions. Closing returns focus to a connected header control.
- The existing property-management page also exposes owner deletion through the same server guard.

## Deletion and history

Deleting an empty property requires a confirmation view. The server blocks deletion if there are rooms, any owner-linked business records or uploaded files belonging to that property. The UI offers room management and archive/restore alternatives; a server rejection does not optimistically remove anything.

An allowed empty-property deletion removes only that property and its settings. Existing audits remain and a delete audit is added. There is no cascade over rooms, contracts, invoices, payments, meter readings, submissions or files. Archive/restore preserves records; the existing rule requiring active contracts to end before archive remains.

The backend guard scans all record collections except property/settings/audit metadata, plus owned uploaded files. Tests exercise every guarded collection and verify rejected deletes do not mutate records or evidence.

## Verification

| Check | Result |
| --- | --- |
| `npm.cmd run check:property-management-ui` | 10 groups passed |
| `npm.cmd run check:shell-ui` | 18 groups passed |
| New property backend regressions | 5 groups passed |
| `npm.cmd test` | 156 passed, 0 failed, 0 skipped |
| `npm.cmd run build` | TypeScript / Vite passed |
| `npm.cmd run check:pages` | 132 route/role/property renders passed |
| `npm.cmd run check:ui-colors` | 39 declared color pairs passed |
| Changed stylesheets / design JSON | PostCSS / JSON parsing passed |
| `git diff --check` | Passed; LF/CRLF notices are informational |

Component tests use isolated DOM fixtures and intercepted CRUD callbacks. Shell tests mock only GET requests except one explicitly isolated in-memory property-creation response; they verify header/footer wiring, cancellation, tenant exclusions and selection of the new ID after refresh. No request reaches the user's business API. React scheduler work is flushed before test DOM teardown.

The full backend suite uses isolated/in-memory fixtures. The real business database, properties, photos, invoices and models were not modified. Existing dependencies were reused. Vite's large-chunk advisory and shared HMR test-port notices did not fail checks.

Browser access remains unavailable in this session; no rendered screenshot, browser zoom or physical touch pass is claimed. Only the task-owned test log in `tmp/property-management-20261101` was removed after resolved-path, link and owned-file checks. Source, business data and historical reports were retained.

Reload Trozy. Use the **+** beside the property selector or open its dropdown footer. If the app is not running, use `npm.cmd run dev` from `D:\Trozy`.
