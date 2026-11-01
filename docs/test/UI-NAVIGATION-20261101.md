# Trozy navigation refinement — 2026-11-01

The user's reference was the supplied Lozido screenshot. The existing rose identity and all business workflows are preserved.

## Implemented

- Moved the property/workspace selector from the sidebar and separate scope row into the main topbar. The native select offers all permitted non-archived properties and the all-properties view.
- Split navigation by frequency: eight primary routes for landlords (seven for tenants) in a horizontal rail; supplementary routes in three single-open sidebar groups plus Assistant and Settings where permitted. All 23 landlord and 17 tenant destinations remain reachable without duplicate route entries between navigation regions.
- A group selected in compact mode expands the sidebar and its own section. Visiting a supplementary route opens its containing group. Closed child controls are unmounted so the drawer cannot focus hidden links.
- Horizontal overflow has previous/next controls, disabled edge states and native scrolling. The current route is brought into view. Mobile arrow targets are at least 44px wide.
- The topbar and primary rail move together: visible near the top, hidden after sustained downward travel beyond 140px, revealed after sustained upward travel. The thresholds are 24px down and 12px up; transitions are 180ms out and 320ms in. The scroll listener is passive and batches work into an animation frame.
- Search, mobile drawer, logout dialog and keyboard focus keep the header available. Route, property and account changes reveal it. Reduced-motion preferences remove the animated movement and smooth arrow scrolling.
- Fixed keyboard search focus: Tab from the input into results no longer closes them. Escape works from results, and selecting a page focuses its main content without leaving the header locked open.
- Updated `DESIGN.md` and `.impeccable/design.json` for the scoped navigation change. No backend, financial or OCR rules changed.

## Final verification

| Command / check | Result |
| --- | --- |
| `npm.cmd run build` | TypeScript and Vite passed |
| `npm.cmd run check:shell-ui` | 11 groups passed |
| `npm.cmd run check:scroll-navigation` | 4 groups passed |
| `npm.cmd run check:pages` | 132 route/role/property renders passed |
| `npm.cmd run check:ai-ui` | 41 interaction checks passed |
| `npm.cmd test` | 149 passed, 0 failed, 0 skipped |
| Navigation stylesheet and design sidecar | PostCSS / JSON parsing passed |
| `git diff --check` | Passed; existing LF/CRLF notices are informational |

Shell tests cover 1440, 1000, 390 and 320px width signals, saved sidebar preference, single-open groups, compact expansion, complete role-specific route coverage, actual room scoping with two synthetic properties, search focus, drawer focus/scroll cleanup, and scroll visibility integration. Overflow tests use explicit mocked element dimensions to exercise the arrow behavior; they do not measure actual browser layout.

Vite reports the existing large JavaScript chunks as a performance advisory. Production build succeeds.

## Limits and workspace handling

The browser access host was unavailable, so no rendered screenshot comparison, real device resize or browser-zoom verification is claimed. Testing used isolated DOMs, in-memory fixture data and existing local model/runtime dependencies. No user photos or business records were changed.

The task-created directory `tmp/navigation-20261101` held only the original App backup, one edit helper and the temporary test log. It was resolved, checked against the exact owned-file allowlist and removed after verification. Existing source, reports, models, dependencies and business data were retained.
