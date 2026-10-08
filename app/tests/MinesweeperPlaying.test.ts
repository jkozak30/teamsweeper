import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import {
  MinesweeperPlayingConcept,
  InvalidSettings,
  GameNotFound,
  MoveNotAllowed,
  type Coordinate,
  type Settings,
  type Status,
} from "../src/concepts/MinesweeperPlaying.ts";
import { openTestDb, type TestDb } from "./test-db.ts";
import {
  minePicker,
  withMinePlacement,
} from "./mine-picker.ts";

interface FixtureDocument {
  _id: string;
  settings: Settings;
  status: Status;
  mines: number[];
  revealed: number[];
  flagged: number[];
  clicks: number;
  startedAt: Date;
}

let testDb: TestDb;
let playing: MinesweeperPlayingConcept;

const start = new Date("2026-10-07T12:00:00Z");
const end = new Date("2026-10-07T12:00:10Z");
const coord = (row: number, column: number): Coordinate => ({ row, column });

beforeAll(async () => {
  testDb = await openTestDb();
}, 120_000);

beforeEach(async () => {
  await testDb.db.dropDatabase();
  playing = new MinesweeperPlayingConcept(testDb.db);
});

afterAll(async () => {
  if (testDb) await testDb.close();
});

async function board(game: string) {
  const rows = await playing._getGame({ game });
  expect(rows).toHaveLength(1);

  return {
    ...rows[0]!,
    cells: await playing._visibleCells({ game }),
  };
}

// Fixed valid PLAYING boards make rule tests independent of randomness.
// Numeric cells use row * width + column.
// Reach deterministic boards through actual concept actions.
async function fixture(
  height: number,
  width: number,
  mines: number[],
  revealed: number[] = [],
  flagged: number[] = [],
) {
  const at = (cell: number) =>
    coord(Math.floor(cell / width), cell % width);

  // If no opening is specified, reveal a safe numbered cell.
  const seed = revealed[0] ??
    Array.from(
      { length: height * width },
      (_, cell) => cell,
    ).find(cell =>
      !mines.includes(cell) &&
      mines.some(mine =>
        Math.abs(at(cell).row - at(mine).row) <= 1 &&
        Math.abs(at(cell).column - at(mine).column) <= 1
      )
    )!;

  playing = new MinesweeperPlayingConcept(testDb.db);

  const { game } = await playing.create({
    settings: {
      height,
      width,
      mines: mines.length,
    },
  });

  for (const cell of flagged) {
    await playing.flag({
      game,
      coord: at(cell),
      value: true,
    });
  }

  await withMinePlacement(
    minePicker(height * width, seed, mines),
    async () => {
      for (const cell of revealed.length ? revealed : [seed]) {
        await playing.reveal({
          game,
          coord: at(cell),
          now: start,
        });
      }
    },
  );

  return game;
}

test("create stores an idle board and refuses invalid settings", async () => {
  for (const settings of [
    { height: 0, width: 3, mines: 1 },
    { height: 3, width: -1, mines: 1 },
    { height: 1.5, width: 3, mines: 1 },
    { height: 3, width: 2.5, mines: 1 },
    { height: 3, width: 3, mines: 0 },
    { height: 3, width: 3, mines: 1.5 },
    { height: 3, width: 3, mines: 9 },
    { height: NaN, width: 3, mines: 1 },
    { height: 3, width: Infinity, mines: 1 },
  ]) {
    await expect(playing.create({ settings }))
      .rejects.toBeInstanceOf(InvalidSettings);
  }

  expect(
    await testDb.db.collection("minesweeperPlaying.games").countDocuments(),
  ).toBe(0);

  const settings = { height: 3, width: 4, mines: 2 };
  const { game } = await playing.create({ settings });
  const initial = await board(game);

  expect(initial).toMatchObject({
    settings,
    status: "IDLE",
    clicks: 0,
    flagsRemaining: 2,
  });
  expect(initial.cells).toHaveLength(12);
  expect(initial.cells.map(cell => cell.coord)).toEqual(
    Array.from({ length: 12 }, (_, i) => coord(Math.floor(i / 4), i % 4)),
  );
  expect(initial).not.toHaveProperty("startedAt");
  expect(initial).not.toHaveProperty("endedAt");
});

test("first reveal is safe and chooses the requested distinct mines", async () => {
  for (let cell = 0; cell < 6; cell++) {
    const { game } = await playing.create({
      settings: { height: 2, width: 3, mines: 5 },
    });

    expect(await playing.reveal({
      game,
      coord: coord(Math.floor(cell / 3), cell % 3),
      now: start,
    })).toEqual({ status: "WON" });

    const stored = await testDb.db
      .collection<FixtureDocument>("minesweeperPlaying.games")
      .findOne({ _id: game });

    expect(stored!.mines).toHaveLength(5);
    expect(new Set(stored!.mines).size).toBe(5);
    expect(stored!.mines).not.toContain(cell);
    expect((await board(game)).startedAt).toEqual(start);
  }
});

