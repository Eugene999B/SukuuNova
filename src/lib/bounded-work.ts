export type BoundedWorkFailure = {
  id: string;
  error: unknown;
};

export async function loadInBatchesWithRetry<T>(input: {
  ids: string[];
  load: (id: string) => Promise<T>;
  batchSize?: number;
  maxBatchSize?: number;
}) {
  const maxBatchSize = Math.max(1, Math.trunc(input.maxBatchSize ?? 5));
  const requestedBatchSize = Number.isFinite(input.batchSize) ? Math.trunc(input.batchSize as number) : 1;
  const batchSize = Math.max(1, Math.min(maxBatchSize, requestedBatchSize));
  const items: Array<{ id: string; value: T }> = [];
  const failures: BoundedWorkFailure[] = [];

  for (let offset = 0; offset < input.ids.length; offset += batchSize) {
    const ids = input.ids.slice(offset, offset + batchSize);
    const settled = await Promise.allSettled(ids.map((id) => input.load(id)));

    for (let index = 0; index < ids.length; index += 1) {
      const id = ids[index];
      const result = settled[index];
      if (!id || !result) continue;
      if (result.status === "fulfilled") {
        items.push({ id, value: result.value });
        continue;
      }

      // Retry one failed unit at a time so a transient failure does not create a
      // second concurrency spike.
      try {
        items.push({ id, value: await input.load(id) });
      } catch (error) {
        failures.push({ id, error });
      }
    }
  }

  return { items, failures };
}
