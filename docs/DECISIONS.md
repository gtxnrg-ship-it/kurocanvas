# Kuro Canvas Decisions Log

Record durable decisions here. Add a date, rationale and links to implementation PRs when known. If a decision changes, append a new entry rather than silently rewriting history.

## D-001 — Native drawing operations are the core
**Decision:** Kuro plans and executes inspectable drawing commands on the real canvas. Image generation is not a substitute for the drawing engine.
**Rationale:** The user must see the work develop panel by panel and be able to revise, pause and undo it.

## D-002 — Local-first projects
**Decision:** Core drawing and project storage should work locally without requiring an account or remote server. Online AI and research are optional.
**Rationale:** Projects should remain usable when offline and the user should retain control of their creative work.

## D-003 — Canon is structured and provenance-aware
**Decision:** Universe facts must carry explicit status and provenance. Unknown is not false; inference is not approved canon.
**Rationale:** Long-running series require reliable continuity and controlled retcons.

## D-004 — Model output is untrusted
**Decision:** Models may propose allowlisted typed actions but may not execute arbitrary JavaScript or receive unrestricted device access.
**Rationale:** Safety, predictable behavior and user control.

## D-005 — Approval and undo are product features
**Decision:** Actions need visible state, cancellation and appropriate approval. Destructive changes require stronger safeguards; reversible drawing operations should support undo/checkpoints.
**Rationale:** Users need to inspect and control AI-assisted work.

## D-006 — Honest feature status
**Decision:** Do not represent placeholders, static mockups, disconnected models or simulated actions as functional features. Use Planned, In progress, Implemented, Verified and Blocked statuses.
**Rationale:** UI appearance alone does not prove functionality.

## D-007 — Memory is project-scoped by default
**Decision:** Keep private universe memory scoped to its project and local by default. Cross-project sharing requires explicit authorization.
**Rationale:** Protect creative privacy and prevent unrelated universes from contaminating each other.

## D-008 — The `.kuro` format must preserve the whole project
**Decision:** The intended package includes metadata, canon, plans, artwork, assets, references, history and approvals, with versioning and integrity validation.
**Rationale:** JSON metadata alone is not a complete portable creative project.

## D-009 — 3D is optional and supports 2D
**Decision:** A 3D workspace is loaded on demand for pose, camera, lighting and environment references. It must not replace native 2D drawing.
**Rationale:** Powerful reference tools should not burden every drawing session.

## D-010 — Preserve the official icon
**Decision:** Use the user's original Kuro Canvas icon when available. Do not substitute a generated icon.
**Rationale:** Preserve the intended identity.

## Updating this log
Each new entry should include:
- ID and date
- Decision
- Rationale
- Consequences/trade-offs
- Related PR or issue
