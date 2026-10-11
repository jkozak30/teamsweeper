import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { SessioningConcept, UnknownSession, EndSessionNotActive } from "../src/concepts/Sessioning.ts";
import { openTestDb, type TestDb } from "./test-db.ts";

let testDb: TestDb;
let sessions: SessioningConcept;
let now: Date;

beforeAll(async () => {
  testDb = await openTestDb();
}, 120_000);

beforeEach(async () => {
  await testDb.db.dropDatabase();
  now = new Date("2026-10-07T12:00:00Z");
  sessions = new SessioningConcept(testDb.db, () => now);
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

  await expect(
    sessions.current({ session: issued.session }),
  ).rejects.toBeInstanceOf(UnknownSession);

  await expect(
    sessions.end({ session: issued.session }),
  ).rejects.toBeInstanceOf(EndSessionNotActive);
});

test("unknown and exactly-expired sessions are refused", async () => {
  await expect(
    sessions.current({ session: "invented" }),
  ).rejects.toBeInstanceOf(UnknownSession);

  await expect(
    sessions.end({ session: "invented" }),
  ).rejects.toBeInstanceOf(EndSessionNotActive);

  expect(await sessions._active({ session: "invented" })).toEqual([]);

  const issued = await sessions.start({ subject: "participant-a" });

  now = new Date(issued.expiresAt.getTime() - 1);

  expect(await sessions.current({ session: issued.session })).toEqual({ subject: "participant-a" });

  now = issued.expiresAt;

  expect(await sessions._active({ session: issued.session })).toEqual([]);

  await expect(
    sessions.current({ session: issued.session }),
  ).rejects.toBeInstanceOf(UnknownSession);

  await expect(
    sessions.end({ session: issued.session }),
  ).rejects.toBeInstanceOf(EndSessionNotActive);
});

test("sessions remain independent and persist across concept instances", async () => {
  const first = await sessions.start({ subject: "participant-a" });
  const second = await sessions.start({ subject: "participant-a" });
  const third = await sessions.start({ subject: "participant-b" });

  expect(new Set([first.session, second.session, third.session]).size).toBe(3);

  const reader = new SessioningConcept(testDb.db, () => now);

  expect(await reader.current({ session: first.session })).toEqual({ subject: "participant-a" });

  await sessions.end({ session: first.session });

  await expect(
    reader.current({ session: first.session }),
  ).rejects.toBeInstanceOf(UnknownSession);

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
  await expect(sessions.renew({ session: issued.session })).rejects.toBeInstanceOf(UnknownSession);
});

test("authenticated reads record presence without extending expiry", async () => {
  const issued = await sessions.start({ subject: "participant-a" });
  now = new Date(now.getTime() + 20_000);
  expect(await sessions._present({ subject: "participant-a" })).toEqual([]);
  await sessions.current({ session: issued.session });
  expect(await sessions._present({ subject: "participant-a" })).toEqual([{ subject: "participant-a" }]);
  expect((await sessions._active({ session: issued.session }))[0]!.expiresAt).toEqual(issued.expiresAt);
});

test("legacy sessions adopt ten minutes on renewal and active purge is harmless", async () => {
  await testDb.db.collection<{ _id: string; subject: string; expiresAt: Date }>("sessioning.sessions").insertOne({
    _id: "legacy", subject: "participant-a", expiresAt: new Date(now.getTime() + 1_800_000),
  });
  const renewed = await sessions.renew({ session: "legacy" });
  expect(renewed.expiresAt.getTime()).toBe(now.getTime() + 600_000);
  await sessions.purge({ session: "legacy" });
  expect(await sessions.current({ session: "legacy" })).toEqual({ subject: "participant-a" });
  now = renewed.expiresAt;
  expect(await sessions._expired({})).toEqual([{ session: "legacy", subject: "participant-a" }]);
  await sessions.purge({ session: "legacy" });
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
