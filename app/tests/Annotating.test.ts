import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { AnnotatingConcept, AlreadyHighlighted, HighlightNotFound } from "../src/concepts/Annotating.ts";
import { openTestDb, type TestDb } from "./test-db.ts";

let testDb: TestDb;
let annotating: AnnotatingConcept;

beforeAll(async () => {
  testDb = await openTestDb();
}, 120_000);

beforeEach(async () => {
  await testDb.db.dropDatabase();
  annotating = new AnnotatingConcept(testDb.db);
});

afterAll(async () => {
  if (testDb) await testDb.close();
});

test("a user highlights, removes, and highlights an item again", async () => {
  expect(await annotating.highlight({ user: "alice", item: "cell-1" })).toEqual({});

  expect(await annotating._forItem({ item: "cell-1" })).toEqual([{ author: "alice" }]);
  expect(await annotating._byUser({ user: "alice" })).toEqual([{ target: "cell-1" }]);

  expect(await annotating.remove({ user: "alice", item: "cell-1" })).toEqual({});

  expect(await annotating._forItem({ item: "cell-1" })).toEqual([]);
  expect(await annotating._byUser({ user: "alice" })).toEqual([]);

  await annotating.highlight({ user: "alice", item: "cell-1" });
  expect(await annotating._forItem({ item: "cell-1" })).toEqual([{ author: "alice" }]);
});

test("duplicate highlights are refused without changing existing annotations", async () => {
  await annotating.highlight({ user: "alice", item: "cell-1" });

  await expect(
    annotating.highlight({ user: "alice", item: "cell-1" }),
  ).rejects.toBeInstanceOf(AlreadyHighlighted);

  expect(await annotating._forItem({ item: "cell-1" })).toEqual([{ author: "alice" }]);
  expect(await testDb.db.collection("annotating.annotations").countDocuments()).toBe(1);
});

test("users can share a target and removing one highlight preserves the other", async () => {
  await annotating.highlight({ user: "alice", item: "cell-1" });
  await annotating.highlight({ user: "bob", item: "cell-1" });

  expect(await annotating._forItem({ item: "cell-1" })).toEqual([
    { author: "alice" }, { author: "bob" },
  ]);

  await annotating.remove({ user: "alice", item: "cell-1" });

  expect(await annotating._forItem({ item: "cell-1" })).toEqual([{ author: "bob" }]);
  expect(await annotating._byUser({ user: "alice" })).toEqual([]);
  expect(await annotating._byUser({ user: "bob" })).toEqual([{ target: "cell-1" }]);
});

test("missing and already-removed highlights are refused without removing another user's highlight", async () => {
  await annotating.highlight({ user: "alice", item: "cell-1" });

  for (const input of [
    { user: "bob", item: "cell-1" },
    { user: "alice", item: "missing" },
  ]) {
    await expect(annotating.remove(input)).rejects.toBeInstanceOf(HighlightNotFound);
  }

  expect(await annotating._forItem({ item: "cell-1" })).toEqual([{ author: "alice" }]);

  await annotating.remove({ user: "alice", item: "cell-1" });
  await expect(
    annotating.remove({ user: "alice", item: "cell-1" }),
  ).rejects.toBeInstanceOf(HighlightNotFound);
});

test("clear removes all of one user's highlights and is safe to repeat", async () => {
  for (const user of ["alice", "bob"]) {
    for (const item of ["cell-1", "cell-2"]) {
      await annotating.highlight({ user, item });
    }
  }

  expect(await annotating.clear({ user: "alice" })).toEqual({});
  expect(await annotating._byUser({ user: "alice" })).toEqual([]);
  expect(await annotating._byUser({ user: "bob" })).toEqual([
    { target: "cell-1" }, { target: "cell-2" },
  ]);
  expect(await annotating._forItem({ item: "cell-1" })).toEqual([{ author: "bob" }]);
  expect(await annotating._forItem({ item: "cell-2" })).toEqual([{ author: "bob" }]);

  expect(await annotating.clear({ user: "alice" })).toEqual({});
  expect(await annotating.clear({ user: "unknown" })).toEqual({});
  expect(await testDb.db.collection("annotating.annotations").countDocuments()).toBe(2);
});

