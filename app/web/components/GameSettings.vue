<script setup lang="ts">
import type { TeamsweeperWireHttp } from "../../generated/wire.ts";

type Settings = TeamsweeperWireHttp["/game/start"]["input"]["settings"];

defineProps<{ busy: boolean }>();
const settings = defineModel<Settings>("settings", { required: true });
</script>

<template>
  <fieldset :disabled="busy">
    <legend>Board settings</legend>

    <label>
      Height
      <input
        v-model.number="settings.height"
        type="number"
        min="1"
        step="1"
        required
      />
    </label>
    <label>
      Width
      <input
        v-model.number="settings.width"
        type="number"
        min="1"
        step="1"
        required
      />
    </label>
    <label>
      Mines
      <input
        v-model.number="settings.mines"
        type="number"
        min="1"
        :max="settings.height * settings.width - 1"
        step="1"
        required
      />
    </label>
  </fieldset>
</template>