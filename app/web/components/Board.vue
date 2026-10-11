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

function click(cell: Cell, event: MouseEvent) {
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

function begin(cell: Cell, event: PointerEvent) {
  if (event.button === 0 && !props.busy && !props.finished && !event.shiftKey) {
    pressed.value = cell.coord;
    emit("pressing", true);
  }
  if (event.button !== 1) return;

  event.preventDefault();
  if (props.busy) return;

  dragging.value = true;
  visited.clear();
  visited.set(key(cell.coord), cell.coord);
}

function enter(cell: Cell, event: PointerEvent) {
  if (pressed.value && (event.buttons & 1)) pressed.value = cell.coord;
  if (dragging.value && (event.buttons & 4)) {
    visited.set(key(cell.coord), cell.coord);
  }
}

function release() {
  pressed.value = null;
  emit("pressing", false);
}

function cancel() {
  release();
  dragging.value = false;
  visited.clear();
}

function end(event: PointerEvent) {
  release();
  if (!dragging.value || event.button !== 1) return;

  const coords = [...visited.values()];
  cancel();

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
});

onUnmounted(() => {
  window.removeEventListener("pointerup", end);
  window.removeEventListener("pointercancel", cancel);
  window.removeEventListener("blur", cancel);
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
