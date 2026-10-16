# Kuro Canvas Canon and Universe Memory

## Purpose
Persist a series' world, characters, history and creative intent across sessions and chapters. A chat transcript alone is not a reliable canon database.

## Core record fields
Every fact or memory item should support:
- Stable ID and project ID
- Type (world rule, character, event, relationship, location, object, clue, visual invariant, voice profile, etc.)
- Subject/predicate/object or a typed record payload
- Status: `approved`, `proposed`, `inferred`, `contradicted`, `superseded`
- Provenance: source note/chapter/scene/panel/event or user instruction
- Created/updated timestamps and revision
- Effective story-time interval where applicable
- Confidence only for inference; confidence must not replace approval
- Links to affected entities and dependent facts

## Required distinctions
- **Unknown vs false:** missing information must remain unknown, not be guessed into a negative fact.
- **World truth vs character knowledge:** store what actually happened separately from what each character knows or believes.
- **Canon vs proposal:** model suggestions remain proposals until approved.
- **Current state vs historical state:** preserve changes over time rather than overwriting history.
- **Contradiction vs supersession:** conflicting claims should be surfaced; a superseded fact remains traceable.

## Character records
Include identity, appearance, personality, voice, motivations, abilities, relationships, outfits, possessions, injuries, health/state where relevant to fiction, location, status and timeline. Store immutable or protected visual/story invariants separately from mutable attributes.

## Timeline and continuity
Track events with story time, order constraints, participants, locations, consequences and provenance. Link injuries, deaths, travel, knowledge, objects and relationship changes to events. Prevent a character from appearing at two incompatible locations without an explanation.

## Secrets and foreshadowing
Track clue, intended reveal, planned payoff, who knows it, who suspects it, where it was seeded and whether the payoff has occurred. Do not reveal secrets to characters before they learn them in canon.

## Retrieval flow
1. Resolve the current project, chapter, scene and characters.
2. Retrieve relevant approved facts, timeline events, visual references and unresolved clues.
3. Include relevant proposed or contradictory items clearly labeled.
4. Provide provenance references in the model context.
5. Validate the returned plan against canon.
6. Surface conflicts to the user rather than silently rewriting canon.

## Approval and retcons
A retcon proposal should show:
- Existing fact(s) affected
- Chapters/scenes/panels potentially impacted
- Timeline and character-knowledge consequences
- Asset/visual-continuity dependencies
- Proposed replacement and migration plan
Do not automatically rewrite approved canon or existing artwork without explicit approval.

## Persistence and privacy
- Scope records to a project by default.
- Provide search, inspect, edit, merge, delete, export and recovery operations.
- Validate memory records on save and read.
- Avoid sending the entire universe to a provider; send only the task-relevant subset.
- Clearly disclose when a selected provider receives project content.
- Shared or cross-project memory must be opt-in.

## Testing requirements
Test unknown-vs-false, conflicting facts, superseded facts, character knowledge, timeline ordering, provenance links, retcon impact reports, project isolation and export/import round trips.
