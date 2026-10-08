import { type Collection, type Db } from "mongodb";

export class UnknownSession extends Error {}
export class EndSessionNotActive extends Error {}

interface SessionDocument {
  _id: string;
  subject: string;
  expiresAt: Date;
}

const SESSION_LIFETIME_MS = 30 * 60 * 1000;

export class SessioningConcept {
  private readonly sessions: Collection<SessionDocument>;

  constructor(
    db: Db,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.sessions = db.collection<SessionDocument>("sessioning.sessions");
  }

  async start({ subject }: { subject: string }) {
    const now = this.clock();

    await this.sessions.deleteMany({ expiresAt: { $lte: now } });

    const session = crypto.randomUUID();
    const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS);

    await this.sessions.insertOne({ _id: session, subject, expiresAt });

    return { session, expiresAt };
  }

  async current({ session }: { session: string }) {
    const found = await this.sessions.findOne({
      _id: session,
      expiresAt: { $gt: this.clock() },
    });

    if (!found) {
      throw new UnknownSession("This session is not active.");
    }

    return { subject: found.subject };
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
}