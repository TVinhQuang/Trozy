---
name: Trozy Blue
description: Blue navigation, distinct pastel action fills and dark neutral ink for clear rental management.
colors:
  primary: "#c8ddff"
  primary-hover: "#b6d2ff"
  primary-light: "#edf4ff"
  primary-foreground: "#171b24"
  accent-text: "#171b24"
  focus: "#23539a"
  primary-border: "#4879bc"
  background: "#f5f6f8"
  surface: "#ffffff"
  foreground: "#171b24"
  muted: "#46505f"
  border: "#dce1e8"
  border-strong: "#b7c0cd"
  control-border: "#818d9d"
  secondary: "#f1f3f7"
  surface-hover: "#f8f9fc"
  table-header: "#f4f6fa"
  scrollbar: "#b1bac8"
  selection-bg: "#dceaff"
  divider-accent: "#aac5eb"
  info: "#2b5eab"
  info-bg: "#edf3ff"
  chart-track: "#edf0f5"
  chart-cash: "#27856c"
  chart-cash-current: "#196b55"
  chart-occupied: "#27856c"
  chart-vacant: "#416bb4"
  chart-other: "#aa741e"
  chart-electric: "#a66a18"
  chart-water: "#3b70b6"
  success: "#226a52"
  success-bg: "#eaf5ef"
  warning: "#865e16"
  warning-bg: "#fcf4e3"
  danger: "#ac354c"
  danger-bg: "#fcecf0"
  ring-focus: "#23539a26"
  action-success-bg: "#e2f3eb"
  action-success-hover: "#cdebdc"
  action-success-foreground: "#171b24"
  action-success-border: "#3c8466"
  action-warning-bg: "#fff1d7"
  action-warning-hover: "#ffe4b5"
  action-warning-foreground: "#171b24"
  action-warning-border: "#9b6a1b"
  action-assistant-bg: "#eee9ff"
  action-assistant-hover: "#e0d5ff"
  action-assistant-foreground: "#171b24"
  action-assistant-border: "#8462b3"
  action-info-bg: "#dff3f2"
  action-info-hover: "#c8e9e6"
  action-info-foreground: "#171b24"
  action-info-border: "#387f7b"
  action-report-bg: "#eee7ff"
  action-report-hover: "#ded2fa"
  action-report-foreground: "#171b24"
  action-report-border: "#8060ac"
typography:
  headline:
    fontFamily: "'Be Vietnam Pro', 'Segoe UI', system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "-0.03em"
  title:
    fontFamily: "'Be Vietnam Pro', 'Segoe UI', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "-0.015em"
  body:
    fontFamily: "'Be Vietnam Pro', 'Segoe UI', system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "'Be Vietnam Pro', 'Segoe UI', system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.5
  supporting:
    fontFamily: "'Be Vietnam Pro', 'Segoe UI', system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.65
rounded:
  badge: "6px"
  navigation: "8px"
  control: "9px"
  popover: "12px"
  card: "14px"
  dialog: "16px"
spacing:
  compact: "8px"
  control-gap: "10px"
  inset-sm: "16px"
  inset: "22px"
  section: "24px"
  page: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.primary-foreground}"
  button-success:
    backgroundColor: "{colors.action-success-bg}"
    textColor: "{colors.action-success-foreground}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-warning:
    backgroundColor: "{colors.action-warning-bg}"
    textColor: "{colors.action-warning-foreground}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-assistant:
    backgroundColor: "{colors.action-assistant-bg}"
    textColor: "{colors.action-assistant-foreground}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-info:
    backgroundColor: "{colors.action-info-bg}"
    textColor: "{colors.action-info-foreground}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-report:
    backgroundColor: "{colors.action-report-bg}"
    textColor: "{colors.action-report-foreground}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-danger:
    backgroundColor: "{colors.danger-bg}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.card}"
    padding: "22px"
  badge-success:
    backgroundColor: "{colors.success-bg}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.badge}"
    padding: "4px 9px"
