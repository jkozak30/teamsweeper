import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { createTestApp } from "./test-app.ts";

import { applicationConceptSet } from "../src/concepts.ts";
import { composition } from "../src/compositions/Rooms.ts";
import { RoomJoiningConcept } from "../src/concepts/RoomJoining.ts";
import { SessioningConcept } from "../src/concepts/Sessioning.ts";
import { MinesweeperPlayingConcept } from "../src/concepts/MinesweeperPlaying.ts";
import { AnnotatingConcept } from "../src/concepts/Annotating.ts";
import { policy } from "../src/http.ts";
import { openTestDb, type TestDb } from "./test-db.ts";

let testDb: TestDb;
let api: ReturnType<typeof createTestApp>["api"];
let rooms: ReturnType<typeof createTestApp>["rooms"];
let now: Date;

const origin = policy.publicOrigin ?? "http://127.0.0.1:3000";

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
  requestOrigin = origin,
) {
  const response = await api(new Request(`${origin}/api/rooms/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: requestOrigin,
      ...(cookie === undefined ? {} : { Cookie: cookie }),
    },
    body: JSON.stringify(body),
  }));

  const data = await response.json() as Record<string, unknown>;
  return { response, data };
}

function stringField(data: Record<string, unknown>, name: string): string {
  const value = data[name];
  if (typeof value !== "string") {
    throw new Error(`Expected a string response field: ${name}`);
  }
  return value;
}

function sessionCookie(response: Response): string {
  const header = response.headers.get("Set-Cookie");
  if (!header) throw new Error("Expected a session cookie.");
  return header.split(";")[0]!;
}

test("Create and Join issue private cookies identifying distinct participants", async () => {
  const alice = await post("create", { name: "Alice" });

  expect(alice.response.status).toBe(200);
  expect(alice.response.headers.get("Set-Cookie")).toContain("HttpOnly");
  expect(alice.data).not.toHaveProperty("session");
  expect(alice.data).not.toHaveProperty("expiresAt");

  const room = stringField(alice.data, "room");
  const code = stringField(alice.data, "code");
  const aliceId = stringField(alice.data, "participant");
  const aliceCookie = sessionCookie(alice.response);

  const bob = await post("join", { code, name: "Bob" });
  expect(bob.response.status).toBe(200);
  expect(bob.response.headers.get("Set-Cookie")).toContain("HttpOnly");
  expect(bob.data).not.toHaveProperty("session");
  expect(bob.data).not.toHaveProperty("expiresAt");

  const bobId = stringField(bob.data, "participant");
  const bobCookie = sessionCookie(bob.response);

  expect(bobId).not.toBe(aliceId);
  expect(bobCookie).not.toBe(aliceCookie);

  const aliceCurrent = await post("current", {}, aliceCookie);
  const bobCurrent = await post("current", {}, bobCookie);
  expect(aliceCurrent.response.status).toBe(200);
  expect(aliceCurrent.data).toMatchObject({ participant: aliceId });
  expect(bobCurrent.response.status).toBe(200);
  expect(bobCurrent.data).toMatchObject({ participant: bobId });

  expect(await rooms._getParticipant({ participant: bobId }))
    .toEqual([{ room, name: "Bob", active: true }]);
  expect((await rooms._getRoom({ room }))[0]!.host).toBe(aliceId);
  expect(await rooms._activeParticipants({ room })).toHaveLength(2);
});

test("invalid Create and Join requests return errors without adding members", async () => {
  for (const body of [{}, { name: 42 }, { name: "" }]) {
    const result = await post("create", body);
    expect(result.response.status).toBe(400);
    expect(result.data).toEqual({ error: "INVALID_REQUEST" });
    expect(result.response.headers.get("Set-Cookie")).toBeNull();
  }

  const alice = await post("create", { name: "Alice" });
  const room = stringField(alice.data, "room");
  const code = stringField(alice.data, "code");

  const emptyName = await post("join", { code, name: "" });
  expect(emptyName.response.status).toBe(400);
  expect(emptyName.data).toEqual({ error: "INVALID_REQUEST" });

  const unknownRoom = await post("join", { code: "INVALID", name: "Bob" });
  expect(unknownRoom.response.status).toBe(404);
  expect(unknownRoom.data).toEqual({ error: "NOT_FOUND" });

  expect(await rooms._activeParticipants({ room })).toEqual([{
    participant: stringField(alice.data, "participant"),
    name: "Alice",
  }]);
});

test("missing, invented, and expired cookies cannot identify a participant", async () => {
  const alice = await post("create", { name: "Alice" });
  const cookie = sessionCookie(alice.response);
  const cookieName = cookie.slice(0, cookie.indexOf("="));

  for (const candidate of [undefined, `${cookieName}=invented`]) {
    const result = await post("current", {}, candidate);
    expect(result.response.status).toBe(401);
    expect(result.data).toEqual({ error: "UNAUTHORIZED" });
  }

  now = new Date(now.getTime() + 30 * 60 * 1000);

  const expired = await post("current", {}, cookie);
  expect(expired.response.status).toBe(401);
  expect(expired.data).toEqual({ error: "UNAUTHORIZED" });
});

test("JSON claims cannot override cookie identity or select another participant", async () => {
  const alice = await post("create", { name: "Alice" });
  const bob = await post("join", {
    code: stringField(alice.data, "code"),
    name: "Bob",
  });

  const aliceId = stringField(alice.data, "participant");
  const aliceCookie = sessionCookie(alice.response);
  const bobCookie = sessionCookie(bob.response);
  const bobToken = bobCookie.slice(bobCookie.indexOf("=") + 1);

  const spoofedSession = await post(
    "current",
    { session: bobToken },
    aliceCookie,
  );
  expect(spoofedSession.response.status).toBe(200);
  expect(spoofedSession.data).toMatchObject({ participant: aliceId });

  const noCookie = await post("current", { session: bobToken });
  expect(noCookie.response.status).toBe(401);
  expect(noCookie.data).toEqual({ error: "UNAUTHORIZED" });

  const spoofedParticipant = await post(
    "leave",
    { participant: aliceId },
    bobCookie,
  );
  expect(spoofedParticipant.response.status).toBe(400);
  expect(spoofedParticipant.data).toEqual({ error: "INVALID_REQUEST" });

  for (const participant of [
    aliceId,
    stringField(bob.data, "participant"),
  ]) {
    expect((await rooms._getParticipant({ participant }))[0]!.active)
      .toBe(true);
  }
});

test("Leave updates membership, reassigns the host, and invalidates the session", async () => {
  const alice = await post("create", { name: "Alice" });
  const room = stringField(alice.data, "room");
  const code = stringField(alice.data, "code");
  const aliceId = stringField(alice.data, "participant");
  const aliceCookie = sessionCookie(alice.response);

  const bob = await post("join", { code, name: "Bob" });
  const bobId = stringField(bob.data, "participant");
  const bobCookie = sessionCookie(bob.response);

  const left = await post("leave", {}, aliceCookie);
  expect(left.response.status).toBe(200);
  expect(left.data).toEqual({ ended: true });
  expect(left.response.headers.get("Set-Cookie")).toContain("Max-Age=0");

  expect(await rooms._getParticipant({ participant: aliceId }))
    .toEqual([{ room, name: "Alice", active: false }]);
  expect((await rooms._getRoom({ room }))[0]!.host).toBe(bobId);

  const ended = await post("current", {}, aliceCookie);
  expect(ended.response.status).toBe(401);
  expect(ended.data).toEqual({ error: "UNAUTHORIZED" });

  const bobLeft = await post("leave", {}, bobCookie);
  expect(bobLeft.response.status).toBe(200);
  expect(bobLeft.data).toEqual({ ended: true });

  expect(await rooms._getRoom({ room })).toEqual([
    { code, status: "CLOSED" },
  ]);

  const closed = await post("join", { code, name: "Charlie" });
  expect(closed.response.status).toBe(404);
  expect(closed.data).toEqual({ error: "NOT_FOUND" });
});

test("simultaneous departures run safely through the assembled engine", async () => {
  const alice = await post("create", { name: "Alice" });
  const room = stringField(alice.data, "room");
  const code = stringField(alice.data, "code");
  const bob = await post("join", { code, name: "Bob" });

  const results = await Promise.all([
    post("leave", {}, sessionCookie(alice.response)),
    post("leave", {}, sessionCookie(bob.response)),
  ]);

  for (const result of results) {
    expect(result.response.status).toBe(200);
    expect(result.data).toEqual({ ended: true });
  }

  expect(await rooms._getRoom({ room })).toEqual([
    { code, status: "CLOSED" },
  ]);
  expect(await rooms._activeParticipants({ room })).toEqual([]);
});

test("an incorrect Origin cannot use a session to leave", async () => {
  const alice = await post("create", { name: "Alice" });
  const participant = stringField(alice.data, "participant");

  const rejected = await post(
    "leave",
    {},
    sessionCookie(alice.response),
    "http://untrusted.example",
  );

  expect(rejected.response.status).toBe(403);
  expect((await rooms._getParticipant({ participant }))[0]!.active)
    .toBe(true);
});

test("Current restores lobby details and reflects joins and host departure", async () => {
  const alice = await post("create", { name: "Alice" });
  const room = stringField(alice.data, "room");
  const code = stringField(alice.data, "code");
  const aliceId = stringField(alice.data, "participant");
  const aliceCookie = sessionCookie(alice.response);

  const initial = await post("current", {}, aliceCookie);
  expect(initial.response.status).toBe(200);
  expect(initial.data).toEqual({
    participant: aliceId,
    room,
    code,
    host: aliceId,
    members: {
      participants: [{ participant: aliceId, name: "Alice" }],
    },
  });

  const bob = await post("join", { code, name: "Bob" });
  const bobId = stringField(bob.data, "participant");
  const bobCookie = sessionCookie(bob.response);

  const joined = await post("current", {}, aliceCookie);
  expect(joined.response.status).toBe(200);
  expect(joined.data).toMatchObject({
    room,
    code,
    host: aliceId,
    members: {
      participants: expect.arrayContaining([
        { participant: aliceId, name: "Alice" },
        { participant: bobId, name: "Bob" },
      ]),
    },
  });

  await post("leave", {}, aliceCookie);

  const remaining = await post("current", {}, bobCookie);
  expect(remaining.response.status).toBe(200);
  expect(remaining.data).toEqual({
    participant: bobId,
    room,
    code,
    host: bobId,
    members: {
      participants: [{ participant: bobId, name: "Bob" }],
    },
  });
});

test("Current rejects inactive membership even with an active session", async () => {
  const alice = await post("create", { name: "Alice" });
  const participant = stringField(alice.data, "participant");

  // End membership directly, leaving the session active.
  await rooms.leave({ participant });

  const result = await post(
    "current",
    {},
    sessionCookie(alice.response),
  );

  expect(result.response.status).toBe(403);
  expect(result.data).toEqual({ error: "FORBIDDEN" });
});