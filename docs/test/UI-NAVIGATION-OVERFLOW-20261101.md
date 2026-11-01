# Trozy responsive “Thêm” navigation — 2026-11-01

The user requested a Lozido-style overflow menu when the horizontal navigation becomes crowded in a narrower window.

## Implemented

- Replaced the horizontally scrolling route strip and its arrows with a measured split: leading destinations remain visible; trailing destinations appear under **Thêm (n)**. A wide container shows every permitted primary route without the extra trigger.
- Measures the actual container and natural label/icon/counter widths at active font weight. Container resizing, viewport resizing and font loading recalculate the split, including sidebar changes and browser zoom that change layout width. Measurement spans are inert, hidden from accessibility and clipped within a zero-size box.
- Retained the existing primary order, pastel-pink palette, thin divider, complete role-specific routes and supplementary sidebar. A current route inside the popup highlights the More trigger and its corresponding menu item.
- Added click and keyboard menu operation: up/down, Home/End, Escape with focus restoration, and Tab without a focus trap. Selecting a route moves focus to its page content. Outside interaction, focus leaving the bar, resize and route/property/account changes dismiss the popup.
- Explicitly locks the auto-hiding header while the popup is open, including pointer interactions. Menu width is capped by the bar; its content scrolls vertically according to the remaining viewport height. Entries retain 44px minimum touch targets.
- No business rules, data, dependencies, models or meter evidence workflows changed.

## Verification

| Check | Result |
| --- | --- |
| `npm.cmd run build` | TypeScript and Vite passed |
| `npm.cmd run check:shell-ui` | 12 interaction groups passed |
| `npm.cmd run check:scroll-navigation` | 4 hook groups passed |
| `npm.cmd run check:pages` | 132 route/role/property renders passed |
| Changed CSS and design sidecar | PostCSS / JSON parsing passed |
| `git diff --check` | Passed; LF/CRLF notices are informational |

Shell checks use explicit synthetic geometry at 620, 280 and 1200px container widths. They test count/route preservation, container-only resize observation, keyboard menu operation, focus recovery on reflow, outside and property dismissal, hidden-route selection, working navigation, header visibility locking, tenant exclusions and observer/listener cleanup. Existing sidebar, drawer, search and role coverage remain tested. These DOM tests do not measure a real browser layout.

The production build reports its existing large-chunk advisory. Backend tests were not repeated for this navigation-only change; the previous task's 149/149 result remains recorded separately.

## Render verification limit

The browser access host remained unavailable. Native Computer Use could read a Chrome screenshot, but input could not reliably target the Trozy tab: the first click lacked coordinate geometry and the refreshed attempt was interrupted by detected user input. UI input was stopped without changing the user's page. No rendered Trozy screenshot, browser zoom or physical touch pass is claimed.

No task temporary files were created. Current design behavior is recorded in `DESIGN.md`, `.impeccable/design.json` and the latest `CODEX_PROGRESS.md` entry.
