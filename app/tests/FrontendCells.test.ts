import { expect, test } from "bun:test";
import { applyBoard, applyAnnotations, type BoardUpdate, type AnnotationCache } from "../web/sync.ts";
import { highlightedCells, optimisticEdit, setCell } from "../web/cell-state.ts";

function reset(width = 100, height = 100): BoardUpdate {
  return {
    revision: 0, reset: true, settings: { width, height, mines: 10 },
    status: "IDLE", clicks: 0, flagsRemaining: 10,
    startedAt: null, endedAt: null, results: [],
    cells: Array.from({ length: width * height }, (_, id) => ({
      id, coord: { row: Math.floor(id / width), column: id % width },
      revealed: false, flagged: false,
    })),
  };
}

test("one-cell deltas retain the array and untouched cells; invalid patches are atomic", () => {
  const initial = reset();
  const current = applyBoard(null, "game", initial);
  const cells = current.snapshot!.cells;
  const untouched = cells[1];
  const next = applyBoard(current, "game", {
    ...initial, reset: false, revision: 1,
    cells: [{ ...initial.cells[2]!, flagged: true }],
  });
  expect(next.snapshot!.cells).toBe(cells);
  expect(cells[1]).toBe(untouched);
  expect(cells[2]!.flagged).toBe(true);
  expect(() => applyBoard(next, "game", {
    ...initial, reset: false,
    cells: [{ ...initial.cells[2]!, flagged: false }, { ...initial.cells[3]!, id: cells.length }],
  })).toThrow("RESET_REQUIRED");
  expect(cells[2]!.flagged).toBe(true);
});

test("optimistic rollback restores only edited cells and the highlight index", () => {
  const current = applyBoard(null, "game", reset());
  const cells = current.snapshot!.cells;
  const before = cells[3]!;
  const untouched = cells[4];
  const undo = optimisticEdit(cells, () => {
    setCell(cells, 3, { ...before, flagged: true, highlights: [{ participant: "player" }] });
    setCell(cells, 3, { ...cells[3]!, revealed: true });
  });
  expect(highlightedCells(cells, "player").has(3)).toBe(true);
  undo();
  expect(cells[3]).toBe(before);
  expect(cells[4]).toBe(untouched);
  expect(highlightedCells(cells, "player").size).toBe(0);
});

test("annotation cursors, overlap, removals, and departed participants affect only their cells", () => {
  const current = applyBoard(null, "game", reset());
  const cells = current.snapshot!.cells;
  const cache: AnnotationCache = new Map();
  const targets = [{ game: "game", coord: { row: 0, column: 5 } }];
  applyAnnotations(current, [{ cursor: "cursor", participant: "a", targets }, { cursor: "cursor", participant: "b", targets }], cache);
  expect(cells[5]!.highlights.map(value => value.participant)).toEqual(["a", "b"]);
  const highlighted = cells[5];
  const untouched = cells[6];
  applyAnnotations(current, [{ cursor: "cursor", participant: "a", targets: null }, { cursor: "cursor", participant: "b", targets: null }], cache);
  expect(cells[5]).toBe(highlighted);
  applyAnnotations(current, [{ cursor: "cursor", participant: "b", targets: null }], cache);
  expect(cells[5]!.highlights.map(value => value.participant)).toEqual(["b"]);
  applyAnnotations(current, [{ cursor: "cursor", participant: "b", targets: [] }], cache);
  expect(cells[5]!.highlights).toEqual([]);
  expect(cells[6]).toBe(untouched);
  expect(() => applyAnnotations(current, [{ cursor: "cursor", participant: "unknown", targets: null }], cache))
    .toThrow("RESET_REQUIRED");
});
