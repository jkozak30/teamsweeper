import { MongoServerError, type Collection, type Db } from "mongodb";

export class CreateNameRequired extends Error {}
export class JoinNameRequired extends Error {}
export class RoomUnavailable extends Error {}
export class ParticipantNotActive extends Error {}
export class RoomNotOpen extends Error {}
export class GameAlreadyAssociated extends Error {}

type RoomStatus = "OPEN" | "CLOSED";

interface RoomDocument {
  _id: string;
  code: string;
  status: RoomStatus;
  host?: string;
  currentGame?: string;
  games: string[];
}

interface ParticipantDocument {
  _id: string;
  room: string;
  name: string;
  active: boolean;
}

export class RoomJoiningConcept {
  private readonly rooms: Collection<RoomDocument>;
  private readonly participants: Collection<ParticipantDocument>;
  private indexed = false;

  constructor(db: Db) {
    this.rooms = db.collection<RoomDocument>("roomJoining.rooms");
    this.participants = db.collection<ParticipantDocument>("roomJoining.participants");
  }

  async create({ name }: { name: string }) {
    if (name.length === 0) {
      throw new CreateNameRequired("Enter a display name to create a room.");
    }

    await this.#ensureIndexes();

    const room = crypto.randomUUID();
    const participant = crypto.randomUUID();
    let code: string;

    while (true) {
      code = this.#makeCode();

      try {
        await this.rooms.insertOne({
          _id: room,
          code,
          status: "OPEN",
          host: participant,
          games: [],
        });
        break;
      } catch (error) {
        if (error instanceof MongoServerError && error.code === 11000) {
          continue;
        }
        throw error;
      }
    }

    try {
      await this.participants.insertOne({ _id: participant, room, name, active: true });
    } catch (error) {
      await this.rooms.deleteOne({ _id: room });
      throw error;
    }

    return { room, participant, code };
  }

  async join({ code, name }: { code: string; name: string }) {
    if (name.length === 0) {
      throw new JoinNameRequired("Enter a display name to join a room.");
    }

    const room = await this.rooms.findOne({ code, status: "OPEN" });
    if (!room) {
      throw new RoomUnavailable("No open room has that code.");
    }

    const participant = crypto.randomUUID();

    await this.participants.insertOne({
      _id: participant,
      room: room._id,
      name,
      active: true,
    });

    return { participant };
  }

  async leave({ participant }: { participant: string }) {
    const member = await this.participants.findOne({ _id: participant, active: true });

    if (!member) {
      throw new ParticipantNotActive("That participant is not active.");
    }

    await this.participants.updateOne(
      { _id: participant },
      { $set: { active: false } },
    );

    const remaining = await this.participants.findOne(
      { room: member.room, active: true },
      { sort: { _id: 1 } },
    );

    if (!remaining) {
      await this.rooms.updateOne(
        { _id: member.room },
        {
          $set: { status: "CLOSED" },
          $unset: { host: "" },
        },
      );
    } else {
      // Change the host only when the departing participant was host.
      await this.rooms.updateOne(
        { _id: member.room, host: participant },
        { $set: { host: remaining._id } },
      );
    }

    return {};
  }

  async associate({ room, game }: { room: string; game: string }) {
    await this.#ensureIndexes();

    const target = await this.rooms.findOne({ _id: room, status: "OPEN" });
    if (!target) {
      throw new RoomNotOpen("That room is not open.");
    }

    const existing = await this.rooms.findOne({ games: game });
    if (existing) {
      throw new GameAlreadyAssociated("That game already belongs to a room.");
    }

    try {
      const result = await this.rooms.updateOne(
        { _id: room, status: "OPEN" },
        {
          $push: { games: game },
          $set: { currentGame: game },
        },
      );

      if (result.matchedCount === 0) {
        throw new RoomNotOpen("That room is not open.");
      }
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        throw new GameAlreadyAssociated("That game already belongs to a room.");
      }
      throw error;
    }

    return {};
  }

  async _getRoom({ room }: { room: string }): Promise<{
    code: string;
    status: RoomStatus;
    host?: string;
    currentGame?: string;
  }[]> {
    const document = await this.rooms.findOne({ _id: room });
    if (!document) return [];

    const result: {
      code: string;
      status: RoomStatus;
      host?: string;
      currentGame?: string;
    } = {
      code: document.code,
      status: document.status,
    };

    if (document.host !== undefined) {
      result.host = document.host;
    }
    if (document.currentGame !== undefined) {
      result.currentGame = document.currentGame;
    }

    return [result];
  }

  async _getParticipant({ participant }: { participant: string }) {
    const document = await this.participants.findOne({ _id: participant });
    if (!document) return [];

    return [{
      room: document.room,
      name: document.name,
      active: document.active,
    }];
  }

  async _activeParticipants({ room }: { room: string }) {
    const documents = await this.participants
      .find({ room, active: true })
      .sort({ _id: 1 })
      .toArray();

    return documents.map(({ _id, name }) => ({ participant: _id, name }));
  }

  async #ensureIndexes() {
    if (!this.indexed) {
      await this.rooms.createIndex({ code: 1 }, { unique: true });

      // Enforce game uniqueness across rooms, excluding empty games arrays.
      await this.rooms.createIndex(
        { games: 1 },
        {
          unique: true,
          partialFilterExpression: { "games.0": { $exists: true } },
        },
      );

      this.indexed = true;
    }
  }

  #makeCode() {
    // code idea: 32 possible characters per position; MongoDB retries at duplicates
    const code_length = 6;
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = crypto.getRandomValues(new Uint8Array(code_length));

    return Array.from(bytes, byte => alphabet[byte % alphabet.length]!).join("");
  }
}