test("flags toggle before play, count as clicks, and do not start the clock", async () => {
  const { game } = await playing.create({
    settings: { height: 2, width: 3, mines: 1 },
  });

  await playing.flag({ game, coord: coord(0, 0), value: true });
  await playing.flag({ game, coord: coord(0, 1), value: true });

  expect(await board(game)).toMatchObject({
    status: "IDLE",
    clicks: 2,
    flagsRemaining: -1,
  });
  expect(await board(game)).not.toHaveProperty("startedAt");

  await playing.flag({ game, coord: coord(0, 0), value: false });

  expect((await board(game)).cells[0]!.flagged).toBe(false);
  expect((await board(game)).clicks).toBe(3);
});

test("zero expansion reveals its boundary but skips flagged safe cells", async () => {
  const game = await fixture(3, 3, [0], [], [8]);

  await playing.reveal({ game, coord: coord(2, 0), now: end });
  const expanded = await board(game);

  expect(expanded.status).toBe("PLAYING");
  expect(expanded.cells.filter(cell => cell.revealed)).toHaveLength(7);
  expect(expanded.cells[4]).toMatchObject({ revealed: true, adjacent: 1 });
  expect(expanded.cells[8]).toMatchObject({ revealed: false, flagged: true });
  expect(expanded.clicks).toBe(3);

  await playing.flag({ game, coord: coord(2, 2), value: false });

  expect(await playing.reveal({
    game,
    coord: coord(2, 2),
    now: end,
  })).toEqual({ status: "WON" });

  expect((await board(game)).endedAt).toEqual(end);
});

test("revealing a number does not expand or leak hidden contents", async () => {
  const game = await fixture(3, 3, [0], [3]);

  await playing.reveal({ game, coord: coord(0, 1), now: end });
  const visible = await board(game);

  expect(visible.cells.filter(cell => cell.revealed)).toHaveLength(2);
  expect(visible.cells[1]!.adjacent).toBe(1);

  for (const cell of visible.cells.filter(cell => !cell.revealed)) {
    expect(cell).not.toHaveProperty("adjacent");
    expect(cell).not.toHaveProperty("mine");
    expect(cell).not.toHaveProperty("triggered");
  }
});

test("revealing a mine loses and exposes mines with triggered markers", async () => {
  const game = await fixture(3, 3, [0, 8], [1]);

  expect(await playing.reveal({
    game,
    coord: coord(0, 0),
    now: end,
  })).toEqual({ status: "LOST" });

  const visible = await board(game);
  expect(visible.endedAt).toEqual(end);
  expect(visible.cells[0]).toMatchObject({ mine: true, triggered: true });
  expect(visible.cells[8]).toMatchObject({ mine: true, triggered: false });
});

test("correct chording expands neighbors, wins, and counts as one click", async () => {
  const game = await fixture(3, 3, [0], [4], [0]);

  expect(await playing.chord({
    game,
    coord: coord(1, 1),
    now: end,
  })).toEqual({ status: "WON" });

  const visible = await board(game);
  expect(visible.clicks).toBe(3);
  expect(visible.cells.filter(cell => cell.revealed)).toHaveLength(8);
  expect(visible.cells[0]).toMatchObject({ flagged: true, revealed: false });
});

test("matching flag count with an incorrect flag makes chording lose", async () => {
  const game = await fixture(3, 3, [0], [4], [1]);

  expect(await playing.chord({
    game,
    coord: coord(1, 1),
    now: end,
  })).toEqual({ status: "LOST" });

  const visible = await board(game);
  expect(visible.cells[0]).toMatchObject({ mine: true, triggered: true });
  expect(visible.cells[1]).toMatchObject({ flagged: true, revealed: false });
  expect(visible.clicks).toBe(3);
});

test("moves refuse missing games and queries return no rows", async () => {
  await expect(playing.reveal({
    game: "missing", coord: coord(0, 0), now: end,
  })).rejects.toBeInstanceOf(GameNotFound);

  await expect(playing.flag({
    game: "missing", coord: coord(0, 0), value: true,
  })).rejects.toBeInstanceOf(GameNotFound);

  await expect(playing.chord({
    game: "missing", coord: coord(0, 0), now: end,
  })).rejects.toBeInstanceOf(GameNotFound);

  expect(await playing._getGame({ game: "missing" })).toEqual([]);
  expect(await playing._visibleCells({ game: "missing" })).toEqual([]);
  expect(await playing._getResult({ game: "missing" })).toEqual([]);
});

