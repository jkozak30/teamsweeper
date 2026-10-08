import { randomInt } from "node:crypto";
import type { Collection, Db } from "mongodb";

export class InvalidSettings extends Error {}
export class GameNotFound extends Error {}
export class MoveNotAllowed extends Error {}

export type Status = "IDLE" | "PLAYING" | "WON" | "LOST";

export interface Coordinate { row: number; column: number; }
export interface Settings { height: number; width: number; mines: number; }

export interface VisibleCell {
  coord: Coordinate;
  revealed: boolean;
  flagged: boolean;
  adjacent?: number;
  mine?: boolean;
  triggered?: boolean;
}

export interface BoardUpdate {
  revision: number;
  reset: boolean;
  settings: Settings;
  status: Status;
  clicks: number;
  flagsRemaining: number;
  startedAt: Date | null;
  endedAt: Date | null;
  cells: (VisibleCell & { id: number })[];
  results: { time: number; bv: number; clicks: number; speed: number; efficiency: number }[] | null;
}

interface GameDocument {
  _id: string;
  settings: Settings;
  status: Status;
  // Stored cells use row * width + column as their identity
  mines: number[];
  revealed: number[];
  flagged: number[];
  clicks: number;
  cellRevisions?: number[];
  startedAt?: Date;
  endedAt?: Date;
}

export class MinesweeperPlayingConcept {
  private readonly games: Collection<GameDocument>;

  constructor(db: Db) {
    this.games = db.collection<GameDocument>("minesweeperPlaying.games");
  }

  async create({ settings }: { settings: Settings }) {
    const { height, width, mines } = settings;

    if (
      !Number.isSafeInteger(height) || height <= 0 ||
      !Number.isSafeInteger(width) || width <= 0 ||
      !Number.isSafeInteger(height * width) ||
      !Number.isSafeInteger(mines) || mines <= 0 ||
      mines >= height * width
    ) {
      throw new InvalidSettings("Use positive safe integer dimensions and fewer mines than cells.");
    }

    const game = crypto.randomUUID();

    await this.games.insertOne({
      _id: game,
      settings: { ...settings },
      status: "IDLE",
      mines: [],
      revealed: [],
      flagged: [],
      clicks: 0,
      cellRevisions: Array(height * width).fill(0),
    });

    return { game };
  }

  async reveal(
    { game, coord, now }: { game: string; coord: Coordinate; now: Date },
  ): Promise<{ status: Status }> {
    const { document, cell } = await this.#move(game, coord);

    if (document.revealed.includes(cell) || document.flagged.includes(cell)) {
      throw new MoveNotAllowed("That move is not allowed in the current game state.");
    }

    if (document.status === "IDLE") {
      this.#placeMines(document, cell);
      document.startedAt = now;
      document.status = "PLAYING";
    }

    return this.#applyReveal(document, [cell], now);
  }

  async flag(
    { game, coord, value }: { game: string; coord: Coordinate; value: boolean; },
  ) {
    const { document, cell } = await this.#move(game, coord);

    if (
      document.revealed.includes(cell) ||
      document.flagged.includes(cell) === value
    ) {
      throw new MoveNotAllowed("That move is not allowed in the current game state.");
    }

    if (value) {
      document.flagged.push(cell);
    } else {
      document.flagged = document.flagged.filter(item => item !== cell);
    }

    document.clicks++;
    await this.#save(document, [cell]);
    return {};
  }

  async chord(
    { game, coord, now }: { game: string; coord: Coordinate; now: Date },
  ): Promise<{ status: Status }> {
    const { document, cell } = await this.#move(game, coord);
    const neighbors = this.#neighbors(document, cell);
    const flags = neighbors.filter(item => document.flagged.includes(item));
    const targets = neighbors.filter(item =>
      !document.flagged.includes(item) && !document.revealed.includes(item)
    );

    if (
      document.status !== "PLAYING" ||
      !document.revealed.includes(cell) ||
      flags.length !== this.#adjacent(document, cell) ||
      targets.length === 0
    ) {
      throw new MoveNotAllowed("That move is not allowed in the current game state.");
    }

    return this.#applyReveal(document, targets, now);
  }

