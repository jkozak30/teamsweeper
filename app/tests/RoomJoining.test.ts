import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import {
  RoomJoiningConcept,
  CreateNameRequired,
  JoinNameRequired,
  RoomUnavailable,
  ParticipantNotActive,
  RoomNotOpen,
  GameAlreadyAssociated,
} from "../src/concepts/RoomJoining.ts";
import { openTestDb, type TestDb } from "./test-db.ts";

let testDb: TestDb;
let rooms: RoomJoiningConcept;

beforeAll(async () => {
  testDb = await openTestDb();
}, 120_000);

beforeEach(async () => {
  await testDb.db.dropDatabase();
  rooms = new RoomJoiningConcept(testDb.db);
});

afterAll(async () => {
  if (testDb) await testDb.close();
});

test("friends create, join, leave, and close a room", async () => {
  const alice = await rooms.create({ name: "Alice" });

  expect(alice.code.length).toBeGreaterThan(0);
  expect(await rooms._getRoom({ room: alice.room })).toEqual([{
    code: alice.code,
    status: "OPEN",
    host: alice.participant,
  }]);
  expect(await rooms._getParticipant({
    participant: alice.participant,
  })).toEqual([{ room: alice.room, name: "Alice", active: true }]);

  const bob = await rooms.join({ code: alice.code, name: "Bob" });

  expect(bob.participant).not.toBe(alice.participant);
  expect(await rooms._getParticipant({
    participant: bob.participant,
  })).toEqual([{ room: alice.room, name: "Bob", active: true }]);

  const members = [
    { participant: alice.participant, name: "Alice" },
    { participant: bob.participant, name: "Bob" },
  ].sort((a, b) => a.participant < b.participant ? -1 : 1);

  expect(await rooms._activeParticipants({ room: alice.room })).toEqual(members);

  await rooms.leave({ participant: alice.participant });

  expect(await rooms._getRoom({ room: alice.room })).toEqual([{
    code: alice.code,
    status: "OPEN",
    host: bob.participant,
  }]);
  expect(await rooms._getParticipant({
    participant: alice.participant,
  })).toEqual([{ room: alice.room, name: "Alice", active: false }]);
  expect(await rooms._activeParticipants({ room: alice.room })).toEqual([
    { participant: bob.participant, name: "Bob" },
  ]);

  await rooms.leave({ participant: bob.participant });

  expect(await rooms._getRoom({ room: alice.room })).toEqual([
    { code: alice.code, status: "CLOSED" },
  ]);
  expect(await rooms._activeParticipants({ room: alice.room })).toEqual([]);
});

test("rooms stay separate and a non-host departure preserves the host", async () => {
  const alice = await rooms.create({ name: "Alice" });
  const bob = await rooms.join({ code: alice.code, name: "Bob" });
  const charlie = await rooms.create({ name: "Charlie" });

  expect(alice.room).not.toBe(charlie.room);
  expect(alice.code).not.toBe(charlie.code);

  await rooms.leave({ participant: bob.participant });

  expect(await rooms._getRoom({ room: alice.room })).toEqual([{
    code: alice.code,
    status: "OPEN",
    host: alice.participant,
  }]);
  expect(await rooms._activeParticipants({ room: alice.room })).toEqual([
    { participant: alice.participant, name: "Alice" },
  ]);
  expect(await rooms._getRoom({ room: charlie.room })).toEqual([{
    code: charlie.code,
    status: "OPEN",
    host: charlie.participant,
  }]);
  expect(await rooms._activeParticipants({ room: charlie.room })).toEqual([
    { participant: charlie.participant, name: "Charlie" },
  ]);
});

test("duplicate display names still produce distinct participants", async () => {
  const first = await rooms.create({ name: "Alice" });
  const second = await rooms.join({ code: first.code, name: "Alice" });

  expect(second.participant).not.toBe(first.participant);
  expect(await rooms._getParticipant({
    participant: second.participant,
  })).toEqual([{ room: first.room, name: "Alice", active: true }]);
  expect(await rooms._activeParticipants({ room: first.room })).toHaveLength(2);
});

test("invalid creation and joining are refused without adding members", async () => {
  await expect(rooms.create({ name: "" }))
    .rejects.toBeInstanceOf(CreateNameRequired);

  const alice = await rooms.create({ name: "Alice" });

  await expect(rooms.join({ code: alice.code, name: "" }))
    .rejects.toBeInstanceOf(JoinNameRequired);
  await expect(rooms.join({ code: "INVALID", name: "Bob" }))
    .rejects.toBeInstanceOf(RoomUnavailable);

  expect(await rooms._activeParticipants({ room: alice.room })).toEqual([
    { participant: alice.participant, name: "Alice" },
  ]);

  await rooms.leave({ participant: alice.participant });

  await expect(rooms.join({ code: alice.code, name: "Bob" }))
    .rejects.toBeInstanceOf(RoomUnavailable);
  expect(await rooms._activeParticipants({ room: alice.room })).toEqual([]);
  expect(await rooms._getRoom({ room: alice.room })).toEqual([
    { code: alice.code, status: "CLOSED" },
  ]);
});

