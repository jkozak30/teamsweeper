<script setup lang="ts">
import type { TeamsweeperWireHttp } from "../../generated/wire.ts";
import GameSettings from "./GameSettings.vue";
import ParticipantList from "./ParticipantList.vue";
import { type PlayerColors } from "../colors.ts";

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
  reassign: [participant: string];
}>();
</script>

<template>
  <section>
    <h2 class="page-title">Lobby</h2>

    <h3>Participants</h3>
    <ParticipantList
      :lobby="lobby" :colors="colors" :busy="busy"
      @reassign="emit('reassign', $event)"
    />

    <form id="lobby-start" v-if="isHost" @submit.prevent="emit('start')">
      <GameSettings
        v-model:settings="settings"
        :busy="busy"
      />


    </form>

    <p v-else>The host can start a game.</p>

    <div class="action-row">
      <button v-if="isHost" class="start-button" type="submit" form="lobby-start" :disabled="busy">
        {{ hasGame ? 'Start new game' : 'Start game' }}
      </button>
    <button
      v-if="hasGame"
      :disabled="busy"
      @click="emit('return')"
    >
      Return to game
    </button>

    <button class="leave-button" :disabled="busy" @click="emit('leave')">
      Leave room
    </button>
    </div>
  </section>
</template>

