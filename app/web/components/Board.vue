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
  finished: boolean;
  participant: string;
  players: { participant: string; name: string }[];
  colors: PlayerColors;
  pendingCell: string | null;
}>();

const emit = defineEmits<{
  reveal: [coord: Coordinate];
  flag: [coord: Coordinate, value: boolean];
  chord: [coord: Coordinate];
  highlight: [coord: Coordinate];
  paint: [coords: Coordinate[]];
  clear: [];
}>();

const dragging = ref(false);
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
  if (event.button !== 1) return;

  event.preventDefault();
  if (props.busy) return;

  dragging.value = true;
  visited.value = new Map([[key(cell.coord), cell.coord]]);
}

function enter(cell: Cell, event: PointerEvent) {
  if (dragging.value && (event.buttons & 4)) {
    visited.value.set(key(cell.coord), cell.coord);
  }
}

function cancel() {
  dragging.value = false;
  visited.value = new Map();
}

function end(event: PointerEvent) {
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
    :style="{ gridTemplateColumns: `repeat(${width}, 2rem)` }"
  >
    <button
      v-for="cell in cells"
      :key="key(cell.coord)"
      type="button"
      :aria-disabled="busy"
      :class="{
        revealed: cell.revealed,
        triggered: cell.triggered,
        pending: pendingCell === key(cell.coord),
      }"
      :style="{
        backgroundImage: `linear-gradient(${cellTint(cell)}, ${cellTint(cell)})`,
      }"
      :aria-label="label(cell)"
      :title="label(cell)"
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
      <template v-if="cell.mine">
        {{ cell.triggered ? '💥' : '✱' }}
      </template>
      <template v-else-if="cell.flagged">⚑</template>
      <template v-else-if="cell.revealed">
        {{ cell.adjacent || '' }}
      </template>
      <template v-else>□</template>
    </button>
  </div>
</template>

<style scoped>
.board {
  display: inline-grid;
  gap: 2px;
  user-select: none;
}

button {
  appearance: none;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: 1px solid #888;
  border-radius: 2px;
  background-color: #ccc;
  color: #111;
}

button.revealed {
  background-color: #f3f3f3;
}

button.triggered {
  border-color: #b00020;
}

button.pending {
  outline: 2px dotted #444;
  outline-offset: -3px;
}
</style>