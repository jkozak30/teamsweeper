import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { createTestApp } from "./test-app.ts";
import { withMinePlacement } from "./mine-picker.ts";
import { PerformanceRankingConcept } from "../src/concepts/PerformanceRanking.ts";
import { policy } from "../src/http.ts";
import { openTestDb, type TestDb } from "./test-db.ts";

let testDb: TestDb;
let api: ReturnType<typeof createTestApp>["api"];
let whenIdle: ReturnType<typeof createTestApp>["whenIdle"];
let ranking: PerformanceRankingConcept;
const origin = policy.publicOrigin ?? "http://127.0.0.1:3000";
const settings = { height: 3, width: 3, mines: 1 };

beforeAll(async () => { testDb = await openTestDb(); }, 120_000);
beforeEach(async () => {
  if (whenIdle) await whenIdle();
  await testDb.db.dropDatabase();
  ({ api, whenIdle } = createTestApp(testDb.db));
  ranking = new PerformanceRankingConcept(testDb.db);
});
afterAll(async () => {
  if (whenIdle) await whenIdle();
  if (testDb) await testDb.close();
});

async function post(path: string, body: Record<string, unknown> = {}, cookie?: string) {
  const response = await api(new Request(`${origin}/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin, ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  }));
  // The HTTP reply need not wait for the independent recording reaction.
  await whenIdle();
  return { response, status: response.status, data: await response.json() };
}

async function enter(name: string, code?: string) {
  const result = await post(code ? "rooms/join" : "rooms/create", code ? { code, name } : { name });
  expect(result.status).toBe(200);
  const header = result.response.headers.get("Set-Cookie");
  if (!header) throw new Error("Expected a session cookie.");
  return { ...result.data, cookie: header.split(";")[0]! } as {
    room: string; code: string; participant: string; cookie: string;
  };
}

async function start(host: { room: string; cookie: string }) {
  const result = await post("game/start", { room: host.room, settings }, host.cookie);
  expect(result.status).toBe(200);
  return result.data.game as string;
}

async function move(path: "reveal" | "chord" | "flag", game: string, cookie: string, row: number, column: number, extra: Record<string, unknown> = {}) {
  return post(`game/${path}`, { game, coord: { row, column }, since: 0, ...extra }, cookie);
}

async function opening(game: string, cookie: string) {
  // Mine at cell 0, with only the numbered center initially revealed.
  const result = await withMinePlacement(() => 0, () => move("reveal", game, cookie, 1, 1));
  expect(result.status).toBe(200);
  expect(result.data.changes.update.status).toBe("PLAYING");
  // Preserve the existing positive-elapsed-time statistics rule.
  await new Promise(resolve => setTimeout(resolve, 10));
}

async function win(host: { room: string; cookie: string }, kind: "reveal" | "chord" = "reveal", cookie = host.cookie) {
  const game = await start(host);
  await opening(game, host.cookie);
  if (kind === "chord") {
    expect((await move("flag", game, cookie, 0, 0, { value: true })).status).toBe(200);
  }
  const result = await move(kind, game, cookie, kind === "chord" ? 1 : 2, kind === "chord" ? 1 : 2);
  expect(result.status).toBe(200);
  expect(result.data.changes.update.status).toBe("WON");
  return { game, stats: result.data.changes.update.results[0] };
}

function saved() {
  return testDb.db.collection<{ _id: string }>("performanceRanking.results");
}

for (const kind of ["reveal", "chord"] as const) {
  test(`a member's winning ${kind} records the room, category, and five measurements`, async () => {
    const alice = await enter("Alice");
    const bob = await enter("Bob", alice.code);
    const { game, stats } = await win(alice, kind, bob.cookie);
    expect(stats.time).toBeGreaterThan(0);
    expect(await ranking._get({ item: game })).toEqual([{
      scope: alice.room, category: { settings, status: "WON" },
      measurements: [
        { metric: "Time", value: stats.time }, { metric: "3BV", value: stats.bv },
        { metric: "Clicks", value: stats.clicks }, { metric: "3BV/s", value: stats.speed },
        { metric: "Efficiency", value: stats.efficiency },
      ],
    }]);
    expect(await saved().countDocuments()).toBe(1);
  });
}

test("idle games, ordinary moves, and losses are not recorded", async () => {
  const alice = await enter("Alice");
  const game = await start(alice);
  expect(await ranking._get({ item: game })).toEqual([]);
  for (const value of [true, false]) {
    expect((await move("flag", game, alice.cookie, 0, 0, { value })).status).toBe(200);
    expect(await ranking._get({ item: game })).toEqual([]);
  }
  await opening(game, alice.cookie);
  expect(await ranking._get({ item: game })).toEqual([]);
  const loss = await move("reveal", game, alice.cookie, 0, 0);
  expect(loss.status).toBe(200);
  expect(loss.data.changes.update.status).toBe("LOST");
  expect(loss.data.changes.update.results).toHaveLength(1);
  expect((await post("rankings/result", { item: game }, alice.cookie)).status).toBe(404);
  expect(await saved().countDocuments()).toBe(0);
});

