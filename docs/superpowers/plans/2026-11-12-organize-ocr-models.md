# Organize active OCR models on D

> **For agentic workers:** Use existing verification and a fresh read-only reviewer for this path-only migration. Preserve the dirty working tree.

**Goal:** Make the four active OCR models easy to find by electric/water without copying weights or changing OCR behavior.

**Architecture:** Keep the mandated runtime roots. Move active electric model directories beneath `.runtime/paddleocr/models/electric/` and the two active water weights beneath `.runtime/meter-digits/visionstate-yolo/models/water/`. `MODELS-OCR/` is the visible management entry point with Windows folder shortcuts, a Vietnamese guide, and a SHA-256 inventory.

**Tech stack:** Existing Node, portable Python, native PowerShell; no installs or downloads.

**Spec:** User request in this session: organize current models on D and separate electric/water for easy management.

## Constraints and verification

- Preserve original/base models, training runs, datasets, business data, licenses and existing source edits.
- Move complete Paddle directories, including both configurations, character tables and upstream README.
- Check every move target resolves inside `D:\Trozy` and traverses no reparse point; never overwrite an existing destination.
- Record all moved files and SHA-256 before migration; require unchanged hashes afterward.
- Update production readiness/worker, trainers, water setup, direct live-check paths, and current documentation. Keep frozen trial sources and reports unchanged; retain their original wheel path as an NTFS same-file hard link to the canonical water weight.
- Keep Python, packages and caches at their existing locations. No temporary files on C.
- Use existing runtime status, Python model tests and real-model bridge/HTTP verification. No new tests that merely mirror path constants.

## Tasks

- [x] Record source snapshots and exact artifact hashes in a unique project-local task directory; confirm both branches available before migration.
- [x] Move the four active models into their utility directories and update executable references; verify every recorded file hash.
- [x] Create the visible management folder with shortcuts and inventory; update current documentation.
- [x] Verify readiness, real electric/water inference and relevant checks; get an independent read-only review; remove only this task's temporary files.

## Evidence

`MODELS-OCR/verification.json` records unchanged hashes for all 10 moved files, 23 passing Python checks, successful real-model HTTP verification (electric `00766.4`, water `00001.056`), and preserved frozen trial source hashes. The old wheel pathname is verified with `os.path.samefile` and successfully loads through the original frozen trial adapter. Independent review found no remaining important issues. Setup PowerShell syntax is valid; setup and training were not executed.

## Review focus

Dynamic Paddle directory construction must include `electric/`; every water inference and setup caller must use `water/`; trainer outputs must match app paths; original models and historical evidence must remain intact; shortcuts and inventory must point at canonical weights rather than duplicate copies.
