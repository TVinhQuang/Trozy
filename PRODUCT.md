# Product: Trozy

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Trozy serves two business roles in Vietnamese: landlords who manage rental properties, rooms and operations; and tenants who access their own authorized rental information. Repository evidence: `README.md`, `src/frontend/App.tsx`, and the role-scoped API/bootstrap flow.

## Product Purpose

Connect room management, tenancy, utility evidence, billing, payments and maintenance in one rental-management application. Landlords need a clear view across properties; tenants need understandable bills, documents, notifications and request status.

## Operating Context

The existing application is React/TypeScript with Vite, a Node.js HTTP API and SQLite. Local development uses the repository's scripts and prepared project-local runtimes. The interface must remain usable while a browser window is resized and on narrower screens; improving this behavior was an explicit user request on 2026-11-01.

## Capabilities and Constraints

- Landlord workflows include properties, rooms, tenants, contracts, services, meter readings, invoices, payments, deposits, transactions, maintenance, assets, handovers, notifications, support, documents, vehicles, amenities and reports.
- Tenant workflows are limited to authorized information and actions. Tenant meter submissions remain photo-only.
- Support tickets originate from tenants; landlords read, respond and manage their status. The sidebar help entry opens the Trozy assistant for landlords and support requests for tenants.
- OCR/AI produces proposals. Landlords compare the original image and verify readings before saving; proposals must not automatically change readings or invoices.
- The text assistant and consumption/maintenance AI surfaces are existing capabilities, not evidence of autonomous financial decision-making.
- Project-specific dependencies, models, caches, logs and generated data stay inside the project. Existing installed dependencies and runtimes should be reused.

## Brand Commitments

Keep the Trozy name and Vietnamese product language. The latest user direction is a blue interface with distinct pastel button backgrounds and black/dark-gray foregrounds, using bold text and grouped status/section treatments for clarity. The dashboard room, utility and report actions each have a different fill; comparable actions elsewhere use the same functional palette. Horizontal and vertical navigation keep their current structure and a consistent blue brand treatment. Preserve the earlier improvements for shrinking or enlarging a browser tab/window. Exact visual tokens and component behavior are documented separately in `DESIGN.md`.

## Evidence on Hand

The implementation and its scoped data flows are available under `src/frontend/` and `src/backend/`. Product and implementation context are in `README.md`, `docs/IMPLEMENTATION.md`, `docs/requirements/FEATURE-COVERAGE.md` and `docs/METER-READER.md`. Business invariants and storage rules are in `AGENTS.md`. Existing tests and route-render scripts are available; their existence alone does not establish a passing result.

## Product Principles

- Keep financial and tenancy information traceable to actual application data.
- Make common rental tasks easy to find for the appropriate role.
- Keep original meter evidence and human confirmation visible in the workflow.
- Adapt the layout to the available window width without shrinking essential content into illegible text.

## Accessibility & Inclusion

The implementation uses Vietnamese labels, visible keyboard focus, a skip link, dialogs with keyboard handling, and reduced-motion CSS. The redesigned mobile navigation includes focus management and Escape dismissal. These are source-observed mechanisms, not a claim of comprehensive accessibility certification.
