import { checkInvariants } from "./state-checks.ts";
import { afterEach, afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { createTestApp } from "./test-app.ts";
import { openTestDb, type TestDb } from "./test-db.ts";
import { policy } from "../src/http.ts";
import { withMinePlacement } from "./mine-picker.ts";

let testDb: TestDb;
let api: ReturnType<typeof createTestApp>["api"];
let rooms: ReturnType<typeof createTestApp>["rooms"];
let now: Date;
let whenIdle: ReturnType<typeof createTestApp>["whenIdle"];

const origin = policy.publicOrigin ?? "http://127.0.0.1:3000";
const coord = { row: 0, column: 0 };

beforeAll(async () => {
  testDb = await openTestDb();
}, 120_000);

beforeEach(async () => {
  await testDb.db.dropDatabase();
  now = new Date();
  ({ api, rooms, whenIdle } = createTestApp(testDb.db, () => now));
});

afterEach(async () => {
  if (testDb) { await whenIdle(); await checkInvariants(testDb.db); }
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

  return { response, data: await response.json() };
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

async function start(host: { room: string; cookie: string }) {
  const result = await post("game/start", {
    room: host.room,
    settings: { height: 3, width: 3, mines: 1 },
  }, host.cookie);

  expect(result.response.status).toBe(200);
  return result.data.game as string;
}

async function edit(action: string, game: string, cookie?: string, target = coord) {
  return post(`annotations/${action}`, {
    game,
    ...(action === "clear" ? {} : action === "highlight" ? { coords: [target] } : { coord: target }),
  }, cookie);
}

async function current(cookie: string) {
  const result = await post("game/current", {}, cookie);
  expect(result.response.status).toBe(200);
  return result.data;
}

async function refuses(
  action: string,
  game: string,
  cookie: string | undefined,
  status: number,
  error: string,
) {
  const result = await edit(action, game, cookie);
  expect(result.response.status).toBe(status);
  expect(result.data).toEqual({ error });
}

function annotations() {
  return testDb.db.collection("annotating.annotations");
}

// Participant order is not part of the UI contract.
function authors(cell: { highlights: { participant: string }[] }) {
  return cell.highlights.map(value => value.participant).sort();
}

test("members share independent highlights without changing or exposing the board", async () => {
  const alice = await enter("Alice");
  const bob = await enter("Bob", alice.code);
  const game = await start(alice);
  const before = await current(alice.cookie);

  for (const cookie of [alice.cookie, bob.cookie]) {
    expect((await edit("highlight", game, cookie)).response.status).toBe(200);
  }

  const state = await current(alice.cookie);
  expect(authors(state.snapshot.cells[0])).toEqual(
    [alice.participant, bob.participant].sort(),
  );
  expect(await current(bob.cookie)).toEqual(state);

  const withoutHighlights = (value: typeof state) => ({
    ...value,
    snapshot: {
      ...value.snapshot,
      cells: value.snapshot.cells.map(
        ({ highlights, ...cell }: Record<string, unknown>) => cell,
      ),
    },
  });
  expect(withoutHighlights(state)).toEqual(withoutHighlights(before));

  expect((await edit("remove", game, alice.cookie)).response.status).toBe(200);
  expect(authors((await current(bob.cookie)).snapshot.cells[0])).toEqual([bob.participant]);
});

test("duplicate highlights are idempotent and absent removals refuse", async () => {
  const alice = await enter("Alice");
  const game = await start(alice);

  expect((await edit("highlight", game, alice.cookie)).response.status).toBe(200);
  expect((await edit("highlight", game, alice.cookie)).response.status).toBe(200);
  expect(await annotations().countDocuments()).toBe(1);

  expect((await edit("remove", game, alice.cookie)).response.status).toBe(200);
  await refuses("remove", game, alice.cookie, 404, "NOT_FOUND");
  expect(await annotations().countDocuments()).toBe(0);
});

test("clear removes the author's highlights across games and preserves other authors", async () => {
  const alice = await enter("Alice");
  const bob = await enter("Bob", alice.code);
  const old = await start(alice);

  expect((await edit("highlight", old, alice.cookie)).response.status).toBe(200);

  const game = await start(alice);
  expect((await current(alice.cookie)).snapshot.cells[0].highlights).toEqual([]);

  for (const cookie of [alice.cookie, bob.cookie]) {
    expect((await edit("highlight", game, cookie)).response.status).toBe(200);
  }

  for (let i = 0; i < 2; i++) {
    expect((await edit("clear", game, alice.cookie)).response.status).toBe(200);
  }

  expect(await annotations().countDocuments({ author: alice.participant })).toBe(0);
  expect(await annotations().countDocuments()).toBe(1);
  expect(authors((await current(bob.cookie)).snapshot.cells[0])).toEqual([bob.participant]);
});

test("invalid coordinates and malformed or identity-bearing requests are rejected", async () => {
  const alice = await enter("Alice");
  const game = await start(alice);
  const before = await current(alice.cookie);

  for (const target of [
    { row: -1, column: 0 },
    { row: 3, column: 0 },
    { row: 0, column: 0.5 },
  ]) {
    for (const action of ["highlight", "remove"]) {
      const result = await edit(action, game, alice.cookie, target);
      expect(result.response.status).toBe(400);
      expect(result.data).toEqual({ error: "INVALID_REQUEST" });
    }
  }

  for (const body of [
    { game },
    { game, coord: { row: "0", column: 0 } },
    { game, coord, user: alice.participant },
    { game, coord, participant: alice.participant },
  ]) {
    expect((await post("annotations/highlight", body, alice.cookie)).response.status).toBe(400);
  }

  expect(await annotations().countDocuments()).toBe(0);
  expect(await current(alice.cookie)).toEqual(before);
});

test("another room's game and replaced games cannot be annotated or cleared", async () => {
  const alice = await enter("Alice");
  const eve = await enter("Eve");
  const old = await start(alice);

  expect((await edit("highlight", old, alice.cookie)).response.status).toBe(200);

  const game = await start(alice);
  const other = await start(eve);

  for (const target of [old, other]) {
    for (const action of ["highlight", "remove", "clear"]) {
      await refuses(action, target, alice.cookie, 409, "CONFLICT");
    }
  }

  expect(await annotations().countDocuments()).toBe(1);
  expect((await current(alice.cookie)).game).toBe(game);
  expect((await current(eve.cookie)).snapshot.cells[0].highlights).toEqual([]);
});

test("missing, invented, and expired sessions cannot edit annotations", async () => {
  const alice = await enter("Alice");
  const game = await start(alice);
  const cookieName = alice.cookie.slice(0, alice.cookie.indexOf("="));
  const invented = `${cookieName}=invented`;

  now = new Date(now.getTime() + 30 * 60 * 1000);

  for (const cookie of [undefined, invented, alice.cookie]) {
    for (const action of ["highlight", "remove", "clear"]) {
      await refuses(action, game, cookie, 401, "UNAUTHORIZED");
    }
  }

  expect(await annotations().countDocuments()).toBe(0);
});

test("inactive membership cannot edit even with an active session", async () => {
  const alice = await enter("Alice");
  const bob = await enter("Bob", alice.code);
  const game = await start(alice);

  await rooms.leave({ participant: bob.participant });

  for (const action of ["highlight", "remove", "clear"]) {
    await refuses(action, game, bob.cookie, 403, "FORBIDDEN");
  }

  expect(await annotations().countDocuments()).toBe(0);
});

test("leaving clears that author's annotations before answering and preserves remaining players", async () => {
  const alice = await enter("Alice");
  const bob = await enter("Bob", alice.code);
  const old = await start(alice);

  expect((await edit("highlight", old, alice.cookie)).response.status).toBe(200);

  const game = await start(alice);
  for (const cookie of [alice.cookie, bob.cookie]) {
    expect((await edit("highlight", game, cookie)).response.status).toBe(200);
  }

  expect((await post("rooms/leave", {}, alice.cookie)).response.status).toBe(200);
  expect(await annotations().countDocuments({ author: alice.participant })).toBe(0);
  expect((await rooms._getRoom({ room: alice.room }))[0]!.host).toBe(bob.participant);
  expect(authors((await current(bob.cookie)).snapshot.cells[0])).toEqual([bob.participant]);

  expect((await post("rooms/leave", {}, bob.cookie)).response.status).toBe(200);
  expect(await annotations().countDocuments()).toBe(0);
});

test("annotations remain allowed on the current completed game", async () => {
  const alice = await enter("Alice");
  const game = await start(alice);

  await withMinePlacement(() => 0, async () => {
    // The center opening is safe and places the mine at cell 0.
    // Revealing cell 0 then loses through the normal API.
    for (const target of [{ row: 1, column: 1 }, coord]) {
      const result = await post("game/reveal", { game, coord: target }, alice.cookie);
      expect(result.response.status).toBe(200);
    }
  });

  expect((await current(alice.cookie)).snapshot.status).toBe("LOST");
  expect((await edit("highlight", game, alice.cookie)).response.status).toBe(200);
  expect(authors((await current(alice.cookie)).snapshot.cells[0])).toEqual([alice.participant]);
  expect((await edit("clear", game, alice.cookie)).response.status).toBe(200);
});

test("closing the room through the last departure prevents annotation with a valid session", async () => {
  const alice = await enter("Alice");
  const game = await start(alice);

  // End membership through the concept action.
  // Calling this directly leaves the session valid.
  await rooms.leave({ participant: alice.participant });

  expect((await rooms._getRoom({ room: alice.room }))[0]!.status).toBe("CLOSED");

  for (const action of ["highlight", "remove", "clear"]) {
    await refuses(action, game, alice.cookie, 403, "FORBIDDEN");
  }

  expect(await annotations().countDocuments()).toBe(0);
});

test("one highlight request adds the whole selection and preserves other authors and board state", async () => {
  const alice = await enter("Alice");
  const bob = await enter("Bob", alice.code);
  const game = await start(alice);
  await edit("highlight", game, bob.cookie);
  const before = await testDb.db.collection<{ _id: string }>("minesweeperPlaying.games").findOne({ _id: game });
  const coords = [{ row: 0, column: 0 }, { row: 1, column: 2 }, { row: 0, column: 0 }];
  for (let repeat = 0; repeat < 2; repeat++) {
    const highlighted = await post("annotations/highlight", { game, coords }, alice.cookie);
    expect(highlighted.response.status).toBe(200);
  }
  expect(await testDb.db.collection("annotating.annotations").countDocuments()).toBe(3);
  expect(await testDb.db.collection<{ _id: string }>("minesweeperPlaying.games").findOne({ _id: game })).toEqual(before);
  const state = await current(bob.cookie);
  expect(state.snapshot.cells[0].highlights.map((value: { participant: string }) => value.participant).sort())
    .toEqual([alice.participant, bob.participant].sort());
  expect(state.snapshot.cells[5].highlights).toEqual([{ participant: alice.participant }]);
});

test("highlight validates every coordinate and refuses foreign or replaced games without writes", async () => {
  const alice = await enter("Alice");
  const outsider = await enter("Outsider");
  const game = await start(alice);
  await edit("highlight", game, alice.cookie);
  const before = await testDb.db.collection("annotating.annotations").find({}).toArray();
  const valid = { row: 1, column: 1 };
  for (const invalid of [{ row: 3, column: 0 }, { row: -1, column: 0 }, { row: 0.5, column: 0 }]) {
    const result = await post("annotations/highlight", { game, coords: [valid, invalid] }, alice.cookie);
    expect(result.response.status).toBe(400);
  }
  for (const cookie of [undefined, "teamsweeper-session=invented", outsider.cookie]) {
    const result = await post("annotations/highlight", { game, coords: [valid] }, cookie);
    expect(result.response.status).not.toBe(200);
  }
  for (const coords of [[], Array(10001).fill(valid)]) {
    expect((await post("annotations/highlight", { game, coords }, alice.cookie)).response.status).toBe(400);
  }
  const forged = await post("annotations/highlight", { game, coords: [valid], participant: outsider.participant }, alice.cookie);
  expect(forged.response.status).toBe(400);
  await start(alice);
  expect((await post("annotations/highlight", { game, coords: [valid] }, alice.cookie)).response.status).toBe(409);
  expect(await testDb.db.collection("annotating.annotations").find({}).toArray()).toEqual(before);
});

test("moves clear only their author's highlights in the same request; refused moves preserve them", async () => {
  const alice = await enter("Alice");
  const bob = await enter("Bob", alice.code);
  const game = await start(alice);
  const target = { row: 1, column: 1 };
  for (const player of [alice, bob]) await edit("highlight", game, player.cookie, target);
  const moved = await post("game/flag", { game, coord, value: true }, alice.cookie);
  expect(moved.response.status).toBe(200);
  expect(await testDb.db.collection("annotating.annotations").countDocuments({ author: alice.participant })).toBe(0);
  expect(await testDb.db.collection("annotating.annotations").countDocuments({ author: bob.participant })).toBe(1);
  await edit("highlight", game, alice.cookie, target);
  const refused = await post("game/flag", { game, coord, value: true }, alice.cookie);
  expect(refused.response.status).toBe(409);
  expect(await testDb.db.collection("annotating.annotations").countDocuments({ author: alice.participant })).toBe(1);
});
