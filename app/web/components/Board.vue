<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import type { TeamsweeperWireHttp } from "../../generated/wire.ts";
import { tint, type PlayerColors } from "../colors.ts";

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
const visited = ref(new Map<string, Coordinate>());
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
  visited.value = new Map([[key(cell.coord), cell.coord]]);
}

function enter(cell: Cell, event: PointerEvent) {
  if (pressed.value && (event.buttons & 1)) pressed.value = cell.coord;
  if (dragging.value && (event.buttons & 4)) {
    visited.value.set(key(cell.coord), cell.coord);
  }
}

function release() {
  pressed.value = null;
  emit("pressing", false);
}

function cancel() {
  release();
  dragging.value = false;
  visited.value = new Map();
}

function end(event: PointerEvent) {
  release();
  if (!dragging.value || event.button !== 1) return;

  const coords = [...visited.value.values()];
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

function cellTint(cell: Cell) {
  const authors = cell.highlights.map(value => value.participant);

  if (
    visited.value.has(key(cell.coord)) &&
    !authors.includes(props.participant)
  ) {
    authors.push(props.participant);
  }

  // Polar mixing depends on order; all clients use the same ordering.
  const colors = authors.sort()
    .map(author => props.colors[author])
    .filter((color): color is string => !!color);

  return tint(colors, 0.32);
}

function graphic(cell: Cell) {
  if (cell.triggered) return "mine_red";
  if (props.lost && cell.flagged && !cell.mine) return "mine_wrong";
  if (cell.flagged) return "closed_flag";
  if (cell.mine) return props.won ? "closed_flag" : "mine";
  if (cell.revealed) return `type${cell.adjacent ?? 0}`;

  if (props.pendingCells.some(value => {
    if (value === key(cell.coord)) return true;
    const target = props.cells.find(cell => key(cell.coord) === value);
    return target?.revealed && !!target.adjacent &&
      Math.abs(target.coord.row - cell.coord.row) <= 1 &&
      Math.abs(target.coord.column - cell.coord.column) <= 1;
  })) return "pressed";

  const target = pressed.value && props.cells.find(value =>
    key(value.coord) === key(pressed.value!)
  );
  if (target && (key(target.coord) === key(cell.coord) ||
    (target.revealed && target.adjacent &&
      Math.abs(target.coord.row - cell.coord.row) <= 1 &&
      Math.abs(target.coord.column - cell.coord.column) <= 1))) return "pressed";
  return "closed";
}

function label(cell: Cell) {
  const content = cell.mine
    ? (cell.triggered ? "triggered mine" : "mine")
    : cell.flagged
    ? "flagged"
    : cell.revealed
    ? `${cell.adjacent ?? 0} adjacent mines`
    : "hidden";

  const names = cell.highlights.map(value =>
    props.players.find(
      player => player.participant === value.participant,
    )?.name ?? value.participant
  );

  return `Row ${cell.coord.row + 1}, column ${cell.coord.column + 1}: ${content}`
    + (names.length ? `. Highlighted by ${names.join(", ")}` : "");
}
</script>

<template>
  <div
    class="board"
    @pointerleave="release"
    :style="{ gridTemplateColumns: `repeat(${width}, 24px)` }"
  >
    <button
      v-for="cell in cells"
      :key="key(cell.coord)"
      type="button"
      :aria-disabled="busy"
      :style="{ '--highlight': cellTint(cell) }"
      :aria-label="label(cell)"
      @click="click(cell, $event)"
      @contextmenu.prevent="flag(cell)"
      @pointerdown="begin(cell, $event)"
      @pointerenter="enter(cell, $event)"
      @mousedown="event => {
        if (event.button === 1) event.preventDefault();
      }"
      @auxclick.prevent
      @dragstart.prevent
    >
      <img :src="`/skins/hd/${graphic(cell)}.svg`" alt="" draggable="false" />
    </button>
  </div>
</template>

<style scoped>
.board {
  display: grid;
  width: max-content;
  user-select: none;
  grid-auto-rows: 24px;
  border: 4px solid;
  border-color: #808080 #fff #fff #808080;
}

button {
  position: relative;
  appearance: none;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: #c6c6c6;
}

button img {
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

button::after {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--highlight);
  pointer-events: none;
}

button:focus-visible {
  outline: 2px solid #1574b8;
  outline-offset: -2px;
  z-index: 1;
}
</style>
