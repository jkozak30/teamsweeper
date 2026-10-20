<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, reactive, ref, watchEffect } from "vue";
import BoardGrid from "./BoardGrid.vue";
import { boardContext } from "./board-context.ts";
import type { TeamsweeperWireHttp } from "../../generated/wire.ts";
import { type PlayerColors } from "../colors.ts";

type Snapshot = NonNullable<
  TeamsweeperWireHttp["/game/current"]["output"]["snapshot"]
>;
type Cell = Snapshot["cells"][number];
type Coordinate = Cell["coord"];

const props = defineProps<{
  width: number;
  cells: Cell[];
  busy: boolean;
  pendingCells: string[];
  finished: boolean;
  participant: string;
  players: { participant: string; name: string }[];
  colors: PlayerColors;
  lost: boolean;
  won: boolean;
}>();

const emit = defineEmits<{
  reveal: [coord: Coordinate];
  flag: [coord: Coordinate, value: boolean];
  chord: [coord: Coordinate];
  highlight: [coord: Coordinate];
  paint: [coords: Coordinate[]];
  clear: [];
  pressing: [value: boolean];
}>();

const dragging = ref(false);
const pressed = ref<Coordinate | null>(null);
const visited = reactive(new Map<string, Coordinate>());
const key = (coord: Coordinate) =>
  `${coord.row},${coord.column}`;

let holdingH = false;

function keyDown(event: KeyboardEvent) {
  if (event.key.toLowerCase() !== "h") return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (
    event.target instanceof Element &&
    event.target.closest("input, textarea, select, [contenteditable]")
  ) return;

  holdingH = true;
}

function keyUp(event: KeyboardEvent) {
  if (event.key.toLowerCase() === "h") holdingH = false;
}

function click(cell: Cell, event: MouseEvent) {
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  if (props.busy || dragging.value) return;
  if (event.shiftKey) return flag(cell);
  if (props.finished) return emit("clear");

  if (cell.revealed && cell.adjacent && cell.adjacent > 0) {
    emit("chord", cell.coord);
  } else if (!cell.revealed && !cell.flagged) {
    emit("reveal", cell.coord);
  } else {
    emit("clear");
  }
}

function flag(cell: Cell) {
  if (props.busy || dragging.value) return;

  if (props.finished || cell.revealed) {
    return emit("clear");
  }

  emit("flag", cell.coord, !cell.flagged);
}

let highlightButton: number | null = null;
let suppressClick = false;

function begin(cell: Cell, event: PointerEvent) {
  suppressClick = false;

  const highlighting =
    event.button === 1 ||
    (event.button === 0 && holdingH);

  if (highlighting) {
    event.preventDefault();
    if (props.busy) return;

    highlightButton = event.button;
    dragging.value = true;
    visited.clear();
    visited.set(key(cell.coord), cell.coord);
    return;
  }

  if (
    event.button === 0 &&
    !props.busy &&
    !props.finished &&
    !event.shiftKey
  ) {
    pressed.value = cell.coord;
    emit("pressing", true);
  }
}

function enter(cell: Cell, event: PointerEvent) {
  if (pressed.value && (event.buttons & 1)) {
    pressed.value = cell.coord;
  }

  const mask = highlightButton === 0 ? 1 : 4;
  if (dragging.value && (event.buttons & mask)) {
    visited.set(key(cell.coord), cell.coord);
  }
}

function release() {
  pressed.value = null;
  emit("pressing", false);
}

function cancel() {
  holdingH = false;
  highlightButton = null;
  suppressClick = false;
  release();
  dragging.value = false;
  visited.clear();
}

function end(event: PointerEvent) {
  release();
  if (!dragging.value || event.button !== highlightButton) return;

  const coords = [...visited.values()];
  suppressClick = highlightButton === 0;
  dragging.value = false;
  highlightButton = null;
  visited.clear();

  if (props.busy) return;

  if (coords.length === 1) {
    emit("highlight", coords[0]!);
  } else if (coords.length) {
    emit("paint", coords);
  }
}

onMounted(() => {
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", cancel);
  window.addEventListener("blur", cancel);
  window.addEventListener("keydown", keyDown);
  window.addEventListener("keyup", keyUp);
});

onUnmounted(() => {
  window.removeEventListener("pointerup", end);
  window.removeEventListener("pointercancel", cancel);
  window.removeEventListener("blur", cancel);
  window.removeEventListener("keydown", keyDown);
  window.removeEventListener("keyup", keyUp);
});

const names = computed(() => new Map(props.players.map(player => [player.participant, player.name])));
const pressedCells = reactive(new Set<number>());
watchEffect(() => {
  const next = new Set<number>();
  const add = (coord: Coordinate) => {
    const target = props.cells[coord.row * props.width + coord.column];
    if (!target) return;
    next.add(coord.row * props.width + coord.column);
    if (!target.revealed || !target.adjacent) return;
    const height = props.cells.length / props.width;
    for (let row = Math.max(0, coord.row - 1); row <= Math.min(height - 1, coord.row + 1); row++) {
      for (let column = Math.max(0, coord.column - 1); column <= Math.min(props.width - 1, coord.column + 1); column++) {
        next.add(row * props.width + column);
      }
    }
  };
  for (const key of props.pendingCells) {
    const [row, column] = key.split(",").map(Number);
    add({ row: row!, column: column! });
  }
  if (pressed.value) add(pressed.value);
  for (const id of pressedCells) if (!next.has(id)) pressedCells.delete(id);
  for (const id of next) if (!pressedCells.has(id)) pressedCells.add(id);
}, { flush: "sync" });
provide(boardContext, { props, pressedCells, visited, names, click, flag, begin, enter, release });
</script>

<template>
  <BoardGrid :cells="cells" :width="width" />
</template>
