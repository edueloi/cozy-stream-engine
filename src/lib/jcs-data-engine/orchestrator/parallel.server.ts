export async function runParallel<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency = 3,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return out;
}