test("reloads, polls, and refused moves preserve saved wins; historical reads never recompute", async () => {
  const alice = await enter("Alice");
  const { game } = await win(alice);
  const original = (await ranking._get({ item: game }))[0]!;
  ({ api, whenIdle } = createTestApp(testDb.db));
  expect((await post("game/current", {}, alice.cookie)).status).toBe(200);
  expect((await post("game/updates", { game, since: -1, cursors: {} }, alice.cookie)).status).toBe(200);
  expect((await move("reveal", game, alice.cookie, 2, 2)).status).toBe(409);
  await start(alice);
  const { MinesweeperPlayingConcept } = await import("../src/concepts/MinesweeperPlaying.ts");
  const computeResult = MinesweeperPlayingConcept.prototype._getResult;
  MinesweeperPlayingConcept.prototype._getResult = async () => { throw new Error("Unexpected recomputation"); };
  try {
    const result = await post("rankings/result", { item: game }, alice.cookie);
    expect(result.status).toBe(200);
    expect(result.data).toMatchObject({ item: game, result: { category: original.category, measurements: original.measurements } });
    const rows = await post("rankings/rank", { metric: "Clicks", ascending: true }, alice.cookie);
    expect(rows.status).toBe(200);
    expect(rows.data.ranking.results).toEqual([{ item: game, value: 2, rank: 1 }]);
  } finally {
    MinesweeperPlayingConcept.prototype._getResult = computeResult;
  }
  expect(await ranking._get({ item: game })).toEqual([original]);
  expect(await saved().countDocuments()).toBe(1);
});

test("simultaneous winning moves commit and record once", async () => {
  const alice = await enter("Alice");
  const bob = await enter("Bob", alice.code);
  const game = await start(alice);
  await opening(game, alice.cookie);
  const results = await Promise.all([alice, bob].map(player => move("reveal", game, player.cookie, 2, 2)));
  expect(results.map(result => result.status).sort()).toEqual([200, 409]);
  expect(await ranking._get({ item: game })).toHaveLength(1);
  expect(await saved().countDocuments()).toBe(1);
});

test("ranking requests forward metric, category, direction, and range, with defaults", async () => {
  const alice = await enter("Alice");
  const bob = await enter("Bob", alice.code);
  // Controlled fixtures use concept actions, rather than database edits.
  for (const [item, category, clicks, time] of [["a", "standard", 2, 8], ["b", "standard", 1, 9], ["c", "other", 3, 7]] as const) {
    await ranking.record({ item, scope: alice.room, category, measurements: [{ metric: "Clicks", value: clicks }, { metric: "Time", value: time }] });
  }
  for (const [body, expected] of [
    [{ metric: "Clicks", ascending: true }, [{ item: "b", value: 1, rank: 1 }, { item: "a", value: 2, rank: 2 }, { item: "c", value: 3, rank: 3 }]],
    [{ metric: "Time", ascending: false, category: "standard", from: 2, to: 2 }, [{ item: "a", value: 8, rank: 2 }]],
    [{ metric: "missing", ascending: true }, []],
  ] as const) {
    const result = await post("rankings/rank", body, bob.cookie);
    expect(result.status).toBe(200);
    expect(result.data.ranking.results).toEqual(expected);
  }
});

test("room isolation applies to winning moves, rankings, and saved results", async () => {
  const alice = await enter("Alice");
  const outsider = await enter("Outsider");
  const game = await start(alice);
  await opening(game, alice.cookie);
  expect((await move("reveal", game, outsider.cookie, 2, 2)).status).toBe(409);
  expect((await move("reveal", game, "teamsweeper-session=invented", 2, 2)).status).toBe(401);
  expect(await saved().countDocuments()).toBe(0);
  expect((await move("reveal", game, alice.cookie, 2, 2)).status).toBe(200);
  const other = await win(outsider);
  const rows = await post("rankings/rank", { metric: "Clicks", ascending: true }, alice.cookie);
  expect(rows.status).toBe(200);
  expect(rows.data.ranking.results.map((row: { item: string }) => row.item)).toEqual([game]);
  for (const item of [other.game, "unknown"]) {
    const result = await post("rankings/result", { item }, alice.cookie);
    expect(result.status).toBe(404);
    expect(result.data.error).toBe("NOT_FOUND");
  }
});

test("both read endpoints reject missing/invalid sessions and inactive membership", async () => {
  const alice = await enter("Alice");
  const requests = [["rankings/rank", { metric: "Clicks", ascending: true }], ["rankings/result", { item: "unknown" }]] as const;
  for (const [path, body] of requests) {
    for (const cookie of [undefined, "teamsweeper-session=invented"]) {
      expect((await post(path, body, cookie)).status).toBe(401);
    }
  }
  const { RoomJoiningConcept } = await import("../src/concepts/RoomJoining.ts");
  await new RoomJoiningConcept(testDb.db).leave({ participant: alice.participant });
  for (const [path, body] of requests) expect((await post(path, body, alice.cookie)).status).toBe(403);
});

test("read endpoints reject malformed inputs and caller-supplied scope", async () => {
  const alice = await enter("Alice");
  for (const body of [
    { metric: "", ascending: true }, { metric: "Clicks", ascending: "yes" },
    { metric: "Clicks", ascending: true, from: 0 }, { metric: "Clicks", ascending: true, from: 3, to: 2 },
    { metric: "Clicks", ascending: true, category: [] }, { metric: "Clicks", ascending: true, to: 1.5 },
    { metric: "Clicks", ascending: true, scope: alice.room },
  ]) expect((await post("rankings/rank", body, alice.cookie)).status).toBe(400);
  for (const body of [{ item: "" }, { item: "x", scope: alice.room }]) {
    expect((await post("rankings/result", body, alice.cookie)).status).toBe(400);
  }
});
