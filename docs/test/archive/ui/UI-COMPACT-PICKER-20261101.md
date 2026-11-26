# Compact property selector — 2026-11-01

The user requested a shorter closed property button and addresses only after opening its arrow.

- The trigger now shows its workspace caption and selected property name. Its accessible description identifies that name.
- The expanded list retains the small address under every property, including its full title and accessible description.
- Per-account selection, property scoping, the header plus button and property-management footer remain.

Verification: TypeScript/Vite build passed; all **18 App-shell groups** passed, including absence of an address on the closed trigger and address presence in the open list after creating a property. A final full backend run passed **156/156** with zero failures/skips. Changed CSS/design JSON parsed successfully. Browser access remained unavailable, so no rendered screenshot or real zoom pass is claimed.

Publication notes in README and `docs/PROJECT-STATUS.md` separate existing local functionality, ongoing work and unimplemented scope. **OCR/B03 is explicitly marked as work in progress/experimental**, with human image verification retained.

The publication set contains reviewed source, scripts, synthetic test fixtures, configuration, licenses, the local Impeccable copy and text documentation. It omits `.env`, real databases, runtime/models, caches, dependencies, build output, meter photographs/crops and unrelated PA2 changes. The bundled skill and third-party license text retain their upstream whitespace; project-authored staged files pass the whitespace check separately.
