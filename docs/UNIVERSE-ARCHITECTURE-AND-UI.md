# KuroCanvas Universe-Per-Chat Architecture and UI Blueprint

Status: implementation contract, 2026-10-21. This is a target design, not a claim that all listed behavior exists today.

## Product rule

A new chat creates a new, strictly isolated creative universe by default. The universe owns its canon, story memory, characters, relationships, timeline, visual style, references, world locations, assets, drawing documents, AI task history, and export history. No retrieval, tool, prompt, cache, or UI selector may silently pull data from another universe.

Users may explicitly start an additional conversation inside an existing universe. That action is visibly distinct from New Universe/New Chat. Sharing an asset across universes must be a deliberate copy/import operation with provenance, never a live cross-universe reference by default.

## Backend-first implementation sequence

1. **Domain model and scope contracts**: stable universe/conversation/message IDs, strict scope validators, schema versions, lifecycle, provenance and migration policy.
2. **Durable storage and migrations**: IndexedDB stores for universes, conversations, messages, tasks, and scoped assets; composite indexes by universe and conversation; transactional writes; recovery and migration from existing projects without deleting user data.
3. **Project ownership**: make drawings, story memory, canon, style bible, references, 3D models, templates, and action proposals explicitly universe/project-scoped. Eliminate reliance on one global active-project value as an ownership boundary.
4. **AI execution boundary**: construct prompts only from the selected universe; include evidence IDs for retrieved canon; validate every tool call against universe and project scope; cache keys include universe ID; cancellation, idempotency, audit events and approval gates.
5. **Durability and portability**: autosave/resume, revision history, conflict handling, export/import manifest, integrity validation, backup/restore, versioned migrations, size-aware binary assets.
6. **Tests before interface claims**: isolation tests, cross-universe denial tests, interrupted-write/recovery tests, migration fixtures, import/export round-trips, stale-task and cancellation tests.

Do not migrate all old data by guessing which universe it belongs to. Legacy projects should be presented as import/migration candidates and retained until the user confirms or an unambiguous project ID proves ownership.

## UI direction

### Main shell
- **Left rail — Universes**: searchable list of universes with title, thumbnail, last activity, archive state, and a prominent New Universe action.
- **Second rail — Conversations**: chats within the selected universe, grouped by recent activity. New Chat creates a separate universe by default; “Continue this universe in another chat” is an explicit secondary action.
- **Center — Conversation/workbench**: chat-first creative briefing with streaming status, approvals, task steps, and citations/provenance for remembered facts.
- **Contextual workspace switcher**: Chat, Canvas, Story, Vault, World/3D, References, Layout/Lettering, Export. Switching workspaces preserves the current universe/conversation context.
- **Right inspector (collapsible)**: current character/scene/panel, selected layer, camera/composition, canon evidence, task plan and approval controls.

### Universe identity and safety
- Persistent universe title/avatar/color motif in the header.
- Visible “Working in: [Universe]” context marker near destructive or AI actions.
- Before copying assets between universes, show source, destination, dependencies, and whether the operation copies or links.
- AI memory inspector shows retrieved facts and their source/version; allow pin, correct, supersede, or mark uncertain.
- Never use a global active universe as the sole authorization/scope check; every backend operation receives and validates IDs.

### Desktop layout
Three resizable zones: universe/conversation navigation (left), main work surface (center), contextual inspector (right). Chat and canvas can split-view. Canvas tools remain directly reachable; AI must not obscure manual drawing.

### Mobile/tablet layout
Navigation rails collapse into drawers; center workspace occupies the screen; inspector becomes a bottom sheet. Preserve stylus-friendly canvas controls, undo/redo reachability, offline indicator, autosave state, explicit export/share actions, and interruption/resume. Avoid hover-only actions and tiny targets.

## Acceptance criteria

- Creating two chats independently creates two different universe IDs.
- A query, memory retrieval, AI tool, cached response, or asset lookup in universe A cannot return data scoped only to universe B.
- Creating a conversation within an existing universe requires an explicit action and inherits only that universe's scope.
- Every message/task/action/artifact carries immutable scope IDs; changing the active UI selection cannot re-scope an in-flight task.
- Switching universes cancels or safely fences prior work and never displays stale results in the new universe.
- A failed migration/import leaves original data untouched and gives a recoverable error.
- UI state and backend scope are independently tested; hiding another universe in the UI is not isolation.
- All user content remains locally available when offline for the local-first baseline; any future sync is opt-in and conflict-aware.

## Non-goals for the first implementation slice

This blueprint does not pretend to deliver unlimited model context, automatic multi-device sync, direct publishing to platforms without supported APIs, or full native binary asset handling. Those require separately tested implementations.