  async _getGame({ game }: { game: string }) {
    const document = await this.games.findOne({ _id: game });
    if (!document) return [];

    return [{
      settings: document.settings,
      status: document.status,
      clicks: document.clicks,
      flagsRemaining: document.settings.mines - document.flagged.length,
      ...(document.startedAt === undefined ? {} : { startedAt: document.startedAt }),
      ...(document.endedAt === undefined ? {} : { endedAt: document.endedAt }),
    }];
  }

  async _visibleCells({ game }: { game: string }) {
    const document = await this.games.findOne({ _id: game });
    if (!document) return [];

    return this.#visible(document, Array.from(
      { length: document.settings.height * document.settings.width }, (_, id) => id,
    )).map(({ id, ...cell }) => cell);
  }

  async _updates({ game, since }: { game: string; since: number }) {
    const document = await this.games.findOne({ _id: game });
    if (!document) return [];
    const revision = document.clicks;
    const total = document.settings.height * document.settings.width;
    const reset = since === -1 || !Number.isSafeInteger(since) ||
      since < 0 || since > revision || !document.cellRevisions;
    const ids: number[] = [];
    for (let id = 0; id < total; id++) {
      if (reset || document.cellRevisions![id]! > since!) ids.push(id);
    }
    const update: BoardUpdate = {
      revision, reset, settings: document.settings, status: document.status,
      clicks: document.clicks,
      flagsRemaining: document.settings.mines - document.flagged.length,
      startedAt: document.startedAt ?? null, endedAt: document.endedAt ?? null,
      cells: this.#visible(document, ids), results: reset || since < revision ? this.#result(document) : null,
    };
    return [{ update }];
  }

  #visible(document: GameDocument, ids: number[]): BoardUpdate["cells"] {
    if (!ids.length) return [];
    const mines = new Set(document.mines);
    const revealed = new Set(document.revealed);
    const flagged = new Set(document.flagged);
    const finished = document.status === "WON" || document.status === "LOST";
    return ids.map(id => ({
      id,
      coord: { row: Math.floor(id / document.settings.width), column: id % document.settings.width },
      revealed: revealed.has(id), flagged: flagged.has(id),
      ...(revealed.has(id) && !mines.has(id)
        ? { adjacent: this.#adjacent(document, id, mines) } : {}),
      ...(finished && mines.has(id) ? { mine: true, triggered: revealed.has(id) } : {}),
    }));
  }

  async _getResult({ game }: { game: string }) {
    const document = await this.games.findOne({ _id: game });

    return document ? this.#result(document) : [];
  }

  #result(document: GameDocument): NonNullable<BoardUpdate["results"]> {
    if ((document.status !== "WON" && document.status !== "LOST") ||
        !document.startedAt || !document.endedAt) return [];
    const time = (document.endedAt.getTime() - document.startedAt.getTime()) / 1000;
    if (time <= 0) return [];
    const { bv, solved } = this.#measureBV(document);
    return [{ time, bv, clicks: document.clicks, speed: solved / time, efficiency: solved / document.clicks }];
  }

  // Checks the requirements shared by every move
  async #move(game: string, coord: Coordinate) {
    const document = await this.games.findOne({ _id: game });
    if (!document) throw new GameNotFound("That game does not exist.");

    if (
      document.status === "WON" ||
      document.status === "LOST" ||
      !this.#validCoord(document, coord)
    ) {
      throw new MoveNotAllowed("That move is not allowed in the current game state.");
    }

    const cell = coord.row * document.settings.width + coord.column;
    return { document, cell };
  }

  // Reveal and chord each count as one click, including any expansion
  async #applyReveal(
    document: GameDocument,
    targets: number[],
    now: Date,
  ): Promise<{ status: Status }> {
    document.clicks++;
    const changed = this.#revealCells(document, targets);
    this.#finish(document, now);
    if (document.status === "WON" || document.status === "LOST") {
      changed.push(...document.mines);
    }
    await this.#save(document, changed);
    return { status: document.status };
  }

  #validCoord(document: GameDocument, coord: Coordinate) {
    return Number.isInteger(coord.row) &&
      Number.isInteger(coord.column) &&
      coord.row >= 0 &&
      coord.row < document.settings.height &&
      coord.column >= 0 &&
      coord.column < document.settings.width;
  }

  #neighbors(document: GameDocument, cell: number) {
    const row = Math.floor(cell / document.settings.width);
    const column = cell % document.settings.width;
    const neighbors: number[] = [];

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const coord = { row: row + dr, column: column + dc };

        if ((dr !== 0 || dc !== 0) && this.#validCoord(document, coord)) {
          neighbors.push(coord.row * document.settings.width + coord.column);
        }
      }
    }

    return neighbors;
  }

  #adjacent(document: GameDocument, cell: number, mines = new Set(document.mines)) {
    return this.#neighbors(document, cell)
      .filter(item => mines.has(item))
      .length;
  }

  #placeMines(document: GameDocument, safe: number) {
    const candidates: number[] = [];
    const total = document.settings.height * document.settings.width;

    for (let cell = 0; cell < total; cell++) {
      if (cell !== safe) candidates.push(cell);
    }

    // uniform sampling without replacement
    for (let i = 0; i < document.settings.mines; i++) {
      const chosen = i + randomInt(candidates.length - i);

      [candidates[i], candidates[chosen]] = [candidates[chosen]!, candidates[i]!];
    }

    document.mines = candidates.slice(0, document.settings.mines);
  }

  #revealCells(document: GameDocument, targets: number[]) {
    const mines = new Set(document.mines);
    const flagged = new Set(document.flagged);
    const revealed = new Set(document.revealed);
    const pending = [...targets];
    const changed: number[] = [];

    while (pending.length > 0) {
      const cell = pending.pop()!;

      if (flagged.has(cell) || revealed.has(cell)) continue;

      revealed.add(cell);
      changed.push(cell);

      if (!mines.has(cell) && this.#adjacent(document, cell, mines) === 0) {
        pending.push(...this.#neighbors(document, cell));
      }
    }

    document.revealed = [...revealed];
    return changed;
  }

  #finish(document: GameDocument, now: Date) {
    const mines = new Set(document.mines);
    if (document.revealed.some(cell => mines.has(cell))) {
      document.status = "LOST";
      document.endedAt = now;
    } else if (
      document.revealed.length ===
      document.settings.height * document.settings.width -
        document.settings.mines
    ) {
      document.status = "WON";
      document.endedAt = now;
    }
  }

  async #save(document: GameDocument, changed: number[]) {
    const previous = document.clicks - 1;
    document.cellRevisions ??= Array(document.settings.height * document.settings.width).fill(previous);
    for (const id of changed) document.cellRevisions[id] = document.clicks;
    // Compare-and-swap prevents simultaneous moves from overwriting one another.
    const result = await this.games.replaceOne({ _id: document._id, clicks: previous }, document);
    if (result.matchedCount === 0) {
      throw new MoveNotAllowed("That move is not allowed in the current game state.");
    }
  }

  #measureBV(document: GameDocument) {
    const mines = new Set(document.mines);
    const revealed = new Set(document.revealed);
    const visited = new Set<number>();
    const boundary = new Set<number>();
    const total = document.settings.height * document.settings.width;
    let bv = 0;
    let solved = 0;

    for (let cell = 0; cell < total; cell++) {
      if (
        mines.has(cell) ||
        visited.has(cell) ||
        this.#adjacent(document, cell, mines) !== 0
      ) {
        continue;
      }

      bv++;
      let opened = false;
      const pending = [cell];

      while (pending.length > 0) {
        const zero = pending.pop()!;
        if (visited.has(zero)) continue;

        visited.add(zero);
        if (revealed.has(zero)) opened = true;

        for (const neighbor of this.#neighbors(document, zero)) {
          if (
            this.#adjacent(document, neighbor, mines) === 0 &&
            !mines.has(neighbor)
          ) {
            if (!visited.has(neighbor)) pending.push(neighbor);
          } else if (!mines.has(neighbor)) {
            boundary.add(neighbor);
          }
        }
      }

      if (opened) solved++;
    }

    for (let cell = 0; cell < total; cell++) {
      if (
        !mines.has(cell) &&
        !visited.has(cell) &&
        !boundary.has(cell)
      ) {
        bv++;
        if (revealed.has(cell)) solved++;
      }
    }

    return { bv, solved };
  }
}