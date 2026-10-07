<script setup lang="ts">
import type { TeamsweeperWireHttp } from "../../generated/wire.ts";
import GameSettings from "./GameSettings.vue";
import { tint, type PlayerColors } from "../colors.ts";

type Lobby = TeamsweeperWireHttp["/rooms/current"]["output"];
type Settings = TeamsweeperWireHttp["/game/start"]["input"]["settings"];

defineProps<{
  lobby: Lobby;
  isHost: boolean;
  hasGame: boolean;
  busy: boolean;
  colors: PlayerColors;
}>();

const settings = defineModel<Settings>("settings", {
  required: true,
});

const emit = defineEmits<{
  start: [];
  return: [];
  leave: [];
}>();
</script>

<template>
  <section>
    <h2>Lobby</h2>

    <h3>Participants</h3>
    <ul>
      <li
        v-for="player in lobby.members.participants"
        :key="player.participant"
      >
        <span
          class="swatch"
          aria-hidden="true"
          :style="{
            backgroundColor: tint(
              colors[player.participant]
                ? [colors[player.participant]!]
                : [],
            ),
          }"
        ></span>
        {{ player.name }}
        <span v-if="player.participant === lobby.participant">(you)</span>
        <span v-if="player.participant === lobby.host">(host)</span>
      </li>
    </ul>

    <form v-if="isHost" @submit.prevent="emit('start')">
      <GameSettings
        v-model:settings="settings"
        :busy="busy"
      />

      <button :disabled="busy">
        {{ hasGame ? 'Start new game' : 'Start game' }}
      </button>
    </form>

    <p v-else>The host can start a game.</p>

    <button
      v-if="hasGame"
      :disabled="busy"
      @click="emit('return')"
    >
      Return to game
    </button>

    <button :disabled="busy" @click="emit('leave')">
      Leave room
    </button>
  </section>
</template>

<style scoped>
.swatch {
  display: inline-block;
  width: 0.8rem;
  height: 0.8rem;
  border: 1px solid #555;
  border-radius: 50%;
  margin-right: 0.35rem;
}
</style>