---

# Design System: Trozy Blue

## Overview

**Creative North Star: "A calmer rental workspace"**

Trozy's implemented interface uses distinct pastel action fills on a neutral, light-gray work canvas with white panels and near-black text. Bold room codes, amounts and headings establish hierarchy. Blue identifies navigation and selection; separate background, icon, border and badge families identify actions, operational states and chart data. The visual direction supports everyday Vietnamese rental-management tasks through readable hierarchy, consistent controls and clear separation between information and decisions.

The system is restrained and practical. Navigation can become an icon rail or an overlay drawer, while tables and forms adapt structurally to the available width. Original meter images and verification controls remain operational content rather than decoration.

**Key Characteristics:**

- Light-blue actions, neutral work surfaces and distinct semantic chart colors.
- Familiar navigation and consistent controls.
- Responsive composition with independently scrollable data tables.
- Quiet surfaces with deliberate overlay elevation.

This records the implementation on 2026-11-01. Token and source checks are distinct from rendered layout, zoom and device acceptance; this document does not claim a complete visual QA pass.

## Colors

Fresh light blue carries primary-action fills, with the same near-black text used across ordinary content and a stronger blue boundary. The neutral canvas, white panels and gray table headings reduce competing blue surfaces. Separate tokens distinguish passive separators from interactive control boundaries; the latter meet 3:1 against the declared adjacent white and canvas colors. The YAML frontmatter is the normative token source.

### Primary

- **Fresh Light Blue:** primary buttons and brand fills.
- **Fresh Blue Hover:** primary hover and pressed fills.
- **Pale Fresh Blue:** selected tabs, workspace context and quiet accent surfaces.
- **Dark Interface Ink on Light Blue:** primary-action text.
- **Blue Action Boundary:** clear primary-button and workspace-selector boundaries.
- **Dark Link and Selection Ink:** links and selected labels; blue remains in their background, focus or indicator.
- **Blue Focus:** keyboard outlines, focused boundaries and small control indicators.

### Neutral

- **Neutral Work Canvas:** light-gray page background.
- **White Surface:** tables, forms, cards and dialogs.
- **Interface Ink:** headings, financial values and main text.
- **Secondary Ink:** readable neutral secondary information, labels and placeholders.
- **Surface / Emphasized Separator:** passive borders and structure.
- **Visible Control Boundary:** stronger borders for buttons, fields, search and upload controls.
- **Soft Neutral / Neutral Table Heading:** secondary controls and grouped data surfaces.

Green, amber and red remain semantic success, warning and danger families in fills, borders, dots and icons. Status words use dark ink instead of colored lettering. Blue adds an information/availability family. Written labels and dots remain present. Occupied room badges/cards use green, vacant rooms use blue, and maintenance/handover use amber; those families match the occupancy legend.

### Charts

| Data | Color role | Additional cue |
| --- | --- | --- |
| Received cash | Teal; darker for the current month | Exact amounts and a current-month label |
| Occupied rooms | Teal | Written state, room count and occupancy percentage |
| Vacant rooms | Blue | Written state and room count |
| Maintenance / handover | Amber | Written state and room count |
| Electricity use | Amber | Utility selector, kWh label, exact values and periods |
| Water use | Blue | Utility selector, m³ label, exact values and periods |

Chart marks use solid colors rather than lowering historical periods to partial opacity. The latest utility period has a bold date and a tooltip; its positive bar has an outline. Zero values have no filled bar. Occupancy renders only positive segments so a zero category cannot acquire a separator pixel; the written legend retains every count. White segment boundaries aid separation.

`npm.cmd run check:ui-colors` verifies 87 declared opaque token pairs and the real base/hover/pressed/disabled CSS bindings, including neutral action ink and dark badge words with separate colored dots. Text pairs must reach 4.5:1 and control/focus/chart pairs 3:1. Current minima are 7.35:1 for body/secondary text, 11.20:1 for primary/selected text, 12.07:1 for functional button text, 3.46:1 for functional boundaries, 5.30:1 for focus on functional fills, 3.03:1 for control/focus boundaries, 15.09:1 for status labels, 5.29:1 for status marks and 3.52:1 for chart marks. This calculation is not a computed-browser, photo-overlay or color-vision simulation pass.

