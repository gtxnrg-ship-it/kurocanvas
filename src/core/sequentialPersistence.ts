export class SequentialPersistenceError extends Error {
  readonly savedCount: number;
  readonly originalError: unknown;

  constructor(savedCount: number, originalError: unknown) {
    const detail = originalError instanceof Error ? originalError.message : String(originalError ?? "Unknown storage error.");
    super("A sequential persistence batch failed after " + savedCount + " successful write(s): " + detail);
    this.name = "SequentialPersistenceError";
    this.savedCount = savedCount;
    this.originalError = originalError;
  }
}

/**
 * Persist records in order and report exactly how much of the prefix committed.
 * A caller can retry items.slice(error.savedCount) without pretending that the
 * uncompleted suffix was written. The save callback must resolve only after its
 * write is durably committed by the backing store.
 */
export async function persistSequentially<T>(
  items: readonly T[],
  save: (item: T, index: number) => Promise<void>,
): Promise<number> {
  let savedCount = 0;
  try {
    for (let index = 0; index < items.length; index++) {
      await save(items[index], index);
      savedCount++;
    }
    return savedCount;
  } catch (error) {
    throw new SequentialPersistenceError(savedCount, error);
  }
}
