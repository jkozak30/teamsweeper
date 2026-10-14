import { expect } from "bun:test";
import type { Db, Document } from "mongodb";

export async function storedState(db: Db, collections: readonly string[]) {
  return Promise.all(collections.map(async name => ({
    name,
    documents: await db.collection(name).find({}).sort({ _id: 1 }).toArray(),
  })));
}

// Use only for sequential refusals; concurrent scenarios assert the winning state.
export async function checkRefusal(
  db: Db, collections: readonly string[],
  operation: () => Promise<unknown>, expected: new (message?: string) => Error,
) {
  const before = await storedState(db, collections);
  await expect(operation()).rejects.toBeInstanceOf(expected);
  expect(await storedState(db, collections)).toEqual(before);
}

export async function checkInvariants(db: Db) {
  const rows = async (name: string) => db.collection<Document & { _id: string }>(name).find({}).toArray();
  const rooms = await rows("roomJoining.rooms");
  const participants = await rows("roomJoining.participants");
  expect(new Set(rooms.map(room => room.code)).size).toBe(rooms.length);
  const associated = new Set<string>();
  for (const room of rooms) {
    const active = participants.filter(member => member.room === room._id && member.active);
    expect(["OPEN", "CLOSED"]).toContain(room.status);
    if (room.status === "OPEN") {
      expect(active.some(member => member._id === room.host)).toBe(true);
    } else {
      expect(active).toEqual([]);
      expect(room.host).toBeUndefined();
    }
    expect(new Set(room.games).size).toBe(room.games.length);
    if (room.currentGame !== undefined) expect(room.games).toContain(room.currentGame);
    for (const game of room.games) {
      expect(associated.has(game)).toBe(false);
      associated.add(game);
    }
  }
  for (const member of participants) {
    expect(rooms.some(room => room._id === member.room)).toBe(true);
    expect(typeof member.active).toBe("boolean");
  }
  for (const game of await rows("minesweeperPlaying.games")) {
    const { height, width, mines } = game.settings;
    const total = height * width;
    expect(Number.isSafeInteger(height) && height >= 1 && height <= 100).toBe(true);
    expect(Number.isSafeInteger(width) && width >= 1 && width <= 100).toBe(true);
    expect(Number.isSafeInteger(mines) && mines >= 1 && mines < total).toBe(true);
    expect(Number.isSafeInteger(game.clicks) && game.clicks >= 0).toBe(true);
    for (const cells of [game.mines, game.revealed, game.flagged]) {
      expect(new Set(cells).size).toBe(cells.length);
      expect(cells.every((id: number) => Number.isSafeInteger(id) && id >= 0 && id < total)).toBe(true);
    }
    expect(game.flagged.some((id: number) => game.revealed.includes(id))).toBe(false);
    expect(["IDLE", "PLAYING", "WON", "LOST"]).toContain(game.status);
    if (game.status === "IDLE") {
      expect(game.mines).toEqual([]);
      expect(game.revealed).toEqual([]);
      expect(game.startedAt).toBeUndefined();
      expect(game.endedAt).toBeUndefined();
    } else {
      expect(game.mines).toHaveLength(mines);
      expect(game.startedAt).toBeInstanceOf(Date);
      if (game.status === "PLAYING") expect(game.endedAt).toBeUndefined();
      else {
        expect(game.endedAt).toBeInstanceOf(Date);
        expect(game.endedAt.getTime() >= game.startedAt.getTime()).toBe(true);
      }
      if (game.status === "WON") {
        expect(game.revealed.filter((id: number) => !game.mines.includes(id))).toHaveLength(total - mines);
      }
      if (game.status === "LOST") {
        expect(game.revealed.some((id: number) => game.mines.includes(id))).toBe(true);
      }
    }
    expect(game.cellRevisions).toHaveLength(total);
    expect(game.cellRevisions.every((revision: number) =>
      Number.isSafeInteger(revision) && revision >= 0 && revision <= game.clicks)).toBe(true);
  }
  for (const session of await rows("sessioning.sessions")) {
    expect(typeof session.subject).toBe("string");
    for (const value of [session.expiresAt, session.lastSeen, session.lastRenewed]) {
      expect(value).toBeInstanceOf(Date);
      expect(Number.isFinite(value.getTime())).toBe(true);
    }
  }
  for (const annotation of await rows("annotating.annotations")) {
    expect(annotation._id).toBe(JSON.stringify([annotation.author, annotation.target]));
  }
  for (const result of await rows("performanceRanking.results")) {
    expect(typeof result._id === "string" && result._id.length > 0).toBe(true);
    expect(typeof result.scope === "string" && result.scope.length > 0).toBe(true);
    expect(result.measurements.length > 0).toBe(true);
    expect(new Set(result.measurements.map((measurement: { metric: string }) => measurement.metric)).size)
      .toBe(result.measurements.length);
    expect(result.measurements.every((measurement: { metric: string; value: number }) =>
      typeof measurement.metric === "string" && measurement.metric.length > 0 && Number.isFinite(measurement.value))).toBe(true);
  }
}