**The Meaningful Accent Rule.** Use blue to indicate an action, current selection or focus; preserve independent semantic colors for status.

## Typography

A single sans-serif stack carries headings, labels and data. The declared first choice is Be Vietnam Pro; the current application does not load a bundled font face, so Segoe UI and system fallbacks remain part of the actual runtime behavior.

- **Headline:** the headline token for page titles. Narrow dashboard views use a smaller title while preserving readable body text.
- **Title:** the title token for panel headings.
- **Body:** the body token for ordinary interface content.
- **Label:** the label token for controls and navigation.
- **Supporting:** the supporting token for explanatory text and secondary dates.

Financial values use tabular numerals, with currency kept together where horizontal table scrolling is available. Auth headlines and dashboard totals use larger, locally scoped roles; they do not become general UI-label styles.

**The Structural Resize Rule.** Change columns, navigation and action wrapping when space is limited instead of proportionally shrinking all text.

## Layout

The desktop workspace combines a fixed supplementary side navigation with a flexible content shell and a sticky header. The expanded side navigation is 260px wide and the compact rail is 80px. The content has a 1680px maximum width and desktop insets of 32px vertically and 34px horizontally. The property/workspace selector lives in the topbar, alongside search and account controls. Its content-sized frame shows the workspace caption and selected property name, capped by the parent rather than a fixed width or the longest available option. The compact closed trigger omits the address; addresses appear as small secondary lines in the expanded list. Long text uses ellipsis with full text available in the title. The primary navigation bar sits directly beneath it; the side navigation carries the shorter supplementary accordion groups and utility destinations.

The shell chooses a compact rail by default below 1200px unless a saved user preference overrides it. At 900px and below, supplementary navigation becomes a drawer with a backdrop, keyboard focus management, Escape dismissal, body scroll locking and restoration of focus. The mobile drawer width is capped at 300px and leaves room for its backdrop. The topbar wraps on narrow screens and the property selector shrinks within its available track. The primary navigation keeps the leading destinations that fit and groups the rest into **Thêm (n)**, following the user's Lozido reference. It does not require horizontal scrolling or arrow controls.

The topbar and primary navigation move together as one sticky header. Within the first 140px of page scroll it stays visible. Below that point, 24px of accumulated downward travel hides it by translating the full header upward; 12px of accumulated upward travel reveals it. The hide transition is 180ms and the reveal transition is 320ms, both using the implemented exponential ease-out curve. Scroll work is batched with requestAnimationFrame and a passive listener. The fixed side navigation is not part of this scroll-hiding header.

The header remains revealed while the mobile drawer, property picker, search results, **Thêm** menu or logout dialog is open, or while keyboard interaction holds focus within it. Any focus entering the header reveals it, route/property/user changes reset it to visible, and leaving keyboard focus releases its lock. Hidden chrome ignores pointer events. Reduced-motion CSS shortens transitions to an effectively immediate state change.

Shared layout breakpoints are 1399px, 1100px, 900px, 640px and 380px. Dashboard-specific breakpoints are 1280px, 1100px, 600px and 360px. Grids use flexible zero-minimum tracks, controls wrap and compact screens stack form columns. Dashboard cash bars move beneath their label/value row on small screens.

Tables scroll inside their own region. At 640px and below the first column is sticky, allowing the row identity to stay visible while examining later columns. Touch controls have a 44px minimum height at that breakpoint. The auth story panel is removed from the compact layout so the form receives the available space.
## Elevation & Depth

