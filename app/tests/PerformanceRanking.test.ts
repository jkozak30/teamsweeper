import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import {
  PerformanceRankingConcept, InvalidResult, ResultAlreadyRecorded, InvalidRanking,
} from "../src/concepts/PerformanceRanking.ts";
import { openTestDb, type TestDb } from "./test-db.ts";

let testDb: TestDb;
let ranking: PerformanceRankingConcept;

beforeAll(async () => {
  testDb = await openTestDb();
}, 120_000);

beforeEach(async () => {
  await testDb.db.dropDatabase();
  ranking = new PerformanceRankingConcept(testDb.db);
});

afterAll(async () => {
  if (testDb) await testDb.close();
});

const category = { settings: { height: 9, width: 9, mines: 10 }, status: "WON" };
const result = {
  item: "game-1", scope: "room-1", category,
  measurements: [
    { metric: "Time", value: 40 },
    { metric: "3BV", value: 12 },
    { metric: "Clicks", value: 20 },
    { metric: "3BV/s", value: 0.3 },
    { metric: "Efficiency", value: 0.6 },
  ],
};

function rank(overrides: Partial<Parameters<PerformanceRankingConcept["_rank"]>[0]> = {}) {
  return ranking._rank({ scope: "room-1", metric: "Time", ascending: true, ...overrides });
}

async function sample(item: string, time: number, speed = 1) {
  await ranking.record({
    ...result, item,
    measurements: [{ metric: "Time", value: time }, { metric: "3BV/s", value: speed }],
  });
}

test("recorded measurements persist and can be read through a new concept instance", async () => {
  expect(await ranking.record(result)).toEqual({});
  const restored = new PerformanceRankingConcept(testDb.db);
  expect(await restored._get({ item: result.item })).toEqual([{
    scope: result.scope, category, measurements: result.measurements,
  }]);
  expect(await ranking._get({ item: "missing" })).toEqual([]);
});

test("an item cannot be recorded twice, even with identical measurements", async () => {
  await ranking.record(result);
  for (const repeated of [
    result, { ...result, scope: "room-2" },
    { ...result, measurements: [{ metric: "Time", value: 1 }] },
  ]) {
    await expect(ranking.record(repeated)).rejects.toBeInstanceOf(ResultAlreadyRecorded);
  }
  expect(await ranking._get({ item: result.item })).toEqual([{
    scope: result.scope, category, measurements: result.measurements,
  }]);
  expect(await testDb.db.collection("performanceRanking.results").countDocuments()).toBe(1);
});

test("simultaneous submissions across instances create only one complete result", async () => {
  const other = new PerformanceRankingConcept(testDb.db);
  const changed = { ...result, measurements: [{ metric: "Time", value: 99 }] };
  const answers = await Promise.allSettled([ranking.record(result), other.record(changed)]);
  expect(answers.filter(answer => answer.status === "fulfilled")).toHaveLength(1);
  const refused = answers.find(answer => answer.status === "rejected");
  if (refused?.status === "rejected") expect(refused.reason).toBeInstanceOf(ResultAlreadyRecorded);
  const winner = answers[0]!.status === "fulfilled" ? result : changed;
  expect(await ranking._get({ item: result.item })).toEqual([{
    scope: winner.scope, category: winner.category, measurements: winner.measurements,
  }]);
  expect(await testDb.db.collection("performanceRanking.results").countDocuments()).toBe(1);
});

test("rankings support both directions and share positional ranks on ties", async () => {
  await sample("d", 30, 3);
  await sample("b", 20, 1);
  await sample("c", 30, 2);
  await sample("a", 20, 4);
  expect(await rank()).toEqual([
    { item: "a", value: 20, rank: 1 }, { item: "b", value: 20, rank: 1 },
    { item: "c", value: 30, rank: 3 }, { item: "d", value: 30, rank: 3 },
  ]);
  expect(await rank({ ascending: false })).toEqual([
    { item: "c", value: 30, rank: 1 }, { item: "d", value: 30, rank: 1 },
    { item: "a", value: 20, rank: 3 }, { item: "b", value: 20, rank: 3 },
  ]);
  expect((await rank({ metric: "3BV/s", ascending: false })).map(row => row.item)).toEqual(["a", "d", "c", "b"]);
});

test("scope is always filtered and category is filtered only when supplied", async () => {
  await ranking.record(result);
  const otherCategory = { ...category, status: "LOST" };
  await ranking.record({ ...result, item: "loss", category: otherCategory });
  await ranking.record({ ...result, item: "other-room", scope: "room-2" });
  expect((await rank()).map(row => row.item)).toEqual(["game-1", "loss"]);
  expect((await rank({ category })).map(row => row.item)).toEqual(["game-1"]);
  expect((await rank({ category: otherCategory })).map(row => row.item)).toEqual(["loss"]);
  expect((await rank({ scope: "room-2" })).map(row => row.item)).toEqual(["other-room"]);
});

