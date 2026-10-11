import { type Collection, type Db } from "mongodb";

export class UnknownSession extends Error {}
export class EndSessionNotActive extends Error {}

interface SessionDocument {
  _id: string;
  subject: string;
  expiresAt: Date;
  lastSeen?: Date;
  lastRenewed?: Date;
}

export const SESSION_LIFETIME_MS = 10 * 60 * 1000;
export const HOST_PRESENCE_MS = 10 * 1000;

export class SessioningConcept {
  private readonly sessions: Collection<SessionDocument>;
  private indexes: Promise<unknown> | null = null;

  constructor(
    db: Db,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.sessions = db.collection<SessionDocument>("sessioning.sessions");
  }

  async start({ subject }: { subject: string }) {
    await this.#ensureIndexes();
    const now = this.clock();

    const session = crypto.randomUUID();
    const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS);

    await this.sessions.insertOne({ _id: session, subject, expiresAt, lastSeen: now, lastRenewed: now });

    return { session, expiresAt };
  }

  async current({ session }: { session: string }) {
    const now = this.clock();
    const found = await this.sessions.findOneAndUpdate(
      { _id: session, expiresAt: { $gt: now } },
      { $max: { lastSeen: now } },
      { returnDocument: "after" },
    );

    if (!found) {
      throw new UnknownSession("This session is not active.");
    }

    return { subject: found.subject };
  }

  async renew({ session }: { session: string }) {
    const now = this.clock();
    // Existing sessions adopt the shorter lifetime on their first renewal.
    let found = await this.sessions.findOneAndUpdate(
      { _id: session, expiresAt: { $gt: now }, lastRenewed: { $exists: false } },
      { $set: { expiresAt: new Date(now.getTime() + SESSION_LIFETIME_MS), lastRenewed: now },
        $max: { lastSeen: now } },
      { returnDocument: "after" },
    );
    found ??= await this.sessions.findOneAndUpdate(
      { _id: session, expiresAt: { $gt: now },
        lastRenewed: { $lte: new Date(now.getTime() - 60_000) } },
      { $max: { expiresAt: new Date(now.getTime() + SESSION_LIFETIME_MS),
        lastSeen: now, lastRenewed: now } },
      { returnDocument: "after" },
    );
    found ??= await this.sessions.findOneAndUpdate(
      { _id: session, expiresAt: { $gt: now } },
      { $max: { lastSeen: now } },
      { returnDocument: "after" },
    );
    if (!found) throw new UnknownSession("This session is not active.");
    return { session, expiresAt: found.expiresAt };
  }

  async expireAbsent({ subject }: { subject: string }) {
    const now = this.clock();
    const cutoff = new Date(now.getTime() - HOST_PRESENCE_MS);
    const sessions = await this.sessions.find({ subject, expiresAt: { $gt: now } }).toArray();
    if (sessions.some(session => session.lastSeen && session.lastSeen > cutoff)) {
      return { expired: false };
    }
    let expired = false;
    for (const session of sessions) {
      const result = await this.sessions.updateOne(
        { _id: session._id, expiresAt: { $gt: now }, lastSeen: session.lastSeen },
        { $set: { expiresAt: now } },
      );
      expired ||= result.matchedCount > 0;
    }
    return { expired };
  }

  async purge({ session }: { session: string }) {
    await this.sessions.deleteOne({ _id: session, expiresAt: { $lte: this.clock() } });
    return {};
  }

  async _present({ subject }: { subject: string }) {
    await this.#ensureIndexes();
    const now = this.clock();
    const session = await this.sessions.findOne({
      subject,
      expiresAt: { $gt: now },
      lastSeen: { $gt: new Date(now.getTime() - HOST_PRESENCE_MS) },
    });
    return session ? [{ subject }] : [];
  }

  async _expired({}: Record<string, never>) {
    await this.#ensureIndexes();
    const rows = await this.sessions.find({ expiresAt: { $lte: this.clock() } }).toArray();
    return rows.map(row => ({ session: row._id, subject: row.subject }));
  }

  async _subjectActive({ subject }: { subject: string }) {
    const found = await this.sessions.findOne({ subject, expiresAt: { $gt: this.clock() } });
    return found ? [{ subject }] : [];
  }

  async end({ session }: { session: string }) {
    const result = await this.sessions.deleteOne({
      _id: session,
      expiresAt: { $gt: this.clock() },
    });

    if (result.deletedCount === 0) {
      throw new EndSessionNotActive("This session is not active.");
    }

    return { ended: true };
  }

  async _active({ session }: { session: string }) {
    const found = await this.sessions.findOne({
      _id: session,
      expiresAt: { $gt: this.clock() },
    });

    if (!found) return [];

    return [{
      subject: found.subject,
      expiresAt: found.expiresAt,
    }];
  }

  #ensureIndexes() {
    this.indexes ??= Promise.all([
      this.sessions.createIndex({ expiresAt: 1 }),
      this.sessions.createIndex({ lastSeen: 1, expiresAt: 1 }),
      this.sessions.createIndex({ subject: 1, expiresAt: 1 }),
    ]).catch(error => { this.indexes = null; throw error; });
    return this.indexes;
  }

}