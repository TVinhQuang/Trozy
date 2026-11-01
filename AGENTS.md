# Trozy project rules

- Keep all Trozy-specific libraries, portable runtimes, downloaded models, datasets, caches, logs and generated data inside this project folder. Use `node_modules/` for JavaScript dependencies, `.runtime/ollama/` for Ollama and its models, `.runtime/paddleocr/` for portable Python/OCR dependencies and models, `.runtime/meter-digits/` for optional digit trials, `.cache/` for package caches, and `data/` for application data. Do not install or download Trozy dependencies to another drive or user-profile directory. Existing shared system tools are not project-owned dependencies.
- Use a distinct temporary directory inside this project for each Codex task or process. After its work and verification finish, remove only temporary files created by that task. Resolve and check every recursive delete target before deleting it. Do not delete user photos, business data, existing models, libraries, reports, source code or an unidentified file as cleanup.
- The storage rule above supersedes historical instructions to put OCR/AI runtime files on `D:`. Historical reports can keep their original paths as evidence; executable defaults and new work must use project-local paths.
- Reuse installed models and dependencies. Do not download or reinstall them unless the requested work requires it.
- Preserve tenant photo-only submission and landlord image verification. OCR/AI results are proposals; they do not automatically alter meter readings or invoices.

## UI design

- For frontend design work, read the project-local Impeccable skill at `skills/impeccable/SKILL.md` and the applicable references. This copy came from the user's `E:\Downloads\impeccable-main`; preserve its included Apache-2.0 license.
- Run its launcher through `node scripts/run-project.mjs --powershell scripts/impeccable.ps1 context --target src/frontend/App.tsx`. The wrapper keeps engine downloads in `.cache/impeccable/` and each invocation's temporary files in its own directory under `tmp/`. If the engine is unavailable, use the skill's direct-reading fallback.
- `PRODUCT.md`, `DESIGN.md` and `.impeccable/design.json` record the Trozy context and blue visual system. Use readable type and structural reflow for narrow windows and browser zoom. Preserve all existing business permissions and meter evidence workflows.