test("compound categories compare by value regardless of object field order", async () => {
  await ranking.record(result);
  const reordered = { status: "WON", settings: { mines: 10, width: 9, height: 9 } };
  expect((await rank({ category: reordered })).map(row => row.item)).toEqual(["game-1"]);
  await ranking.record({ ...result, item: "string-category", category: "beginner" });
  expect((await rank({ category: "beginner" })).map(row => row.item)).toEqual(["string-category"]);
});

test("empty groups and missing metrics return no rows", async () => {
  expect(await rank()).toEqual([]);
  await ranking.record(result);
  await ranking.record({ ...result, item: "no-time", measurements: [{ metric: "Efficiency", value: 1 }] });
  expect((await rank()).map(row => row.item)).toEqual(["game-1"]);
  expect(await rank({ scope: "missing" })).toEqual([]);
  expect(await rank({ category: "missing" })).toEqual([]);
  expect(await rank({ metric: "missing" })).toEqual([]);
});

test("index ranges select inclusive positions and preserve ranks across page boundaries", async () => {
  await sample("d", 40);
  await sample("b", 20);
  await sample("c", 30);
  await sample("a", 20);
  expect(await rank({ from: 1, to: 2 })).toEqual([
    { item: "a", value: 20, rank: 1 }, { item: "b", value: 20, rank: 1 },
  ]);
  expect(await rank({ from: 2, to: 3 })).toEqual([
    { item: "b", value: 20, rank: 1 }, { item: "c", value: 30, rank: 3 },
  ]);
  expect(await rank({ from: 3 })).toEqual([
    { item: "c", value: 30, rank: 3 }, { item: "d", value: 40, rank: 4 },
  ]);
  expect(await rank({ to: 1 })).toEqual([{ item: "a", value: 20, rank: 1 }]);
  expect(await rank({ from: 9, to: 10 })).toEqual([]);
  expect(await testDb.db.collection("performanceRanking.results").countDocuments()).toBe(4);
});

test("arbitrary metric names and finite zero or negative values are supported", async () => {
  for (const [item, value] of [["negative", -1], ["zero", 0]] as const) {
    await ranking.record({ ...result, item, measurements: [{ metric: "$custom.metric/second", value }] });
  }
  expect((await rank({ metric: "$custom.metric/second" })).map(row => row.value)).toEqual([-1, 0]);
});

test("invalid measurements and duplicate metrics refuse without storing results", async () => {
  for (const measurements of [
    [], null, {}, [null], [{ metric: "", value: 1 }],
    [{ metric: "Time", value: NaN }], [{ metric: "Time", value: Infinity }],
    [{ metric: "Time", value: "40" }],
    [{ metric: "Time", value: 1 }, { metric: "Time", value: 1 }],
    [{ metric: "Time", value: 1 }, { metric: "Time", value: 2 }],
  ]) {
    await expect(ranking.record({ ...result, measurements } as never)).rejects.toBeInstanceOf(InvalidResult);
  }
  expect(await testDb.db.collection("performanceRanking.results").countDocuments()).toBe(0);
});

test("invalid identities or non-JSON categories refuse without storing results", async () => {
  for (const changed of [
    { item: "" }, { scope: "" }, { category: "" }, { category: null },
    { category: [] }, { category: { size: undefined } }, { category: { size: Infinity } },
  ]) {
    await expect(ranking.record({ ...result, ...changed } as never)).rejects.toBeInstanceOf(InvalidResult);
  }
  expect(await testDb.db.collection("performanceRanking.results").countDocuments()).toBe(0);
});

test("invalid ranking filters and index ranges refuse without changing recorded data", async () => {
  await ranking.record(result);
  const input = { scope: "room-1", metric: "Time", ascending: true };
  for (const changed of [
    { scope: "" }, { metric: "" }, { ascending: "true" }, { category: null },
    { category: { size: undefined } },
    { from: 0 }, { from: -1 }, { from: 1.5 }, { from: NaN },
    { to: 0 }, { to: 1.5 }, { from: 3, to: 2 }, { to: Infinity },
  ]) {
    await expect(ranking._rank({ ...input, ...changed } as never)).rejects.toBeInstanceOf(InvalidRanking);
  }
  expect(await ranking._get({ item: result.item })).toEqual([{
    scope: result.scope, category, measurements: result.measurements,
  }]);
});
