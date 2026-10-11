<script setup lang="ts">
import { inject } from "vue";
import BoardCell from "./BoardCell.vue";
import { boardContext } from "./board-context.ts";
import type { Cell } from "../cell-state.ts";
defineProps<{ cells: Cell[]; width: number }>();
const context = inject(boardContext)!;
</script>

<template>
  <div class="board" @pointerleave="context.release"
    :style="{ gridTemplateColumns: `repeat(${width}, 24px)` }">
    <BoardCell v-for="id in cells.length" :key="id" :id="id - 1"
      @click="context.click(cells[id - 1]!, $event)"
      @contextmenu.prevent="context.flag(cells[id - 1]!)"
      @pointerdown="context.begin(cells[id - 1]!, $event)"
      @pointerenter="context.enter(cells[id - 1]!, $event)" />
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
</style>
