import {
  afterAll,
  beforeAll,
  beforeEach,
  expect,
  test,
} from "bun:test";
import { createTestApp } from "./test-app.ts";

import { withMinePlacement } from "./mine-picker.ts";
import { policy } from "../src/http.ts";
import { openTestDb, type TestDb } from "./test-db.ts";

let testDb: TestDb;
let api: ReturnType<typeof createTestApp>["api"];
let rooms: ReturnType<typeof createTestApp>["rooms"];
let now: Date;

const origin = policy.publicOrigin ?? "http://127.0.0.1:3000";
const settings = { height: 3, width: 3, mines: 1 };

beforeAll(async () => {
  testDb = await openTestDb();
}, 120_000);

beforeEach(async () => {
  await testDb.db.dropDatabase();
  now = new Date();
  ({ api, rooms } = createTestApp(testDb.db, () => now));
});

afterAll(async () => {
  if (testDb) await testDb.close();
});

async function post(
  path: string,
  body: Record<string, unknown> = {},
  cookie?: string,
) {
  const response = await api(new Request(`${origin}/api/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  }));

  const data = await response.json();
  return { response, data };
}

async function enter(name: string, code?: string) {
  const result = await post(
    code ? "rooms/join" : "rooms/create",
    code ? { name, code } : { name },
  );

  expect(result.response.status).toBe(200);

  const header = result.response.headers.get("Set-Cookie");
  if (!header) throw new Error("Expected a session cookie.");

  return {
    ...result.data,
    cookie: header.split(";")[0]!,
  };
}

async function start(host: { room: string; cookie: string }) {
  const result = await post(
    "game/start",
    { room: host.room, settings },
    host.cookie,
  );

  expect(result.response.status).toBe(200);
  expect(typeof result.data.game).toBe("string");
  return result.data.game as string;
}

async function current(cookie: string) {
  const result = await post("game/current", {}, cookie);
  expect(result.response.status).toBe(200);
  return result.data;
}

async function refuses(
  path: string,
  body: Record<string, unknown>,
  cookie: string | undefined,
  status: number,
  error: string,
) {
  const result = await post(path, body, cookie);
  expect(result.response.status).toBe(status);
  expect(result.data).toEqual({ error });
}

function games() {
  return testDb.db.collection<{
    _id: string;
    [key: string]: unknown;
  }>("minesweeperPlaying.games");
}

// Fix the layout so chord outcomes do not depend on random placement.
async function fixture(
  game: string,
  flagged: number[],
  cookie: string,
) {
  // Choosing the first candidate puts the mine at cell 0.
  const reveal = await withMinePlacement(
    () => 0,
    () => post(
      "game/reveal",
      {
        game,
        coord: { row: 1, column: 1 },
      },
      cookie,
    ),
  );

  expect(reveal.response.status).toBe(200);

  for (const cell of flagged) {
    const flag = await post(
      "game/flag",
      {
        game,
        coord: {
          row: Math.floor(cell / 3),
          column: cell % 3,
        },
        value: true,
      },
      cookie,
    );

    expect(flag.response.status).toBe(200);
  }

  // The engine supplies real timestamps; finish after the opening.
  await new Promise(resolve => setTimeout(resolve, 10));
}

test("the host starts an associated idle game with hidden contents", async () => {
  const alice = await enter("Alice");

  expect(await current(alice.cookie)).toEqual({
    game: null,
    snapshot: null,
  });

  const game = await start(alice);
  const room = (await rooms._getRoom({ room: alice.room }))[0]!;
  expect(room.currentGame).toBe(game);

  const state = await current(alice.cookie);
  expect(state.game).toBe(game);
  expect(state.snapshot.settings).toEqual(settings);
  expect(state.snapshot.status).toBe("IDLE");
  expect(state.snapshot.startedAt).toBeNull();
  expect(state.snapshot.results).toEqual([]);
  expect(state.snapshot.cells).toHaveLength(9);

  for (const cell of state.snapshot.cells) {
    expect(cell).toMatchObject({
      revealed: false,
      flagged: false,
      adjacent: null,
      mine: null,
      triggered: null,
    });
  }
});

test("two members share flags and safe first reveals through the API", async () => {
  const alice = await enter("Alice");
  const bob = await enter("Bob", alice.code);
  const game = await start(alice);
  const coord = { row: 0, column: 0 };

  const flag = await post(
    "game/flag",
    { game, coord, value: true },
    bob.cookie,
  );
  expect(flag.response.status).toBe(200);
  expect((await current(alice.cookie)).snapshot.cells[0].flagged).toBe(true);

  const unflag = await post(
    "game/flag",
    { game, coord, value: false },
    alice.cookie,
  );
  expect(unflag.response.status).toBe(200);

  const reveal = await post("game/reveal", { game, coord }, bob.cookie);
  expect(reveal.response.status).toBe(200);

  const state = await current(alice.cookie);
  expect(state.snapshot.cells[0].revealed).toBe(true);
  expect(state.snapshot.status === "LOST").toBe(false);
  expect(state.snapshot.clicks).toBe(3);
  expect(await current(bob.cookie)).toEqual(state);
});

test("non-hosts and hosts of another room cannot start a game here", async () => {
  const alice = await enter("Alice");
  const bob = await enter("Bob", alice.code);
  const eve = await enter("Eve");

  for (const cookie of [bob.cookie, eve.cookie]) {
    await refuses(
      "game/start",
      { room: alice.room, settings },
      cookie,
      403,
      "FORBIDDEN",
    );
  }

  expect(await games().countDocuments()).toBe(0);
  expect((await current(alice.cookie)).game).toBeNull();
});

test("moves reject another room's game and replaced games without mutation", async () => {
  const alice = await enter("Alice");
  const eve = await enter("Eve");
  const old = await start(alice);
  const game = await start(alice);
  const other = await start(eve);

  for (const target of [old, other]) {
    const before = await games().findOne({ _id: target });

    for (const action of ["reveal", "flag", "chord"]) {
      await refuses(
        `game/${action}`,
        {
          game: target,
          coord: { row: 0, column: 0 },
          ...(action === "flag" ? { value: true } : {}),
        },
        alice.cookie,
        409,
        "CONFLICT",
      );
    }

    expect(await games().findOne({ _id: target })).toEqual(before);
  }

  expect((await current(alice.cookie)).game).toBe(game);
  expect((await current(eve.cookie)).game).toBe(other);
});

test("missing, invented, and expired sessions cannot use game endpoints", async () => {
  const alice = await enter("Alice");
  const game = await start(alice);
  const cookieName = alice.cookie.slice(0, alice.cookie.indexOf("="));
  const invented = `${cookieName}=invented`;

  now = new Date(now.getTime() + 30 * 60 * 1000);

  for (const cookie of [undefined, invented, alice.cookie]) {
    for (const path of ["current", "start", "reveal", "flag", "chord"]) {
      const body = path === "current"
        ? {}
        : path === "start"
        ? { room: alice.room, settings }
        : {
          game,
          coord: { row: 0, column: 0 },
          ...(path === "flag" ? { value: true } : {}),
        };

      await refuses(`game/${path}`, body, cookie, 401, "UNAUTHORIZED");
    }
  }
});

test("inactive membership cannot read or mutate even with a valid session", async () => {
  const alice = await enter("Alice");
  const bob = await enter("Bob", alice.code);
  const game = await start(alice);

  // Leave directly so the session remains active for this check.
  await rooms.leave({ participant: bob.participant });

  await refuses("game/current", {}, bob.cookie, 403, "FORBIDDEN");
  await refuses(
    "game/reveal",
    { game, coord: { row: 0, column: 0 } },
    bob.cookie,
    403,
    "FORBIDDEN",
  );
});

test("malformed inputs, identity claims, and invalid settings do not create or mutate games", async () => {
  const alice = await enter("Alice");

  await refuses(
    "game/start",
    { room: alice.room, settings: { ...settings, mines: 9 } },
    alice.cookie,
    400,
    "INVALID_REQUEST",
  );
  expect(await games().countDocuments()).toBe(0);

  const game = await start(alice);
  const before = await current(alice.cookie);

  for (const extra of [
    { participant: alice.participant },
    { now: new Date().toISOString() },
  ]) {
    await refuses(
      "game/reveal",
      { game, coord: { row: 0, column: 0 }, ...extra },
      alice.cookie,
      400,
      "INVALID_REQUEST",
    );
  }

  await refuses(
    "game/flag",
    { game, coord: { row: 0, column: 0 }, value: "true" },
    alice.cookie,
    400,
    "INVALID_REQUEST",
  );
  await refuses(
    "game/reveal",
    { game, coord: { row: -1, column: 0 } },
    alice.cookie,
    409,
    "CONFLICT",
  );

  expect(await current(alice.cookie)).toEqual(before);
});

test("correct chording wins and the former returns statistics and visible mines", async () => {
  const alice = await enter("Alice");
  const bob = await enter("Bob", alice.code);
  const game = await start(alice);

  await fixture(game, [0], alice.cookie);

  const chord = await post(
    "game/chord",
    { game, coord: { row: 1, column: 1 } },
    bob.cookie,
  );
  expect(chord.response.status).toBe(200);

  const state = await current(alice.cookie);
  expect(state.snapshot.status).toBe("WON");
  expect(
    state.snapshot.cells.filter(
      (cell: { revealed: boolean }) => cell.revealed,
    ),
  ).toHaveLength(8);
  expect(state.snapshot.cells[0]).toMatchObject({
    mine: true,
    triggered: false,
  });
  expect(state.snapshot.results).toHaveLength(1);
  expect(state.snapshot.results[0].bv).toBe(1);
  expect(state.snapshot.results[0].clicks).toBe(3);
  expect(state.snapshot.results[0].time).toBeGreaterThan(0);
  expect(await current(bob.cookie)).toEqual(state);

  await refuses(
    "game/reveal",
    { game, coord: { row: 0, column: 0 } },
    alice.cookie,
    409,
    "CONFLICT",
  );
  expect(await current(alice.cookie)).toEqual(state);
});

test("incorrect chording loses and exposes the triggered mine", async () => {
  const alice = await enter("Alice");
  const game = await start(alice);

  await fixture(game, [1], alice.cookie);

  const chord = await post(
    "game/chord",
    { game, coord: { row: 1, column: 1 } },
    alice.cookie,
  );
  expect(chord.response.status).toBe(200);

  const state = await current(alice.cookie);
  expect(state.snapshot.status).toBe("LOST");
  expect(state.snapshot.cells[0]).toMatchObject({
    mine: true,
    triggered: true,
  });
  expect(state.snapshot.cells[1]).toMatchObject({
    flagged: true,
    revealed: false,
    adjacent: null,
  });
  expect(state.snapshot.results).toHaveLength(1);
});