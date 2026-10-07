import { MongoServerError, type Collection, type Db } from "mongodb";

export class AlreadyHighlighted extends Error {}
export class HighlightNotFound extends Error {}

interface AnnotationDocument {
  _id: string;
  author: string;
  target: string;
}

export class AnnotatingConcept {
  private readonly annotations: Collection<AnnotationDocument>;

  constructor(db: Db) {
    this.annotations = db.collection<AnnotationDocument>(
      "annotating.annotations",
    );
  }

  async highlight({ user, item }: { user: string; item: string }) {
    try {
      // MongoDB enforces uniqueness of the author/target pair.
      await this.annotations.insertOne({
        _id: JSON.stringify([user, item]),
        author: user,
        target: item,
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

  async remove({ user, item }: { user: string; item: string }) {
    const result = await this.annotations.deleteOne({
      author: user,
      target: item,
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

  async _forItem({ item }: { item: string }) {
    const documents = await this.annotations
      .find({ target: item })
      .sort({ author: 1 })
      .toArray();

    return documents.map(({ author }) => ({ author }));
  }

  async _byUser({ user }: { user: string }) {
    const documents = await this.annotations
      .find({ author: user })
      .sort({ target: 1 })
      .toArray();

    return documents.map(({ target }) => ({ target }));
  }
}