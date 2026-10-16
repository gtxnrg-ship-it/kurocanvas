# Project storage foundation

This module introduces a typed project schema, IndexedDB-backed local persistence, autosave recovery snapshots, JSON interchange, and a small data-driven starter template catalog.

## Boundaries

- This is the first storage layer, not a complete project format.
- Large binary assets should move into a blob store and be referenced by keys; do not embed base64 images in project JSON.
- A future `.kuro` package should be a versioned ZIP container with a manifest, structured project data, assets, and integrity checks.
- IndexedDB is browser storage and can be cleared by the user or browser. Production must add explicit export/backup and recovery UX.
- Template records carry versions, approval state, tags, and provenance IDs so later edits can preserve the approved source and show where an instance came from.
- Templates are structured starting points, not claims that a canvas renderer or AI agent already applies them.