Work surfaces are flat and separated by borders and tone. Shadows identify temporary overlays: search results, dialogs and toasts. The focus ring is an interaction state, not surface elevation. Overlay shadows, motion and breakpoints live in `.impeccable/design.json` because they fall outside the frontmatter schema.

**The Flat Workspace Rule.** Use borders and tone for persistent content; reserve diffuse shadows for temporary overlays.

## Shapes

Controls have gently curved corners; panels and dialogs use a larger radius. Status chips remain compact and carry a colored dot plus a dark written label. Lucide line icons provide a consistent icon vocabulary. Original room and meter images retain their evidentiary role; the interface does not replace them with decorative illustrations.

## Components

### Buttons

Primary creation and navigation actions use light-blue fills and the dedicated blue boundary. The three dashboard actions use separate blue, teal and lavender fills: room management, utility monitoring and reporting. The same classes apply to comparable actions on other pages. Save/confirm/receive-payment/Excel actions use pale green; edit/retry actions use pale amber; AI actions use pale violet. Every action label uses the same near-black ink, with weight rather than a different text hue for emphasis. These roles add hierarchy without recoloring the horizontal or vertical navigation by function: both navigation regions keep the shared blue selection and focus language. Standard and cancel controls remain white or neutral. Danger controls retain semantic red. Every action family declares default, hover and pressed fills, text and boundary. The visible 3px blue focus outline remains distinct on all action fills. Disabled buttons use opaque neutral fills, readable secondary ink and the control boundary instead of fading the whole button.

Near-black and dark-gray text are the normal reading colors for headings, tables, buttons, links, helper text and statuses. Monetary values and room identifiers use stronger weight. Room groups use a pale blue band; restrained row surfaces and clearly labelled status/financial chips separate information without turning names, subtitles or debt paragraphs blue/red.

### Inputs / Fields

Fields use the dedicated control-boundary token, white surface, control radius and a 44px minimum height. Focus changes the boundary to blue and adds a translucent ring. Supporting hints stay near their field. Text areas can be resized vertically. Disabled controls use the soft neutral surface.

### Navigation

The wordmark is written **Trozy.** with an uppercase T. A continuous 2px fresh-blue line below the primary navigation separates the moving header from the page content; the active-route underline remains stronger and local to its button.

Navigation is split by frequency of use. The horizontal primary bar contains Tổng quan, Phòng trọ, Điện & nước, Hóa đơn, Thanh toán, Hợp đồng, Người thuê and Bảo trì; tenant access removes destinations not permitted for that role. The shorter visible labels Thanh toán and Bảo trì retain the full accessible labels Lịch sử thanh toán and Bảo trì & sự cố. The active primary route uses dark bold text, a pale blue fill and a blue underline.

The bar measures its container and natural active-weight labels, including icons and counters, then retains the leading destinations that fit alongside **Thêm (n)**. The remaining routes appear in that menu in the same order. Wide containers show all permitted destinations without a More button. ResizeObserver, viewport resizing and font-loading events recalculate the split; inert, aria-hidden measurement spans add no duplicate controls or horizontal page overflow.

The **Thêm** trigger uses the active treatment when the current destination is inside its menu. Its menu opens by click or the up/down arrow keys; arrows, Home and End move focus, Escape returns to the trigger, and Tab resumes normal navigation. Choosing a page closes the menu and moves focus into its content. Outside interaction, focus leaving the bar, route/property/account changes and resizing dismiss the menu. Reflow restores focus to a connected navigation control when required. The popup stays within the bar's width and scrolls vertically within the available space below it; menu entries are at least 44px high.

The supplementary sidebar has three exclusive accordion groups: Quản lý cơ sở contains Cơ sở nhà trọ, Dịch vụ & phụ phí, Tài sản & thiết bị, Phương tiện, Tiện ích chung and Bàn giao phòng; Tài chính & báo cáo contains Sổ thu chi, Tiền cọc, Báo cáo and Tiêu thụ điện nước; Trao đổi & tài liệu contains Thông báo, Yêu cầu hỗ trợ and Tài liệu & nội quy. Trợ lý Trozy and Cài đặt remain separate utility links. Entries and empty groups are filtered by role. Group toggles expose their expanded state and controlled region; closed entries are hidden and unmounted. An active secondary route opens its group, and opening a group from the compact icon rail first expands the sidebar.

