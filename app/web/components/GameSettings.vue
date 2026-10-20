<script setup lang="ts">
import { MAX_BOARD_DIMENSION } from "../../src/limits.ts";
import type { TeamsweeperWireHttp } from "../../generated/wire.ts";

type Settings = TeamsweeperWireHttp["/game/start"]["input"]["settings"];

defineProps<{ busy: boolean }>();
const settings = defineModel<Settings>("settings", { required: true });
</script>

<template>
  <fieldset class="board-settings" :disabled="busy">
    <legend>Board settings</legend>
    <input v-model.number="settings.width" aria-label="Board width" type="number" min="1" :max="MAX_BOARD_DIMENSION" step="1" required />
    <span aria-hidden="true">×</span>
    <input v-model.number="settings.height" aria-label="Board height" type="number" min="1" :max="MAX_BOARD_DIMENSION" step="1" required />
    <span aria-hidden="true">/</span>
    <input v-model.number="settings.mines" aria-label="Mine count" type="number" min="1"
      :max="settings.height * settings.width - 1" step="1" required />
  </fieldset>
</template>

<style scoped>
input:invalid {
  background: #38252b;
  color: #ffc1bb;
  outline: 2px solid #c87c77;
  outline-offset: -2px;
}
</style>