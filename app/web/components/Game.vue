<script setup lang="ts">
import { computed } from "vue";
import type { TeamsweeperWireHttp } from "../../generated/wire.ts";
import Board from "./Board.vue";
import GameSettings from "./GameSettings.vue";

type Snapshot = NonNullable<
  TeamsweeperWireHttp["/game/current"]["output"]["snapshot"]
>;
type Coordinate = Snapshot["cells"][number]["coord"];
type Settings = TeamsweeperWireHttp["/game/start"]["input"]["settings"];

const props = defineProps<{
  snapshot: Snapshot;
  isHost: boolean;
  busy: boolean;
}>();

const settings = defineModel<Settings>("settings", {
  required: true,
});

const emit = defineEmits<{
  reveal: [coord: Coordinate];
  flag: [coord: Coordinate, value: boolean];
  chord: [coord: Coordinate];
  start: [];
  lobby: [];
  leave: [];
}>();

const finished = computed(() =>
  props.snapshot.status === "WON" ||
  props.snapshot.status === "LOST"
);

const result = computed(() => props.snapshot.results[0]);

function openSettings(event: Event) {
  (event.currentTarget as HTMLDetailsElement).open = true;
}
</script>

<template>
  <section>
    <h2>Game: {{ snapshot.status }}</h2>

    <p>
      Flags remaining: {{ snapshot.flagsRemaining }}
      · Moves: {{ snapshot.clicks }}
    </p>

    <p>
      Click to reveal. Right-click or Shift-click to flag.
      Click a revealed number to chord.
    </p>

    <div class="board-container">
      <Board
        :width="snapshot.settings.width"
        :cells="snapshot.cells"
        :disabled="busy || finished"
        @reveal="emit('reveal', $event)"
        @flag="(coord, value) => emit('flag', coord, value)"
        @chord="emit('chord', $event)"
      />
    </div>

    <section v-if="result">
      <h3>Results</h3>

      <dl>
        <dt>Time</dt>
        <dd>{{ result.time.toFixed(2) }} seconds</dd>

        <dt>3BV</dt>
        <dd>{{ result.bv }}</dd>

        <dt>Moves</dt>
        <dd>{{ result.clicks }}</dd>

        <dt>Speed</dt>
        <dd>{{ result.speed.toFixed(2) }} 3BV units/second</dd>

        <dt>Efficiency</dt>
        <dd>{{ result.efficiency.toFixed(2) }} 3BV units/move</dd>
      </dl>
    </section>

    <form v-if="isHost" @submit.prevent="emit('start')">
      <details
        v-if="finished"
        @invalid.capture="openSettings"
      >
        <summary>Adjust settings</summary>

        <GameSettings
          v-model:settings="settings"
          :busy="busy"
        />
      </details>

      <button :disabled="busy">Start new game</button>
    </form>

    <button :disabled="busy" @click="emit('lobby')">
      Return to lobby
    </button>

    <button :disabled="busy" @click="emit('leave')">
      Leave room
    </button>
  </section>
</template>

<style scoped>
.board-container {
  overflow-x: auto;
}
</style>