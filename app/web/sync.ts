import type { TeamsweeperWireHttp } from "../generated/wire.ts";

type Game = TeamsweeperWireHttp["/game/current"]["output"];
type Snapshot = NonNullable<Game["snapshot"]>;
type Cell = Snapshot["cells"][number];
type Changes = NonNullable<TeamsweeperWireHttp["/game/updates"]["output"]["changes"]>;
export type BoardUpdate = Changes["update"];
export type AnnotationUpdate = Changes["annotations"][number];
export type AnnotationCache = Map<string, NonNullable<AnnotationUpdate["targets"]>>;

export function applyBoard(current: Game | null, game: string, update: BoardUpdate): Game {
  const previous = current?.game === game ? current.snapshot : null;
  if (!update.reset && !previous) throw new Error("RESET_REQUIRED");
  const total = update.settings.height * update.settings.width;
  const cells: Cell[] = update.reset ? Array(total) : [...previous!.cells];
  for (const { id, ...cell } of update.cells) {
    if (!Number.isSafeInteger(id) || id < 0 || id >= total) throw new Error("RESET_REQUIRED");
    cells[id] = {
      ...cell,
      adjacent: cell.adjacent ?? null, mine: cell.mine ?? null, triggered: cell.triggered ?? null,
      highlights: previous?.cells[id]?.highlights ?? [],
    };
  }
  if (update.reset && update.cells.length !== total) throw new Error("RESET_REQUIRED");
  return {
    game,
    snapshot: {
      settings: update.settings, status: update.status, clicks: update.clicks,
      flagsRemaining: update.flagsRemaining, startedAt: update.startedAt,
      endedAt: update.endedAt, results: update.results ?? previous?.results ?? [], cells,
    },
  };
}

export function applyAnnotations(
  state: Game, updates: AnnotationUpdate[], cache: AnnotationCache,
): Game {
  if (!state.snapshot || !state.game) return state;
  const active = new Set(updates.map(update => update.participant));
  for (const participant of cache.keys()) if (!active.has(participant)) cache.delete(participant);
  for (const update of updates) {
    if (update.targets !== null) cache.set(update.participant, update.targets);
    else if (!cache.has(update.participant)) throw new Error("RESET_REQUIRED");
  }
  const { width, height } = state.snapshot.settings;
  const highlights = new Map<number, string[]>();
  for (const [participant, targets] of cache) {
    for (const target of targets) {
      if (typeof target !== "object" || target === null || target.game !== state.game) continue;
      const coord = target.coord;
      if (typeof coord !== "object" || coord === null || Array.isArray(coord)) continue;
      const { row, column } = coord;
      if (typeof row !== "number" || typeof column !== "number" ||
          !Number.isInteger(row) || !Number.isInteger(column) ||
          row < 0 || column < 0 || row >= height || column >= width) continue;
      const id = row * width + column;
      const authors = highlights.get(id) ?? [];
      authors.push(participant);
      highlights.set(id, authors);
    }
  }
  const cells = state.snapshot.cells.map((cell, id) => {
    const authors = (highlights.get(id) ?? []).sort();
    if (authors.length === cell.highlights.length &&
        authors.every((author, index) => author === cell.highlights[index]?.participant)) return cell;
    return { ...cell, highlights: authors.map(participant => ({ participant })) };
  });
  return { ...state, snapshot: { ...state.snapshot, cells } };
}