The active supplementary destination uses a pale fresh-blue fill and readable accent-text labels. Compact mode preserves accessible labels and title text for icon-only controls. Collapse controls are available in the desktop topbar and sidebar. The chosen compact/expanded preference is saved locally; narrow-screen drawer state is temporary. Notifications and maintenance links display their existing application counts where applicable.

The sidebar footer **Cần một chút hỗ trợ?** opens **Trợ lý Trozy** for landlords and **Yêu cầu hỗ trợ** for tenants. Its supporting text and icon identify that destination. Only tenants see the support-ticket creation action and form; the ticket is tied to their own tenancy. Landlords see incoming requests, replies and handling actions, with role-appropriate empty-state text. The API also restricts ticket creation to tenants. The separate maintenance workflow retains its existing permissions.

The property selector is a select-only combobox/listbox in the topbar. It selects one active property, with no **Tất cả cơ sở** option. The closed trigger shows the name; each dropdown option shows a name with a small address beneath it. Missing addresses in the expanded list are labelled **Chưa có địa chỉ**. The accessible description includes the current name and, for each open option, its address. Arrow keys, Home/End, Enter/Space, Escape and Tab support keyboard use; outside focus/pointer actions, resizing or a changed property close the list. The popup width is clamped inside the viewport and its height scrolls within the space below the trigger.

The first available property is selected on initial use. A per-account local preference restores later selections; missing, archived or unauthorized stored IDs fall back to the first active property before content is rendered. Storage failure does not prevent selection. If no property is active, operational pages show an empty-workspace state instead of aggregate data; landlords can still open property management. Its property list remains complete for management. Dashboard figures and header/sidebar notification and maintenance counts follow the selected property, while genuinely propertyless global notices remain visible.

Landlords have a **+** create button beside the selector and two footer actions below its property options: **Quản lý danh sách cơ sở** and **Thêm cơ sở mới**. The footer sits outside the listbox's option semantics and remains reachable with Tab/Shift+Tab. Tenant views omit these controls.

Property management uses one dialog with list, editor and confirmation views. The list shows names, addresses, room counts, active/archived state and the current workspace, with labelled open/edit/archive/restore/delete controls. Creation accepts the existing name, address, floor, contact, phone and rules fields; after refresh the returned ID is selected and the dashboard opens. A no-property workspace still offers the header create button. Failed requests preserve values and allow retry; pending work prevents repeated submissions and accidental close. Closing returns focus to a connected header control.

Deletion requires explicit confirmation and is available only for genuinely empty properties. Rooms, linked business records or uploaded files block it on the server; the dialog offers room management and/or archive/restore alternatives. Empty-property deletion removes its configuration while retaining the audit trail. Archive preserves history and remains subject to the existing active-contract guard. The property-management page also exposes its guarded delete control.

Global page search supports the slash shortcut outside editable fields and dialogs. Search results stay open while keyboard focus moves among them, close when focus leaves the search region, and support Escape. Selecting a result moves focus into the destination's content and releases the temporary header lock. Header focus, open search and drawer interactions use the visibility safeguards described in Layout.

### Cards / Containers

White cards use the card radius, a subtle boundary and typically 22px of body padding. Headers separate title/action rows from body content. Responsive layouts reduce insets and allow actions to wrap.

### Data Tables and Status Chips

Tables retain a consistent row rhythm and tabular money. Room codes and monetary figures use stronger weight; tenant names and explanatory lines use neutral ink. Property/floor headers use a pale blue band. Status chips combine dark text with semantic background color and a separate colored dot. They convey existing application states and do not imply autonomous approval of a reading, invoice or payment.

### Room Inventory

