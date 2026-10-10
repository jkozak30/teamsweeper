import { MongoServerError, type Collection, type Db } from "mongodb";

export class InvalidResult extends Error {}
export class ResultAlreadyRecorded extends Error {}
export class InvalidRanking extends Error {}

type JsonValue =
  | string | number | boolean | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type Category = string | { [key: string]: JsonValue };
export type Measurements = { metric: string; value: number }[];

interface ResultDocument {
  _id: string;
  scope: string;
  category: Category;
  measurements: Measurements;
}

function identity(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

// Compound categories compare by value, independently of object field order.
function canonical(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === "object" && value !== null &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    return Object.fromEntries(
        Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])])
    );
  }
  throw new InvalidResult("Use valid identities, a category, and nonempty finite measurements with distinct metrics.");
}

function categoryValue(category: Category): Category {
  if (!identity(category) 
    && (category === null || typeof category !== "object" || Array.isArray(category))) {
    throw new InvalidResult("Use valid identities, a category, and nonempty finite measurements with distinct metrics.");
  }
  return canonical(category) as Category;
}

export class PerformanceRankingConcept {
  private readonly results: Collection<ResultDocument>;
  private index: Promise<string> | null = null;

  constructor(db: Db) {
    this.results = db.collection<ResultDocument>("performanceRanking.results");
  }

  async record({ item, scope, category, measurements }: {
    item: string;
    scope: string;
    category: Category;
    measurements: Measurements;
  }) {
    if (!identity(item) || !identity(scope) || !Array.isArray(measurements) ||
      measurements.length === 0 || measurements.some(measurement =>
        measurement === null || typeof measurement !== "object" ||
        !identity(measurement.metric) || !Number.isFinite(measurement.value)
      ) || new Set(
        measurements.map(measurement => measurement.metric)).size !== measurements.length
    ) {
      throw new InvalidResult("Use valid identities, a category, and nonempty finite measurements with distinct metrics.");
    }

    const normalized = categoryValue(category);
    await this.#ensureIndex();

    try {
      await this.results.insertOne({
        _id: item, scope, category: normalized,
        measurements: measurements.map(({ metric, value }) => ({ metric, value })),
      });
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        throw new ResultAlreadyRecorded("That item already has a recorded result.");
      }
      throw error;
    }

    return {};
  }

  async _get({ item }: { item: string }) {
    const document = await this.results.findOne({ _id: item });
    if (!document) return [];
    return [{ scope: document.scope, category: document.category, measurements: document.measurements }];
  }

  async _rank({ scope, category, metric, ascending, from, to }: {
    scope: string;
    category?: Category;
    metric: string;
    ascending: boolean;
    from?: number;
    to?: number;
  }) {
    if (!identity(scope) || !identity(metric) || typeof ascending !== "boolean" ||
      (from !== undefined && (!Number.isSafeInteger(from) || from < 1)) ||
      (to !== undefined && (!Number.isSafeInteger(to) || to < (from ?? 1)))) {
      throw new InvalidRanking("Use a scope, metric, valid optional category, ascending boolean, and valid 1-based range.");
    }

    let normalized: Category | undefined;
    if (category !== undefined) {
      try {
        normalized = categoryValue(category);
      } catch (error) {
        if (error instanceof InvalidResult) {
          throw new InvalidRanking("Use a scope, metric, valid optional category, ascending boolean, and valid 1-based range.");
        }
        throw error;
      }
    }

    await this.#ensureIndex();
    const documents = await this.results.find({
      scope, ...(normalized === undefined ? {} : { category: normalized }),
    }).sort({ _id: 1 }).toArray();

    const rows = documents.flatMap(document => {
      const measurement = document.measurements.find(value => value.metric === metric);
      return measurement ? [{ item: document._id, value: measurement.value }] : [];
    });
    // The stable sort preserves ascending item identity when values tie.
    rows.sort((a, b) => ascending ? a.value - b.value : b.value - a.value);
    let rank = 0;
    const ranked = rows.map((row, index) => {
      if (index === 0 || row.value !== rows[index - 1]!.value) rank = index + 1;
      return { ...row, rank };
    });
    return ranked.slice((from ?? 1) - 1, to ?? ranked.length);
  }

  #ensureIndex() {
    this.index ??= this.results.createIndex({ scope: 1, category: 1 }).catch(error => {
      this.index = null;
      throw error;
    });
    return this.index;
  }
}
