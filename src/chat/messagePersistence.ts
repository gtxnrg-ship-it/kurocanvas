/**
 * Persist a chronological slice of conversation messages.
 *
 * The caller's cursor callback is advanced only after the corresponding write
 * resolves, so an interrupted batch can be retried from the first failed item
 * without duplicating the already-confirmed prefix.
 */
export async function persistMessageRange<T>(
  messages: readonly T[],
  startIndex: number,
  save: (message: T, index: number) => Promise<void>,
  onPersisted?: (nextIndex: number) => void,
): Promise<number> {
  if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex > messages.length) {
    throw new Error("The message persistence cursor is outside the current transcript.");
  }
  let nextIndex = startIndex;
  for (let index = startIndex; index < messages.length; index++) {
    const message = messages[index];
    if (message === undefined) throw new Error("The transcript changed unexpectedly during persistence.");
    await save(message, index);
    nextIndex = index + 1;
    onPersisted?.(nextIndex);
  }
  return nextIndex;
}
