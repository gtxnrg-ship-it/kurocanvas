# Evidence-based character capture

When a user provides chapter-specific story information, Kuro may draft three kinds of records:

- Story-memory records from exact user quotes.
- Proposed character entities for explicitly named first appearances.
- Proposed character visual states for chapter-specific appearance facts.

Every extracted record must be grounded in an exact contiguous quote from the user message. Character names must appear verbatim in their evidence. Visual attributes such as age, hair, scars, outfits, injuries, and accessories are accepted only when their values appear verbatim in that quote. Visual state proposals require an explicit chapter number.

All generated records remain **proposed**. The user must review them in Creative Vault before they become canon. Story order defaults to the stated chapter number as a provisional value; flashbacks and non-linear chronology must be corrected by the user before approval. Repeated exact evidence is deduplicated.

This is a conservative proposal pipeline, not a guarantee that a connected language model will never make an extraction error. The exact-quote gate rejects unsupported details, and the UI exposes source evidence for review.
