import { mock } from "bun:test";
import * as crypto from "node:crypto";

const originalCrypto = { ...crypto };

// Restore randomness even if the action fails.
// These tests must run sequentially, without test.concurrent.
export async function withMinePlacement<T>(
  pickIndex: (limit: number) => number,
  action: () => Promise<T>,
): Promise<T> {
  await mock.module("node:crypto", () => ({
    ...originalCrypto,
    randomInt: pickIndex,
  }));

  try {
    return await action();
  } finally {
    await mock.module("node:crypto", () => originalCrypto);
  }
}

// Supply valid random-index choices that produce the requested mines.
// The real concept still performs mine placement and every state update.
export function minePicker(
  total: number,
  safe: number,
  mines: number[],
) {
  const candidates = Array.from(
    { length: total },
    (_, cell) => cell,
  ).filter(cell => cell !== safe);

  let index = 0;

  return (limit: number) => {
    const chosen = candidates.indexOf(mines[index]!, index);

    if (
      limit !== candidates.length - index ||
      chosen < index
    ) {
      throw new Error(
        "Unexpected mine-placement request in test setup.",
      );
    }

    const offset = chosen - index;

    [candidates[index], candidates[chosen]] = [
      candidates[chosen]!,
      candidates[index]!,
    ];

    index++;
    return offset;
  };
}