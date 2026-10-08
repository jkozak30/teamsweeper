import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
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
  if (["game/reveal", "game/flag", "game/chord"].includes(path)) {
    body = { since: 0, ...body };
  }

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

  return { ...result.data, cookie: header.split(";")[0]! };
}

async function start(host: { room: string; cookie: string }, height = 3, width = 3) {
  const result = await post("game/start", { room: host.room, settings: { ...settings, height, width } }, host.cookie);

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
async function fixture(game: string, flagged: number[], cookie: string) {
  // Choosing the first candidate puts the mine at cell 0.
  const reveal = await withMinePlacement(
    () => 0,
    () => post("game/reveal", { game, coord: { row: 1, column: 1 } }, cookie),
  );

  expect(reveal.response.status).toBe(200);

  for (const cell of flagged) {
    const flag = await post(
      "game/flag",
      {
        game,
        coord: { row: Math.floor(cell / 3), column: cell % 3 },
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

  expect(await current(alice.cookie)).toEqual({ game: null, snapshot: null });

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

  const flag = await post("game/flag", { game, coord, value: true }, bob.cookie);
  expect(flag.response.status).toBe(200);
  expect((await current(alice.cookie)).snapshot.cells[0].flagged).toBe(true);

  const unflag = await post("game/flag", { game, coord, value: false }, alice.cookie);
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

  const chord = await post("game/chord", { game, coord: { row: 1, column: 1 } }, bob.cookie);
  expect(chord.response.status).toBe(200);

  const state = await current(alice.cookie);
  expect(state.snapshot.status).toBe("WON");
  expect(
    state.snapshot.cells.filter((cell: { revealed: boolean }) => cell.revealed),
  ).toHaveLength(8);
  expect(state.snapshot.cells[0]).toMatchObject({ mine: true, triggered: false });
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

  const chord = await post("game/chord", { game, coord: { row: 1, column: 1 } }, alice.cookie);
  expect(chord.response.status).toBe(200);

  const state = await current(alice.cookie);
  expect(state.snapshot.status).toBe("LOST");
  expect(state.snapshot.cells[0]).toMatchObject({ mine: true, triggered: true });
  expect(state.snapshot.cells[1]).toMatchObject({
    flagged: true,
    revealed: false,
    adjacent: null,
  });
  expect(state.snapshot.results).toHaveLength(1);
});

// Incremental game reads.
const cursors = (data: any): Record<string, string> => Object.fromEntries(
  data.changes.annotations.map((value: any) => [value.participant, value.cursor]),
);
async function updates(cookie: string, game = "", since = -1, known = {}) {
  const result = await post("game/updates", { game, since, cursors: known }, cookie);
  expect(result.response.status).toBe(200);
  return result.data;
}

test("initial load resets once and a large-board flag response contains one cell", async () => {
  const alice = await enter("Alice");
  const bob = await enter("Bob", alice.code);
  const game = await start(alice, 30, 30);
  const initial = await updates(alice.cookie);
  expect(initial.changes.update.reset).toBe(true);
  expect(initial.changes.update.cells).toHaveLength(900);
  const idle = await updates(alice.cookie, game, 0, cursors(initial));
  expect(idle.changes.update.cells).toEqual([]);
  expect(idle.changes.annotations.every((value: any) => value.targets === null)).toBe(true);
  const flag = await post("game/flag", {
    game, since: 0, coord: { row: 0, column: 0 }, value: true,
  }, alice.cookie);
  expect(flag.response.status).toBe(200);
  expect(flag.data.changes.update.cells).toHaveLength(1);
  expect(flag.data.changes.update.cells[0]).toMatchObject({ id: 0, flagged: true });
  const caughtUp = await updates(bob.cookie, game, 0);
  expect(caughtUp.changes.update.cells).toEqual(flag.data.changes.update.cells);
  expect((await updates(bob.cookie, game, 1, cursors(caughtUp))).changes.update.cells).toEqual([]);
});

test("missed moves catch up, future revisions reset, and game switches reload annotations", async () => {
  const alice = await enter("Alice");
  const old = await start(alice);
  const initial = await updates(alice.cookie);
  for (const column of [0, 1]) {
    expect((await post("game/flag", {
      game: old, since: 0, coord: { row: 0, column }, value: true,
    }, alice.cookie)).response.status).toBe(200);
  }
  const caughtUp = await updates(alice.cookie, old, 0, cursors(initial));
  expect(caughtUp.changes.update.revision).toBe(2);
  expect(caughtUp.changes.update.cells).toHaveLength(2);
  expect((await updates(alice.cookie, old, 999)).changes.update.reset).toBe(true);
  const game = await start(alice);
  const switched = await updates(alice.cookie, old, 2, cursors(initial));
  expect(switched.game).toBe(game);
  expect(switched.changes.update.reset).toBe(true);
  expect(switched.changes.annotations.every((value: any) => value.targets !== null)).toBe(true);
});

test("annotations sync independently and leaving removes the author from the update roster", async () => {
  const alice = await enter("Alice");
  const bob = await enter("Bob", alice.code);
  const game = await start(alice);
  const initial = await updates(bob.cookie);
  expect((await post("annotations/highlight", { game, coord: { row: 0, column: 0 } }, alice.cookie))
    .response.status).toBe(200);
  const highlighted = await updates(bob.cookie, game, 0, cursors(initial));
  expect(highlighted.changes.update.cells).toEqual([]);
  expect(highlighted.changes.annotations.find((value: any) => value.participant === alice.participant)
    .targets).toHaveLength(1);
  expect((await post("annotations/clear", { game }, alice.cookie)).response.status).toBe(200);
  const cleared = await updates(bob.cookie, game, 0, cursors(highlighted));
  expect(cleared.changes.annotations.find((value: any) => value.participant === alice.participant)
    .targets).toEqual([]);
  expect((await post("rooms/leave", {}, alice.cookie)).response.status).toBe(200);
  expect((await updates(bob.cookie, game, 0, cursors(cleared))).changes.annotations
    .map((value: any) => value.participant)).toEqual([bob.participant]);
});

test("updates keep hidden contents private, including when the caller forges a revision", async () => {
  const alice = await enter("Alice");
  const game = await start(alice);
  const reveal = await withMinePlacement(() => 0, () => post("game/reveal", {
    game, since: 0, coord: { row: 1, column: 1 },
  }, alice.cookie));
  expect(reveal.response.status).toBe(200);
  expect(reveal.data.changes.update.cells).toHaveLength(1);
  const reset = await updates(alice.cookie, game, 999);
  for (const cell of reset.changes.update.cells) {
    expect(cell).not.toHaveProperty("mine");
    expect(cell).not.toHaveProperty("triggered");
    if (!cell.revealed) expect(cell).not.toHaveProperty("adjacent");
  }
});

test("updates enforce membership and reject malformed revisions and identity claims", async () => {
  const alice = await enter("Alice");
  const bob = await enter("Bob", alice.code);
  const eve = await enter("Eve");
  const game = await start(alice);
  const body = { game, since: 0, cursors: {} };
  expect((await post("game/updates", body)).response.status).toBe(401);
  const outsider = await updates(eve.cookie, game, 0);
  expect(outsider.game).toBeNull();
  expect(outsider.changes).toBeNull();
  for (const invalid of [
    { ...body, since: -2 }, { ...body, since: 0.5 },
    { ...body, cursors: [] }, { ...body, participant: alice.participant },
  ]) expect((await post("game/updates", invalid, alice.cookie)).response.status).toBe(400);
  expect((await post("rooms/leave", {}, bob.cookie)).response.status).toBe(200);
  expect((await post("game/updates", body, bob.cookie)).response.status).toBe(401);
});