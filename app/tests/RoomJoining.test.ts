import { MAX_NAME_LENGTH } from "../src/limits.ts";
import type { Db } from "mongodb";
import { checkRefusal, checkInvariants, storedState } from "./state-checks.ts";
import { afterEach, afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import {
  RoomJoiningConcept, CreateNameRequired, JoinNameRequired, RoomUnavailable,
  CreateNameTooLong, JoinNameTooLong,
  ParticipantNotActive, RoomNotOpen, GameAlreadyAssociated, HostRequired,
} from "../src/concepts/RoomJoining.ts";
import { openTestDb, type TestDb } from "./test-db.ts";

let testDb: TestDb;
let rooms: RoomJoiningConcept;

const refusesWithoutChange = (operation: () => Promise<unknown>, expected: new (message?: string) => Error) =>
  checkRefusal(testDb.db, ["roomJoining.rooms","roomJoining.participants"], operation, expected);

beforeAll(async () => {
  testDb = await openTestDb();
}, 120_000);

beforeEach(async () => {
  await testDb.db.dropDatabase();
  rooms = new RoomJoiningConcept(testDb.db);
});

afterEach(async () => {
  if (testDb) await checkInvariants(testDb.db);
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
  expect(await rooms._getParticipant({ participant: alice.participant })).toEqual([
    { room: alice.room, name: "Alice", active: true },
  ]);

  const bob = await rooms.join({ code: alice.code, name: "Bob" });

  expect(bob.participant).not.toBe(alice.participant);
  expect(await rooms._getParticipant({ participant: bob.participant })).toEqual([
    { room: alice.room, name: "Bob", active: true },
  ]);

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
  expect(await rooms._getParticipant({ participant: alice.participant })).toEqual([
    { room: alice.room, name: "Alice", active: false },
  ]);
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
  expect(await rooms._getParticipant({ participant: second.participant })).toEqual([
    { room: first.room, name: "Alice", active: true },
  ]);
  expect(await rooms._activeParticipants({ room: first.room })).toHaveLength(2);
});

test("invalid creation and joining are refused without adding members", async () => {
  await refusesWithoutChange(() => rooms.create({ name: "" }), CreateNameRequired);

  const alice = await rooms.create({ name: "Alice" });

  await refusesWithoutChange(() => rooms.join({ code: alice.code, name: "" }), JoinNameRequired);

  await refusesWithoutChange(() => rooms.join({ code: "INVALID", name: "Bob" }), RoomUnavailable);

  expect(await rooms._activeParticipants({ room: alice.room })).toEqual([
    { participant: alice.participant, name: "Alice" },
  ]);

  await rooms.leave({ participant: alice.participant });

  await refusesWithoutChange(() => rooms.join({ code: alice.code, name: "Bob" }), RoomUnavailable);

  expect(await rooms._activeParticipants({ room: alice.room })).toEqual([]);
  expect(await rooms._getRoom({ room: alice.room })).toEqual([
    { code: alice.code, status: "CLOSED" },
  ]);
});

test("unknown and inactive participants cannot leave", async () => {
  const alice = await rooms.create({ name: "Alice" });

  await refusesWithoutChange(() => rooms.leave({ participant: crypto.randomUUID() }), ParticipantNotActive);

  expect(await rooms._activeParticipants({ room: alice.room })).toEqual([
    { participant: alice.participant, name: "Alice" },
  ]);

  await rooms.leave({ participant: alice.participant });

  await refusesWithoutChange(() => rooms.leave({ participant: alice.participant }), ParticipantNotActive);

  expect(await rooms._getRoom({ room: alice.room })).toEqual([
    { code: alice.code, status: "CLOSED" },
  ]);
});

test("new games replace the current game but earlier games remain associated", async () => {
  const alice = await rooms.create({ name: "Alice" });
  const first = crypto.randomUUID();
  const second = crypto.randomUUID();

  await rooms.associate({ room: alice.room, game: first });
  expect((await rooms._getRoom({ room: alice.room }))[0]!.currentGame).toBe(first);

  await rooms.associate({ room: alice.room, game: second });

  for (const game of [first, second]) {
    await refusesWithoutChange(() => rooms.associate({ room: alice.room, game }), GameAlreadyAssociated);
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

  await refusesWithoutChange(() => rooms.associate({ room: bob.room, game }), GameAlreadyAssociated);

  expect((await rooms._getRoom({ room: bob.room }))[0]!.currentGame).toBeUndefined();
  expect((await rooms._getRoom({ room: alice.room }))[0]!.currentGame).toBe(game);

  await rooms.leave({ participant: bob.participant });

  for (const room of [bob.room, crypto.randomUUID()]) {
    await refusesWithoutChange(() => rooms.associate({ room, game: crypto.randomUUID() }), RoomNotOpen);
  }

  expect(await rooms._getRoom({ room: bob.room })).toEqual([
    { code: bob.code, status: "CLOSED" },
  ]);
});

test("queries handle unknown identities and read persisted state", async () => {
  expect(await rooms._getRoom({ room: crypto.randomUUID() })).toEqual([]);
  expect(await rooms._getParticipant({ participant: crypto.randomUUID() })).toEqual([]);
  expect(await rooms._activeParticipants({ room: crypto.randomUUID() })).toEqual([]);

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
  expect(await reader._getParticipant({ participant: alice.participant })).toEqual([
    { room: alice.room, name: "Alice", active: true },
  ]);
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

  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);

  const failures = results.filter(result => result.status === "rejected");
  expect(failures).toHaveLength(1);
  expect(failures[0]!.reason).toBeInstanceOf(GameAlreadyAssociated);

  const roomIds = [alice.room, bob.room];

  for (const [index, result] of results.entries()) {
    const [room] = await rooms._getRoom({ room: roomIds[index]! });
    expect(room!.status).toBe("OPEN");
    expect(room!.currentGame).toBe(result.status === "fulfilled" ? game : undefined);
  }
});
test("reassigning host preserves membership and refuses a former host", async () => {
  const alice = await rooms.create({ name: "Alice" });
  const bob = await rooms.join({ code: alice.code, name: "Bob" });
  await refusesWithoutChange(() => rooms.reassignHost({ actor: bob.participant, newHost: alice.participant }), HostRequired);
  const game = crypto.randomUUID();
  await rooms.associate({ room: alice.room, game });
  await rooms.reassignHost({ actor: alice.participant, newHost: bob.participant });
  expect((await rooms._getRoom({ room: alice.room }))[0]!.currentGame).toBe(game);
  expect((await rooms._getRoom({ room: alice.room }))[0]!.host).toBe(bob.participant);
  expect(await rooms._activeParticipants({ room: alice.room })).toHaveLength(2);
  await refusesWithoutChange(() => rooms.reassignHost({ actor: alice.participant, newHost: alice.participant }), HostRequired);
});

test("reassigning host refuses absent and foreign-room targets", async () => {
  const alice = await rooms.create({ name: "Alice" });
  const bob = await rooms.join({ code: alice.code, name: "Bob" });
  const carol = await rooms.create({ name: "Carol" });
  await refusesWithoutChange(() => rooms.reassignHost({ actor: alice.participant, newHost: carol.participant }), ParticipantNotActive);
  await rooms.leave({ participant: bob.participant });
  await refusesWithoutChange(() => rooms.reassignHost({ actor: alice.participant, newHost: bob.participant }), ParticipantNotActive);
  expect((await rooms._getRoom({ room: alice.room }))[0]!.host).toBe(alice.participant);
});

test("reassignment refuses unknown and departed actors without changing either room", async () => {
  const alice = await rooms.create({ name: "Alice" });
  const bob = await rooms.join({ code: alice.code, name: "Bob" });
  for (const actor of ["missing", bob.participant]) {
    if (actor === bob.participant) await rooms.leave({ participant: actor });
    await refusesWithoutChange(() => rooms.reassignHost({ actor, newHost: alice.participant }), ParticipantNotActive);
  }
  expect((await rooms._getRoom({ room: alice.room }))[0]!.host).toBe(alice.participant);
});

test("simultaneous reassignments across instances accept only the current host's first transfer", async () => {
  const alice = await rooms.create({ name: "Alice" });
  const bob = await rooms.join({ code: alice.code, name: "Bob" });
  const carol = await rooms.join({ code: alice.code, name: "Carol" });
  const other = new RoomJoiningConcept(testDb.db);
  const targets = [bob.participant, carol.participant];
  const attempts = await Promise.allSettled([
    rooms.reassignHost({ actor: alice.participant, newHost: targets[0]! }),
    other.reassignHost({ actor: alice.participant, newHost: targets[1]! }),
  ]);
  expect(attempts.filter(attempt => attempt.status === "fulfilled")).toHaveLength(1);
  const refused = attempts.find(attempt => attempt.status === "rejected");
  expect(refused!.status).toBe("rejected");
  if (refused!.status === "rejected") expect(refused!.reason).toBeInstanceOf(HostRequired);
  expect((await rooms._getRoom({ room: alice.room }))[0]!.host)
    .toBe(targets[attempts.findIndex(attempt => attempt.status === "fulfilled")]);
  expect(await rooms._activeParticipants({ room: alice.room })).toHaveLength(3);
});

test("failed participant insertion during creation removes the provisional room", async () => {
  const collections = ["roomJoining.rooms", "roomJoining.participants"];
  await rooms.create({ name: "Existing room" });
  const before = await storedState(testDb.db, collections);
  let injected = false;
  const failure = new Error("Injected participant insertion failure");
  const failingDb = Object.create(testDb.db) as Db;
  failingDb.collection = ((name: string) => {
    const collection = testDb.db.collection(name);
    if (name !== "roomJoining.participants") return collection;
    return Object.assign(Object.create(collection), {
      insertOne: async () => { injected = true; throw failure; },
    });
  }) as Db["collection"];
  const failing = new RoomJoiningConcept(failingDb);
  await expect(failing.create({ name: "Alice" })).rejects.toBeInstanceOf(Error);
  expect(injected).toBe(true);
  expect(await storedState(testDb.db, collections)).toEqual(before);
});


test("names are trimmed and the exact length boundary is accepted", async () => {
  const name = "n".repeat(MAX_NAME_LENGTH);
  const host = await rooms.create({ name: `  ${name}  ` });
  const guest = await rooms.join({ code: host.code, name: ` ${name} ` });
  expect((await rooms._getParticipant({ participant: host.participant }))[0]!.name).toBe(name);
  expect((await rooms._getParticipant({ participant: guest.participant }))[0]!.name).toBe(name);
});

test("blank and oversized names refuse before creating membership", async () => {
  const host = await rooms.create({ name: "Alice" });
  for (const name of [" ", "\t\n"]) {
    await refusesWithoutChange(() => rooms.create({ name }), CreateNameRequired);
    await refusesWithoutChange(() => rooms.join({ code: host.code, name }), JoinNameRequired);
  }
  for (const name of ["n".repeat(MAX_NAME_LENGTH + 1), "😀".repeat(17)]) {
    await refusesWithoutChange(() => rooms.create({ name }), CreateNameTooLong);
    await refusesWithoutChange(() => rooms.join({ code: host.code, name }), JoinNameTooLong);
  }
});