test("queries handle unknown identities and return persisted annotations in order", async () => {
  expect(await annotating._forItem({ item: "unknown" })).toEqual([]);
  expect(await annotating._byUser({ user: "unknown" })).toEqual([]);

  await annotating.highlight({ user: "bob", item: "cell-2" });
  await annotating.highlight({ user: "alice", item: "cell-2" });
  await annotating.highlight({ user: "alice", item: "cell-1" });

  const restored = new AnnotatingConcept(testDb.db);

  expect(await restored._forItem({ item: "cell-2" })).toEqual([
    { author: "alice" }, { author: "bob" },
  ]);
  expect(await restored._byUser({ user: "alice" })).toEqual([
    { target: "cell-1" }, { target: "cell-2" },
  ]);
});

test("pair identities do not collide when names contain separators or quotes", async () => {
  const pairs = [
    { user: "a:b", item: "c" },
    { user: "a", item: "b:c" },
    { user: 'a"b', item: "c" },
  ];

  for (const pair of pairs) await annotating.highlight(pair);

  expect(await annotating._byUser({ user: "a:b" })).toEqual([{ target: "c" }]);
  expect(await annotating._byUser({ user: "a" })).toEqual([{ target: "b:c" }]);
  expect(await annotating._byUser({ user: 'a"b' })).toEqual([{ target: "c" }]);
  expect(await testDb.db.collection("annotating.annotations").countDocuments()).toBe(3);
});

test("simultaneous duplicate highlights across instances create exactly one annotation", async () => {
  const other = new AnnotatingConcept(testDb.db);
  const input = { user: "alice", item: "cell-1" };

  const results = await Promise.allSettled([
    annotating.highlight(input),
    other.highlight(input),
  ]);

  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);

  const rejected = results.find(result => result.status === "rejected");
  expect(rejected?.status).toBe("rejected");

  if (rejected?.status === "rejected") {
    expect(rejected.reason).toBeInstanceOf(AlreadyHighlighted);
  }

  expect(await annotating._forItem({ item: "cell-1" })).toEqual([{ author: "alice" }]);
  expect(await testDb.db.collection("annotating.annotations").countDocuments()).toBe(1);
});

test("compound items compare by value, including reordered object fields", async () => {
  const item = {
    game: "game-1",
    coord: { row: 2, column: 3 },
  };
  const equivalent = {
    coord: { column: 3, row: 2 },
    game: "game-1",
  };

  await annotating.highlight({ user: "alice", item });

  const restored = new AnnotatingConcept(testDb.db);

  expect(await restored._forItem({ item: equivalent })).toEqual([{ author: "alice" }]);
  expect(await restored._byUser({ user: "alice" })).toEqual([{ target: item }]);

  await expect(
    restored.highlight({ user: "alice", item: equivalent }),
  ).rejects.toBeInstanceOf(AlreadyHighlighted);

  expect(
    await restored._forItem({ item: { ...item, game: "game-2" } }),
  ).toEqual([]);

  expect(
    await restored._forItem({ item: { ...item, coord: { row: 2, column: 4 } } }),
  ).toEqual([]);

  await restored.remove({ user: "alice", item: equivalent });

  expect(await annotating._byUser({ user: "alice" })).toEqual([]);
});

test("simultaneous equivalent compound items create only one annotation", async () => {
  const other = new AnnotatingConcept(testDb.db);

  const results = await Promise.allSettled([
    annotating.highlight({
      user: "alice",
      item: { game: "g", coord: { row: 0, column: 1 } },
    }),
    other.highlight({
      user: "alice",
      item: { coord: { column: 1, row: 0 }, game: "g" },
    }),
  ]);

  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);

  const rejected = results.find(result => result.status === "rejected");
  if (rejected?.status === "rejected") {
    expect(rejected.reason).toBeInstanceOf(AlreadyHighlighted);
  }

  expect(await testDb.db.collection("annotating.annotations").countDocuments()).toBe(1);
});