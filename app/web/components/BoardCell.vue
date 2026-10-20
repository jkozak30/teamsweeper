<script setup lang="ts">
import { computed, inject } from "vue";
import { boardContext } from "./board-context.ts";
import { tint } from "../colors.ts";
import type { Cell } from "../cell-state.ts";
const own = defineProps<{ id: number }>();
const context = inject(boardContext)!;
const { props, pressedCells, visited, names: playerNames } = context;
const cell = computed(() => props.cells[own.id]!);
const key = (coord: Cell["coord"]) => `${coord.row},${coord.column}`;
const background = computed(() => cellTint(cell.value));
const image = computed(() => graphic(cell.value));
const description = computed(() => label(cell.value));
function cellTint(cell: Cell) {
  const authors = cell.highlights.map(value => value.participant);

  if (
    visited.has(key(cell.coord)) &&
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

  if (pressedCells.has(props.width * cell.coord.row + cell.coord.column)) return "pressed";
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
    playerNames.value.get(value.participant) ?? value.participant
  );

  return `Row ${cell.coord.row + 1}, column ${cell.coord.column + 1}: ${content}`
    + (names.length ? `. Highlighted by ${names.join(", ")}` : "");
}
</script>

<template>
  <button type="button" :aria-disabled="props.busy"
    :style="{ '--highlight': background }" :aria-label="description"
    @mousedown.prevent
    @auxclick.prevent @dragstart.prevent>
    <img :src="`/skins/hd/${image}.svg`" alt="" draggable="false" />
  </button>
</template>

<style scoped>
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
