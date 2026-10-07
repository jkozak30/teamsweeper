import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import {
  SessioningConcept,
  UnknownSession,
  EndSessionNotActive,
} from "../src/concepts/Sessioning.ts";
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
  expect(issued.expiresAt).toEqual(new Date("2026-10-07T12:30:00Z"));
  expect(await sessions.current({ session: issued.session }))
    .toEqual({ subject: "participant-a" });
  expect(await sessions._active({ session: issued.session })).toEqual([{
    subject: "participant-a",
    expiresAt: issued.expiresAt,
  }]);

  expect(await sessions.end({ session: issued.session }))
    .toEqual({ ended: true });
  expect(await sessions._active({ session: issued.session })).toEqual([]);

  await expect(sessions.current({ session: issued.session }))
    .rejects.toBeInstanceOf(UnknownSession);
  await expect(sessions.end({ session: issued.session }))
    .rejects.toBeInstanceOf(EndSessionNotActive);
});

test("unknown and exactly-expired sessions are refused", async () => {
  await expect(sessions.current({ session: "invented" }))
    .rejects.toBeInstanceOf(UnknownSession);
  await expect(sessions.end({ session: "invented" }))
    .rejects.toBeInstanceOf(EndSessionNotActive);
  expect(await sessions._active({ session: "invented" })).toEqual([]);

  const issued = await sessions.start({ subject: "participant-a" });

  now = new Date(issued.expiresAt.getTime() - 1);
  expect(await sessions.current({ session: issued.session }))
    .toEqual({ subject: "participant-a" });

  now = issued.expiresAt;
  expect(await sessions._active({ session: issued.session })).toEqual([]);
  await expect(sessions.current({ session: issued.session }))
    .rejects.toBeInstanceOf(UnknownSession);
  await expect(sessions.end({ session: issued.session }))
    .rejects.toBeInstanceOf(EndSessionNotActive);
});

test("sessions remain independent and persist across concept instances", async () => {
  const first = await sessions.start({ subject: "participant-a" });
  const second = await sessions.start({ subject: "participant-a" });
  const third = await sessions.start({ subject: "participant-b" });

  expect(new Set([first.session, second.session, third.session]).size).toBe(3);

  const reader = new SessioningConcept(testDb.db, () => now);
  expect(await reader.current({ session: first.session }))
    .toEqual({ subject: "participant-a" });

  await sessions.end({ session: first.session });

  await expect(reader.current({ session: first.session }))
    .rejects.toBeInstanceOf(UnknownSession);
  expect(await reader.current({ session: second.session }))
    .toEqual({ subject: "participant-a" });
  expect(await reader.current({ session: third.session }))
    .toEqual({ subject: "participant-b" });
});