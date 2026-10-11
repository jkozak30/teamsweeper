import { reactive } from "vue";
import { setCell, highlightedCells, cellId } from "./cell-state.ts";
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
  const cells: Cell[] = update.reset ? reactive(Array<Cell>(total)) : previous!.cells;
  if (update.reset && update.cells.length !== total) throw new Error("RESET_REQUIRED");
  if (update.cells.some(({ id }) => !Number.isSafeInteger(id) || id < 0 || id >= total)) {
    throw new Error("RESET_REQUIRED");
  }
  for (const { id, ...cell } of update.cells) {
    setCell(cells, id, {
      ...cell,
      adjacent: cell.adjacent ?? null, mine: cell.mine ?? null, triggered: cell.triggered ?? null,
      highlights: previous?.cells[id]?.highlights ?? [],
    });
  }
  if (update.reset) highlightedCells(cells, "");
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
  const cells = state.snapshot.cells;
  // Validate missing cursors before mutating either the cache or cells.
  for (const update of updates) {
    if (update.targets === null && !cache.has(update.participant)) throw new Error("RESET_REQUIRED");
  }
  const active = new Set(updates.map(update => update.participant));
  const changed = new Map<string, Set<number>>();
  const { width, height } = state.snapshot.settings;
  for (const participant of cache.keys()) {
    if (!active.has(participant)) { changed.set(participant, new Set()); cache.delete(participant); }
  }
  for (const update of updates) {
    if (update.targets === null) continue;
    const ids = new Set<number>();
    for (const target of update.targets) {
      if (typeof target !== "object" || target === null || target.game !== state.game) continue;
      const coord = target.coord;
      if (typeof coord !== "object" || coord === null || Array.isArray(coord)) continue;
      const { row, column } = coord;
      if (typeof row !== "number" || typeof column !== "number" ||
          !Number.isInteger(row) || !Number.isInteger(column) ||
          row < 0 || column < 0 || row >= height || column >= width) continue;
      ids.add(cellId({ row, column }, width));
    }
    changed.set(update.participant, ids);
    cache.set(update.participant, update.targets);
  }
  for (const [participant, ids] of changed) {
    const affected = new Set([...highlightedCells(cells, participant), ...ids]);
    for (const id of affected) {
      const cell = cells[id]!;
      const highlights = cell.highlights.filter(value => value.participant !== participant);
      if (ids.has(id)) highlights.push({ participant });
      highlights.sort((a, b) => a.participant.localeCompare(b.participant));
      if (highlights.length === cell.highlights.length &&
          highlights.every((value, i) => value.participant === cell.highlights[i]?.participant)) continue;
      setCell(cells, id, { ...cell, highlights });
    }
  }
  return state;
}
