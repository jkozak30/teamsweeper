export function createActionQueue(
  canRun: () => boolean,
  changed: (pending: (string | null)[]) => void,
  limit = 32,
) {
  let tail = Promise.resolve();
  let nextId = 0;
  const pending = new Map<number, string | null>();
  const notify = () => changed([...pending.values()]);

  return {
    enqueue(operation: () => Promise<unknown>, cell: string | null = null): Promise<void> | null {
      if (!canRun() || pending.size >= limit) return null;
      const id = nextId++;
      pending.set(id, cell);
      notify();
      const result = tail.then(async () => {
        try {
          if (canRun()) await operation();
        } finally {
          pending.delete(id);
          notify();
        }
      });
      // A rejected operation must not poison the queue for future input.
      tail = result.catch(() => {});
      return result;
    },
  };
}
