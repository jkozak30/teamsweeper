<script setup lang="ts">
import type { TeamsweeperWireHttp } from "../../generated/wire.ts";

type Settings = TeamsweeperWireHttp["/game/start"]["input"]["settings"];

defineProps<{ busy: boolean }>();
const settings = defineModel<Settings>("settings", { required: true });
</script>

<template>
  <fieldset class="board-settings" :disabled="busy">
    <legend>Board settings</legend>
    <input v-model.number="settings.width" aria-label="Board width" type="number" min="1" step="1" required />
    <span aria-hidden="true">×</span>
    <input v-model.number="settings.height" aria-label="Board height" type="number" min="1" step="1" required />
    <span aria-hidden="true">/</span>
    <input v-model.number="settings.mines" aria-label="Mine count" type="number" min="1"
      :max="settings.height * settings.width - 1" step="1" required />
  </fieldset>
</template>
