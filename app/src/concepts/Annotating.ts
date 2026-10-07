import { MongoServerError, type Collection, type Db } from "mongodb";

export class AlreadyHighlighted extends Error {}
export class HighlightNotFound extends Error {}

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type Item = string | { [key: string]: JsonValue };

// Equal objects should have equal identities regardless of field order.
function canonical(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonical);

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [
        key,
        canonical(value[key]!),
      ]),
    );
  }

  return value;
}

interface AnnotationDocument {
  _id: string;
  author: string;
  target: Item;
}

export class AnnotatingConcept {
  private readonly annotations: Collection<AnnotationDocument>;

  constructor(db: Db) {
    this.annotations = db.collection<AnnotationDocument>(
      "annotating.annotations",
    );
  }

  async highlight({ user, item }: { user: string; item: Item }) {
    const target = canonical(item) as Item;

    try {
      await this.annotations.insertOne({
        _id: JSON.stringify([user, target]),
        author: user,
        target,
      });
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        throw new AlreadyHighlighted(
          "You have already highlighted that item.",
        );
      }

      throw error;
    }

    return {};
  }

  async remove({ user, item }: { user: string; item: Item }) {
    const result = await this.annotations.deleteOne({
      _id: JSON.stringify([user, canonical(item)]),
    });

    if (result.deletedCount === 0) {
      throw new HighlightNotFound(
        "You have not highlighted that item.",
      );
    }

    return {};
  }

  async clear({ user }: { user: string }) {
    await this.annotations.deleteMany({ author: user });
    return {};
  }

  async _forItem({ item }: { item: Item }) {
    const documents = await this.annotations
      .find({ target: canonical(item) as Item })
      .sort({ author: 1 })
      .toArray();

    return documents.map(({ author }) => ({ author }));
  }

  async _byUser({ user }: { user: string }) {
    const documents = await this.annotations
      .find({ author: user })
      .sort({ _id: 1 })
      .toArray();

    return documents.map(({ target }) => ({ target }));
  }
}