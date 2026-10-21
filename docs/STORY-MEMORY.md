# Story Memory, Chapter Recall, and Visual Continuity

## Contract
Kuro must not treat chat history as the only memory, nor pretend a model context window is permanent memory. The project database is the durable source of truth. User recaps are captured as proposed records; they do not silently become approved canon.

## Record types
- Chapter recap: approved summary, chapter/scene index, story order, tags, and involved entities.
- Event: what happened, who participated, location, consequences, and what each character knows afterward.
- Character change: appearance, costume, injury, possession, relationship, ability, location, status, or motivation change, linked to the event and previous state.
- Visual reference: stable reference to a character sheet, pose, prop, environment, or panel.
- Panel/template reference: stable asset IDs and layout metadata so a flashback can reuse a previous panel or template.

## Retrieval and anti-hallucination rules
1. Resolve project and chapter before retrieval; never search across projects implicitly.
2. Retrieve approved chapter/event/character-change records plus linked panel/template IDs relevant to the request.
3. Preserve story order and distinguish what happened from what a character knows.
4. Missing records mean unknown, not false. If the requested chapter or asset is absent, say so and ask for the source or recap.
5. User recaps begin as proposals. Approval is explicit; corrections create a revision/supersession trail rather than overwriting history.
6. A model may suggest missing tags or links, but must not invent a saved panel ID, event, dialogue, costume detail, or character state.
7. Before committing a drawing plan, validate its character state and referenced assets against the retrieved context.
8. Reusable templates and panels are references to editable native data, not flattened image guesses.

## Current implementation boundary
src/canon/storyMemory.ts provides project-scoped memory records, retrieval, linked visual asset references, bounded prompt context, and proposal-first chapter recaps. IndexedDB persistence and UI approval/revision integration are separate follow-up work. Do not describe the complete memory experience as finished until those are wired and tested.
