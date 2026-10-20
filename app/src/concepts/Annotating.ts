import { createHash } from "node:crypto";
import { type Collection, type Db } from "mongodb";

export class HighlightNotFound extends Error {}

type JsonValue =
  | string | number | boolean | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type Item = string | { [key: string]: JsonValue };

// Equal objects should have equal identities regardless of field order.
function canonical(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonical);

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, canonical(value[key]!)]),
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
  private authorIndex: Promise<string> | null = null;

  constructor(db: Db) {
    this.annotations = db.collection<AnnotationDocument>("annotating.annotations");
  }

  async highlight({ user, items }: { user: string; items: Item[] }) {
    // Normalize every target before writing; equivalent targets are added once.
    const targets = new Map(items.map(item => {
      const target = canonical(item) as Item;
      return [JSON.stringify([user, target]), target] as const;
    }));
    if (targets.size) {
      await this.annotations.bulkWrite([...targets].map(([_id, target]) => ({
        updateOne: {
          filter: { _id },
          update: { $setOnInsert: { author: user, target } },
          upsert: true,
        },
      })));
    }
    return {};
  }

  async remove({ user, item }: { user: string; item: Item }) {
    const result = await this.annotations.deleteOne({
      _id: JSON.stringify([user, canonical(item)]),
    });

    if (result.deletedCount === 0) {
      throw new HighlightNotFound("You have not highlighted that item.");
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

  async _sync({ user, since }: { user: string; since: string }) {
    await this.#ensureAuthorIndex();
    const documents = await this.annotations.find({ author: user }).sort({ _id: 1 }).toArray();
    const targets = documents.map(({ target }) => target);
    const cursor = createHash("sha256").update(JSON.stringify(targets)).digest("hex");
    return { cursor, targets: since === cursor ? null : targets };
  }

  async _byUser({ user }: { user: string }) {
    await this.#ensureAuthorIndex();
    const documents = await this.annotations
      .find({ author: user })
      .sort({ _id: 1 })
      .toArray();

    return documents.map(({ target }) => ({ target }));
  }

  #ensureAuthorIndex() {
    this.authorIndex ??= this.annotations.createIndex({ author: 1, _id: 1 }).catch(error => {
      this.authorIndex = null;
      throw error;
    });
    return this.authorIndex;
  }

}