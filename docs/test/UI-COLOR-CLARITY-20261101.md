# Trozy color clarity — 2026-11-01

Applied the local Impeccable colorize/craft guidance to the user's request for an easier-to-read interface with identifiable buttons and charts. The previously approved light-pink brand remains.

- Neutral gray canvas, white panels, darker ink and neutral table headings reduce the pink cast across working surfaces.
- Pastel primary buttons have a distinct rose outline; ordinary buttons, fields, search and upload controls have a separate stronger neutral boundary. Selection, focus, hover and disabled states retain their roles.
- Cashflow uses teal. Occupied/vacant/maintenance room categories use teal/blue/amber, consistently across occupancy, badges and room cards. Written labels, dots, exact numbers and legend counts remain.
- Electricity and water charts use solid amber and blue. Historical periods are no longer faded to 48% opacity. The latest date is bold with a tooltip, and its positive bar has an outline. Zero utility values have no bar; zero occupancy categories have no segment/separator, while legend counts remain.
- AI controls and room tables use the same tokens. Original photos, annotation fill, proposal/verification wording and approval workflows were preserved. No backend logic, database records, dependencies or model files changed.

## Verification

| Check | Result |
| --- | --- |
| `npm.cmd run check:ui-colors` | 39/39 declared opaque color pairs passed |
| `npm.cmd run build` | TypeScript / Vite passed |
| `npm.cmd run check:shell-ui` | 12 groups passed |
| `npm.cmd run check:rooms-ui` | 8 groups passed, including actual XLSX roundtrips |
| `npm.cmd run check:ai-ui` | 41 groups passed |
| `npm.cmd run check:pages` | 132 route/role/property renders passed |
| Modified CSS / design JSON | PostCSS and JSON parsing passed |
| `git diff --check` | Passed; existing LF/CRLF notices are informational |

Contrast minima: ordinary/secondary text **5.07:1**, links/primary text **5.69:1**, control/focus boundaries **3.05:1**, status text **5.29:1**, chart marks **3.52:1**. The harness checks WCAG luminance calculations against known black/white endpoints and reads current tokens rather than snapshotting exact colors. Disabled opacity is intentionally outside these active-control checks.

The first contrast run found the candidate control boundary insufficient against the gray canvas (2.91:1); it was darkened to `#818d9d` before the successful final run. Chart values, units, labels and outlined/bold latest-period cues preserve information beyond hue.

The Vite large-chunk advisory and shared HMR test-port notices did not fail the checks. Backend tests were not repeated for the presentation-only change; the preceding 149/149 run remains recorded in its report.

Browser inspection was attempted through the existing Trozy tab, but the tool returned **“The browser access host is unavailable.”** No rendered layout/zoom, photo-overlay contrast or color-vision simulation pass is claimed. Automated UI checks use isolated fixtures and do not mutate business data.

No task temporary files or new dependencies were created. `DESIGN.md`, its sidecar and `CODEX_PROGRESS.md` record the current roles. Reload the running Trozy app to view the changes; if it is not running, use `npm.cmd run dev` from `D:\Trozy`.