test("invalid coordinates and refused moves leave the board unchanged", async () => {
  const game = await fixture(3, 3, [0], [4], [1]);
  const initial = await board(game);

  for (const invalid of [
    coord(-1, 0), coord(3, 0), coord(0, 3), coord(0, 0.5),
  ]) {
    await expect(playing.reveal({
      game, coord: invalid, now: end,
    })).rejects.toBeInstanceOf(MoveNotAllowed);

    await expect(playing.flag({
      game, coord: invalid, value: true,
    })).rejects.toBeInstanceOf(MoveNotAllowed);

    await expect(playing.chord({
      game, coord: invalid, now: end,
    })).rejects.toBeInstanceOf(MoveNotAllowed);
  }

  for (const cell of [coord(1, 1), coord(0, 1)]) {
    await expect(playing.reveal({
      game, coord: cell, now: end,
    })).rejects.toBeInstanceOf(MoveNotAllowed);
  }

  await expect(playing.flag({
    game, coord: coord(1, 1), value: true,
  })).rejects.toBeInstanceOf(MoveNotAllowed);

  await expect(playing.flag({
    game, coord: coord(0, 1), value: true,
  })).rejects.toBeInstanceOf(MoveNotAllowed);

  await expect(playing.flag({
    game, coord: coord(2, 2), value: false,
  })).rejects.toBeInstanceOf(MoveNotAllowed);

  await expect(playing.chord({
    game, coord: coord(2, 2), now: end,
  })).rejects.toBeInstanceOf(MoveNotAllowed);

  expect(await board(game)).toEqual(initial);
});

test("chording refuses idle games, mismatched flags, and empty targets", async () => {
  const idle = await playing.create({
    settings: { height: 3, width: 3, mines: 1 },
  });

  await expect(playing.chord({
    game: idle.game, coord: coord(0, 0), now: end,
  })).rejects.toBeInstanceOf(MoveNotAllowed);

  const mismatch = await fixture(3, 3, [0], [4]);

  await expect(playing.chord({
    game: mismatch, coord: coord(1, 1), now: end,
  })).rejects.toBeInstanceOf(MoveNotAllowed);

  const empty = await fixture(
    3,
    3,
    [1, 8],
    [0, 3, 4],
    [1],
  );

  await expect(playing.chord({
    game: empty,
    coord: coord(0, 0),
    now: end,
  })).rejects.toBeInstanceOf(MoveNotAllowed);
});

test("won and lost games refuse further moves", async () => {
  for (const target of [coord(0, 0), coord(2, 0)]) {
    const game = await fixture(3, 3, [0]);

    await playing.reveal({ game, coord: target, now: end });
    const finished = await board(game);

    await expect(playing.reveal({
      game, coord: coord(0, 1), now: end,
    })).rejects.toBeInstanceOf(MoveNotAllowed);

    await expect(playing.flag({
      game, coord: coord(0, 1), value: true,
    })).rejects.toBeInstanceOf(MoveNotAllowed);

    await expect(playing.chord({
      game, coord: coord(0, 1), now: end,
    })).rejects.toBeInstanceOf(MoveNotAllowed);

    expect(await board(game)).toEqual(finished);
  }
});

test("results measure a zero region, its boundary, clicks, and time", async () => {
  const game = await fixture(3, 3, [0]);

  expect(await playing._getResult({ game })).toEqual([]);

  await playing.reveal({ game, coord: coord(2, 0), now: end });

  expect(await playing._getResult({ game })).toEqual([{
    time: 10, bv: 1, clicks: 2, speed: 0.1, efficiency: 0.5,
  }]);
});

test("3BV counts separate zero regions and isolated numbers on a loss", async () => {
  const regions = await fixture(1, 5, [2]);

  await playing.reveal({
    game: regions, coord: coord(0, 0), now: start,
  });
  await playing.reveal({
    game: regions, coord: coord(0, 2), now: end,
  });

  expect(await playing._getResult({ game: regions })).toEqual([{
    time: 10, bv: 2, clicks: 3, speed: 0.1, efficiency: 1 / 3,
  }]);

  const numbers = await fixture(3, 3, [4], [0]);

  await playing.reveal({
    game: numbers, coord: coord(1, 1), now: end,
  });

  expect(await playing._getResult({ game: numbers })).toEqual([{
    time: 10, bv: 8, clicks: 2, speed: 0.1, efficiency: 0.5,
  }]);
});

test("results omit zero-duration games and state survives a new instance", async () => {
  const game = await fixture(3, 3, [0]);

  await playing.reveal({ game, coord: coord(2, 0), now: start });

  expect(await playing._getResult({ game })).toEqual([]);

  const restored = new MinesweeperPlayingConcept(testDb.db);

  expect(await restored._getGame({ game }))
    .toEqual(await playing._getGame({ game }));

  expect(await restored._visibleCells({ game }))
    .toEqual(await playing._visibleCells({ game }));
});