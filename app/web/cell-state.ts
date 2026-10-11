import { toRaw } from "vue";
import type { TeamsweeperWireHttp } from "../generated/wire.ts";

type Snapshot = NonNullable<TeamsweeperWireHttp["/game/current"]["output"]["snapshot"]>;
export type Cell = Snapshot["cells"][number];
export type Coordinate = Cell["coord"];
type Index = Map<string, Set<number>>;
const indexes = new WeakMap<Cell[], Index>();
const journals = new WeakMap<Cell[], Map<number, Cell>>();

export function highlightedCells(cells: Cell[], participant: string): ReadonlySet<number> {
  const key = toRaw(cells);
  let index = indexes.get(key);
  if (!index) {
    index = new Map();
    cells.forEach((cell, id) => {
      for (const { participant } of cell.highlights) {
        if (!index!.has(participant)) index!.set(participant, new Set());
        index!.get(participant)!.add(id);
      }
    });
    indexes.set(key, index);
  }
  return index.get(participant) ?? new Set();
}

export function setCell(cells: Cell[], id: number, cell: Cell) {
  const key = toRaw(cells);
  const before = cells[id];
  if (before === cell) return;
  const journal = journals.get(key);
  if (before && journal && !journal.has(id)) journal.set(id, before);
  const index = indexes.get(key);
  if (index) {
    for (const { participant } of before?.highlights ?? []) index.get(participant)?.delete(id);
    for (const { participant } of cell.highlights) {
      if (!index.has(participant)) index.set(participant, new Set());
      index.get(participant)!.add(id);
    }
  }
  cells[id] = cell;
}

// Record only optimistic edits; confirmed patches are never part of the undo log.
export function optimisticEdit(cells: Cell[], edit: () => void): () => void {
  const key = toRaw(cells);
  const journal = new Map<number, Cell>();
  journals.set(key, journal);
  try { edit(); } finally { journals.delete(key); }
  return () => { for (const [id, cell] of journal) setCell(cells, id, cell); };
}

export function cellId(coord: Coordinate, width: number) {
  return coord.row * width + coord.column;
}
