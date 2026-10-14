import { checkRefusal, checkInvariants } from "./state-checks.ts";
import { afterEach, afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { SessioningConcept, UnknownSession, EndSessionNotActive } from "../src/concepts/Sessioning.ts";
import { openTestDb, type TestDb } from "./test-db.ts";

let testDb: TestDb;
let sessions: SessioningConcept;
let now: Date;

const refusesWithoutChange = (operation: () => Promise<unknown>, expected: new (message?: string) => Error) =>
  checkRefusal(testDb.db, ["sessioning.sessions"], operation, expected);

beforeAll(async () => {
  testDb = await openTestDb();
}, 120_000);

beforeEach(async () => {
  await testDb.db.dropDatabase();
  now = new Date("2026-10-07T12:00:00Z");
  sessions = new SessioningConcept(testDb.db, () => now);
});

afterEach(async () => {
  if (testDb) await checkInvariants(testDb.db);
});

afterAll(async () => {
  if (testDb) await testDb.close();
});

test("a session starts, resolves, and becomes unavailable after ending", async () => {
  const issued = await sessions.start({ subject: "participant-a" });

  expect(issued.session.length).toBeGreaterThan(0);
  expect(issued.expiresAt).toEqual(new Date("2026-10-07T12:10:00Z"));
  expect(await sessions.current({ session: issued.session })).toEqual({ subject: "participant-a" });
  expect(await sessions._active({ session: issued.session })).toEqual([{
    subject: "participant-a",
    expiresAt: issued.expiresAt,
  }]);

  expect(await sessions.end({ session: issued.session })).toEqual({ ended: true });
  expect(await sessions._active({ session: issued.session })).toEqual([]);

  await refusesWithoutChange(() => sessions.current({ session: issued.session }), UnknownSession);

  await refusesWithoutChange(() => sessions.end({ session: issued.session }), EndSessionNotActive);
});

test("unknown and exactly-expired sessions are refused", async () => {
  await refusesWithoutChange(() => sessions.current({ session: "invented" }), UnknownSession);

  await refusesWithoutChange(() => sessions.end({ session: "invented" }), EndSessionNotActive);

  expect(await sessions._active({ session: "invented" })).toEqual([]);

  const issued = await sessions.start({ subject: "participant-a" });

  now = new Date(issued.expiresAt.getTime() - 1);

  expect(await sessions.current({ session: issued.session })).toEqual({ subject: "participant-a" });

  now = issued.expiresAt;

  expect(await sessions._active({ session: issued.session })).toEqual([]);

  await refusesWithoutChange(() => sessions.current({ session: issued.session }), UnknownSession);

  await refusesWithoutChange(() => sessions.end({ session: issued.session }), EndSessionNotActive);
});

test("sessions remain independent and persist across concept instances", async () => {
  const first = await sessions.start({ subject: "participant-a" });
  const second = await sessions.start({ subject: "participant-a" });
  const third = await sessions.start({ subject: "participant-b" });

  expect(new Set([first.session, second.session, third.session]).size).toBe(3);

  const reader = new SessioningConcept(testDb.db, () => now);

  expect(await reader.current({ session: first.session })).toEqual({ subject: "participant-a" });

  await sessions.end({ session: first.session });

  await refusesWithoutChange(() => reader.current({ session: first.session }), UnknownSession);

  expect(await reader.current({ session: second.session })).toEqual({ subject: "participant-a" });
  expect(await reader.current({ session: third.session })).toEqual({ subject: "participant-b" });
});
test("renewal extends the same session once per minute and cannot revive expiry", async () => {
  const issued = await sessions.start({ subject: "participant-a" });
  now = new Date(now.getTime() + 30_000);
  expect(await sessions.renew({ session: issued.session })).toEqual(issued);
  now = new Date(now.getTime() + 30_000);
  const renewed = await sessions.renew({ session: issued.session });
  expect(renewed.session).toBe(issued.session);
  expect(renewed.expiresAt.getTime()).toBe(now.getTime() + 600_000);
  expect(await sessions.renew({ session: issued.session })).toEqual(renewed);
  now = renewed.expiresAt;
  await refusesWithoutChange(() => sessions.renew({ session: issued.session }), UnknownSession);
});

test("authenticated reads record presence without extending expiry", async () => {
  const issued = await sessions.start({ subject: "participant-a" });
  now = new Date(now.getTime() + 20_000);
  expect(await sessions._present({ subject: "participant-a" })).toEqual([]);
  await sessions.current({ session: issued.session });
  expect(await sessions._present({ subject: "participant-a" })).toEqual([{ subject: "participant-a" }]);
  expect((await sessions._active({ session: issued.session }))[0]!.expiresAt).toEqual(issued.expiresAt);
});

test("purge preserves active sessions, removes expired sessions, and is idempotent", async () => {
  const issued = await sessions.start({ subject: "participant-a" });
  await sessions.purge({ session: issued.session });
  expect(await sessions.current({ session: issued.session })).toEqual({ subject: "participant-a" });
  now = issued.expiresAt;
  expect(await sessions._expired({})).toEqual([{ session: issued.session, subject: "participant-a" }]);
  await sessions.purge({ session: issued.session });
  expect(await sessions._expired({})).toEqual([]);
  await sessions.purge({ session: issued.session });
  await sessions.purge({ session: "unknown" });
  expect(await sessions._expired({})).toEqual([]);
});

test("absence expiry preserves a subject with a recently seen session and claims expiry once", async () => {
  const first = await sessions.start({ subject: "participant-a" });
  now = new Date(now.getTime() + 10_000);
  const second = await sessions.start({ subject: "participant-a" });
  expect(await sessions.expireAbsent({ subject: "participant-a" })).toEqual({ expired: false });
  expect(await sessions._active({ session: first.session })).toHaveLength(1);
  now = new Date(now.getTime() + 10_000);
  expect(await sessions.expireAbsent({ subject: "participant-a" })).toEqual({ expired: true });
  expect(await sessions.expireAbsent({ subject: "participant-a" })).toEqual({ expired: false });
  expect(await sessions._active({ session: first.session })).toEqual([]);
  expect(await sessions._active({ session: second.session })).toEqual([]);
  expect(await sessions._expired({})).toHaveLength(2);
});

test("renewal refuses unknown and ended tokens without changing a different active session", async () => {
  const live = await sessions.start({ subject: "participant-a" });
  const ended = await sessions.start({ subject: "participant-b" });
  await sessions.end({ session: ended.session });
  now = new Date(now.getTime() + 60_000);
  for (const session of ["invented", ended.session]) {
    await refusesWithoutChange(() => sessions.renew({ session }), UnknownSession);
  }
  expect(await sessions._active({ session: live.session })).toEqual([{
    subject: "participant-a", expiresAt: live.expiresAt,
  }]);
});

test("presence has an exact ten-second boundary and cannot keep an expired session active", async () => {
  const issued = await sessions.start({ subject: "participant-a" });
  now = new Date(now.getTime() + 9_999);
  expect(await sessions._present({ subject: "participant-a" })).toEqual([{ subject: "participant-a" }]);
  expect(await sessions.expireAbsent({ subject: "participant-a" })).toEqual({ expired: false });
  now = new Date(now.getTime() + 1);
  expect(await sessions._present({ subject: "participant-a" })).toEqual([]);
  expect(await sessions.expireAbsent({ subject: "participant-a" })).toEqual({ expired: true });
  await refusesWithoutChange(() => sessions.current({ session: issued.session }), UnknownSession);
  expect(await sessions.expireAbsent({ subject: "unknown" })).toEqual({ expired: false });
});

test("starting another session retains expired tokens for membership cleanup", async () => {
  const expired = await sessions.start({ subject: "participant-a" });
  now = expired.expiresAt;
  await sessions.start({ subject: "participant-b" });
  expect(await sessions._expired({})).toEqual([{ session: expired.session, subject: "participant-a" }]);
});
