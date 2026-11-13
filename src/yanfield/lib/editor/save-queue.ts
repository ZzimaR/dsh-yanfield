/** 多个保存请求共享同一队列，直到保存期间新增的修改也写入完成。 */
export function createSaveQueue(hasPending: () => boolean, saveNext: () => Promise<void>): () => Promise<void> {
  let inFlight: Promise<void> | null = null;

  return async () => {
    while (inFlight || hasPending()) {
      if (inFlight) {
        await inFlight;
        continue;
      }

      const operation = (async () => {
        while (hasPending()) await saveNext();
      })();
      inFlight = operation;
      try {
        await operation;
      } finally {
        if (inFlight === operation) inFlight = null;
      }
    }
  };
}
