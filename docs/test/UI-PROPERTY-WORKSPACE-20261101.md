# Individual property workspace — 2026-11-01

The user asked to manage each property separately instead of opening on **Tất cả cơ sở**, and to show a short, small address below each property name.

## Implemented

- Replaced the topbar native select with an accessible select-only combobox/listbox supporting two-line name/address options. The selected property also shows its address underneath. Long text is visually truncated while full address text remains in a title and accessible description.
- Removed the all-properties option from the workspace picker. Initial use selects the first non-archived permitted property. Selection is remembered separately per account under `trozy.workspace.<userId>` and validated before content renders, so a stale preference never briefly shows aggregate data.
- Missing or archived saved properties fall back to an available property and update the in-memory and persisted choice. Unavailable localStorage does not block operation. No active properties produces a disabled picker and an operational empty state; landlord property management remains reachable.
- Existing room, invoice, reading and payment views follow the selected property. Notification/maintenance counters also follow it, including genuinely global notices without a property. Tenant dashboard deposit/name lookups now use the current property scope.
- Picker supports arrows, Home/End, Enter/Space selection, Escape focus return, Tab without trapping, outside dismissal and resize dismissal. Opening the picker explicitly keeps the auto-hiding header visible, including mouse interactions.
- Popup width and horizontal position are calculated against viewport bounds, and its list has vertical scrolling. The existing pink/neutral color system, responsive sidebar and **Thêm** route menu remain.
- No backend permissions, business records, photos, invoices, dependencies or models changed.

## Verification

| Check | Result |
| --- | --- |
| `npm.cmd run build` | TypeScript / Vite passed |
| `npm.cmd run check:shell-ui` | 16 groups passed |
| `npm.cmd run check:pages` | 132 route/role/property renders passed |
| `npm.cmd run check:rooms-ui` | 8 groups passed, including actual XLSX download roundtrip |
| `npm.cmd run check:readings-entry` | 6 groups passed |
| `npm.cmd run check:ui-colors` | 39 declared color pairs passed |
| Changed CSS / design sidecar | PostCSS / JSON parsing passed |
| `git diff --check` | Passed; LF/CRLF notices are informational |

Shell regressions cover single-property default/scoping, address rows and accessible descriptions, keyboard/focus/header locks, saved choice after remount, account isolation, stale/missing/archived preferences, no-active-property states and existing navigation/search/drawer behavior. A live mocked App refresh archives the selected property, verifies fallback, then restores that property and verifies the old selection does not return. Fixtures are isolated from the business database and only mock GET requests. A first-render null-selection guard was found during testing and corrected before the successful run.

The build's large-chunk advisory and test HMR shared-port notice did not fail checks. Backend tests were not repeated for this frontend-only change; the previous task recorded 151/151 passed.

Direct browser inspection was attempted and returned **“The browser access host is unavailable.”** No real rendered screenshot, resize/zoom or touch pass is claimed. No task temporary files were created.

Reload Trozy and use the property selector in the header. If the app is not running, use `npm.cmd run dev` from `D:\Trozy`.