Room management opens on **Bảng tổng hợp**: a naturally sorted table grouped by property and floor, with room identity fixed while the data scrolls horizontally. Columns bring together area/capacity, listed or current-contract rent, actual deposits, issued-invoice room debt, current tenant profiles, contract dates/state, confirmed utility readings, room status, unresolved requests and amenities. The **Xem từng phòng** tab keeps the individual room cards and their existing detail, image and edit workflows. Both tabs share property, status, floor, search and price filters; price ranges use the same contract-or-listed price shown in the table and individual cards. Cards label whether the price comes from the contract or the room listing.

Summary metrics reflect the current filter. Listed monthly prices are labelled separately from actual receipts. Room debt includes all unpaid issued invoices for that room, including a former tenancy where applicable. Deposits distinguish the current tenancy from real reservation receipts against draft contracts; a promised contract deposit never counts as received cash. Tenant-profile counts are labelled as maintained profiles rather than inferred occupants.

The room-debt cell shows its amount once in bold. If any debt is overdue, a small plain **Quá hạn** line sits beneath that amount, without another amount, colored fill or enclosing border. The overdue amount remains in the underlying financial data and export.

**Xuất Excel** downloads a real `.xlsx` of the filtered room summaries for landlords. The workbook has Vietnamese headings, numeric money, date cells, frozen headings and room/property columns, an autofilter and wrapped text. Current-lease, reservation and total deposits are separate columns. Notes explain the financial scope; pending AI values, identity documents, account details and internal record IDs are not exported. Empty results disable export, and a failed download leaves a visible error and retry path.

### Dialogs

Dialogs use the larger corner radius, a dim backdrop and the strongest overlay shadow. Standard and wide widths are capped at 540px and 840px. The header stays outside the scrolling body. Existing keyboard behavior includes Escape dismissal, focus trapping and restoration.

### Manual Meter Entry

The reading editor distinguishes cumulative meter readings from usage during a period. Its default method, **Chỉ số trên công tơ**, labels the editable values explicitly as start/end readings and shows the resulting usage. **Lượng tiêu thụ kỳ này** accepts a nonnegative electric/water quantity, fixes the cumulative start values and shows read-only calculated ends: start + usage. A smaller quantity than the previous month's use is valid.

Calculated ends are labelled as calculated and must still be compared with the meter/evidence before the landlord confirms saving. Changing a method or value revokes that confirmation. Blank and negative quantities cannot save; zero can. Switching methods preserves a valid interval, and changing room/period returns to the cumulative method. An invalid unsaved decrease becomes a zero-usage interval only after explicitly selecting usage entry, ready for the user to enter their quantity.

The API continues to store cumulative readings. Existing records are never reinterpreted as monthly usage; baseline continuity, invoice locks and photo-review requirements remain in effect. This calculator does not implement meter rollover, reset or replacement events, and it does not alter the tenant's photo-only submission flow.

### Dashboard Data

The dashboard starts with the current Vietnamese weekday and date plus the room, utility and report actions. The date refreshes every minute and when the document's visibility changes. Greeting copy, the introductory description and the question banner are omitted; their action buttons remain available. A screen-reader heading identifies the overview without adding a visible title block.

Cashflow bars display exact month amounts beside proportional widths; a zero amount has no filled bar. Occupancy uses a segmented bar and explicit room counts. These patterns expose actual values and labels rather than using decorative house artwork or a progress ring.

## Do's and Don'ts

### Do:

- **Do** use the shared blue tokens for primary actions and current selection.
- **Do** preserve green, amber and red status meaning.
- **Do** change layout structure when the window becomes narrow.
- **Do** keep exact money values and original meter evidence legible.
- **Do** retain visible focus and reduced-motion behavior.

### Don't:

- **Don't** use brand color to imply that an AI proposal has been verified.
- **Don't** hide primary actions behind a fixed-width composition that overflows the viewport.
- **Don't** treat an unrendered source review as a browser visual pass.
