<script setup lang="ts">
import type { TeamsweeperWireHttp } from "../../generated/wire.ts";

type Snapshot = NonNullable<
  TeamsweeperWireHttp["/game/current"]["output"]["snapshot"]
>;
type Cell = Snapshot["cells"][number];

const props = defineProps<{
  width: number;
  cells: Cell[];
  disabled: boolean;
}>();

const emit = defineEmits<{
  reveal: [coord: Cell["coord"]];
  flag: [coord: Cell["coord"], value: boolean];
  chord: [coord: Cell["coord"]];
}>();

function click(cell: Cell, event: MouseEvent) {
  if (props.disabled) return;
  if (event.shiftKey) return flag(cell);

  if (cell.revealed) {
    if (cell.adjacent && cell.adjacent > 0) {
      emit("chord", cell.coord);
    }
  } else if (!cell.flagged) {
    emit("reveal", cell.coord);
  }
}

function flag(cell: Cell) {
  if (!props.disabled && !cell.revealed) {
    emit("flag", cell.coord, !cell.flagged);
  }
}

function label(cell: Cell) {
  const content = cell.mine
    ? (cell.triggered ? "triggered mine" : "mine")
    : cell.flagged
    ? "flagged"
    : cell.revealed
    ? `${cell.adjacent ?? 0} adjacent mines`
    : "hidden";

  return `Row ${cell.coord.row + 1}, column ${cell.coord.column + 1}: ${content}`;
}
</script>

<template>
  <div
    class="board"
    :style="{ gridTemplateColumns: `repeat(${width}, 2rem)` }"
  >
    <button
      v-for="cell in cells"
      :key="`${cell.coord.row},${cell.coord.column}`"
      type="button"
      :disabled="disabled"
      :aria-label="label(cell)"
      :title="label(cell)"
      @click="click(cell, $event)"
      @contextmenu.prevent="flag(cell)"
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
}

button {
  width: 2rem;
  height: 2rem;
  padding: 0;
}
</style>