test("unknown and inactive participants cannot leave", async () => {
  const alice = await rooms.create({ name: "Alice" });

  await expect(rooms.leave({ participant: crypto.randomUUID() }))
    .rejects.toBeInstanceOf(ParticipantNotActive);
  expect(await rooms._activeParticipants({ room: alice.room })).toEqual([
    { participant: alice.participant, name: "Alice" },
  ]);

  await rooms.leave({ participant: alice.participant });

  await expect(rooms.leave({ participant: alice.participant }))
    .rejects.toBeInstanceOf(ParticipantNotActive);
  expect(await rooms._getRoom({ room: alice.room })).toEqual([
    { code: alice.code, status: "CLOSED" },
  ]);
});

test("new games replace the current game but earlier games remain associated", async () => {
  const alice = await rooms.create({ name: "Alice" });
  const first = crypto.randomUUID();
  const second = crypto.randomUUID();

  await rooms.associate({ room: alice.room, game: first });
  expect((await rooms._getRoom({ room: alice.room }))[0]!.currentGame)
    .toBe(first);

  await rooms.associate({ room: alice.room, game: second });

  for (const game of [first, second]) {
    await expect(rooms.associate({ room: alice.room, game }))
      .rejects.toBeInstanceOf(GameAlreadyAssociated);
  }

  expect(await rooms._getRoom({ room: alice.room })).toEqual([{
    code: alice.code,
    status: "OPEN",
    host: alice.participant,
    currentGame: second,
  }]);
});

test("missing or closed rooms and games belonging elsewhere are rejected", async () => {
  const alice = await rooms.create({ name: "Alice" });
  const bob = await rooms.create({ name: "Bob" });
  const game = crypto.randomUUID();

  await rooms.associate({ room: alice.room, game });

  await expect(rooms.associate({ room: bob.room, game }))
    .rejects.toBeInstanceOf(GameAlreadyAssociated);
  expect((await rooms._getRoom({ room: bob.room }))[0]!.currentGame)
    .toBeUndefined();
  expect((await rooms._getRoom({ room: alice.room }))[0]!.currentGame)
    .toBe(game);

  await rooms.leave({ participant: bob.participant });

  for (const room of [bob.room, crypto.randomUUID()]) {
    await expect(rooms.associate({ room, game: crypto.randomUUID() }))
      .rejects.toBeInstanceOf(RoomNotOpen);
  }

  expect(await rooms._getRoom({ room: bob.room })).toEqual([
    { code: bob.code, status: "CLOSED" },
  ]);
});

test("queries handle unknown identities and read persisted state", async () => {
  expect(await rooms._getRoom({ room: crypto.randomUUID() })).toEqual([]);
  expect(await rooms._getParticipant({
    participant: crypto.randomUUID(),
  })).toEqual([]);
  expect(await rooms._activeParticipants({
    room: crypto.randomUUID(),
  })).toEqual([]);

  const alice = await rooms.create({ name: "Alice" });
  const game = crypto.randomUUID();
  await rooms.associate({ room: alice.room, game });

  const reader = new RoomJoiningConcept(testDb.db);

  expect(await reader._getRoom({ room: alice.room })).toEqual([{
    code: alice.code,
    status: "OPEN",
    host: alice.participant,
    currentGame: game,
  }]);
  expect(await reader._getParticipant({
    participant: alice.participant,
  })).toEqual([{ room: alice.room, name: "Alice", active: true }]);
  expect(await reader._activeParticipants({ room: alice.room })).toEqual([
    { participant: alice.participant, name: "Alice" },
  ]);
});

test("concurrent association across instances gives a game to exactly one room", async () => {
  const alice = await rooms.create({ name: "Alice" });
  const bob = await rooms.create({ name: "Bob" });
  const otherInstance = new RoomJoiningConcept(testDb.db);
  const game = crypto.randomUUID();

  const results = await Promise.allSettled([
    rooms.associate({ room: alice.room, game }),
    otherInstance.associate({ room: bob.room, game }),
  ]);

  expect(results.filter(result => result.status === "fulfilled"))
    .toHaveLength(1);

  const failures = results.filter(result => result.status === "rejected");
  expect(failures).toHaveLength(1);
  expect(failures[0]!.reason).toBeInstanceOf(GameAlreadyAssociated);

  const roomIds = [alice.room, bob.room];

  for (const [index, result] of results.entries()) {
    const [room] = await rooms._getRoom({ room: roomIds[index]! });
    expect(room!.status).toBe("OPEN");
    expect(room!.currentGame).toBe(
      result.status === "fulfilled" ? game : undefined,
    );
  }
});