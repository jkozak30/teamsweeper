<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { TeamsweeperWireHttp } from "../../generated/wire.ts";
import { tint, type PlayerColors } from "../colors.ts";

type Lobby = TeamsweeperWireHttp["/rooms/current"]["output"];
const props = defineProps<{ lobby: Lobby; colors: PlayerColors; busy: boolean }>();
const emit = defineEmits<{ reassign: [participant: string] }>();
const choosing = ref(false);
const selected = ref("");
const isHost = computed(() => props.lobby.participant === props.lobby.host);

watch(
  [() => props.lobby.room, () => props.lobby.host],
  () => {
    choosing.value = false;
    selected.value = "";
  },
);
watch(() => props.lobby.members.participants.map(player => player.participant), players => {
  if (!players.includes(selected.value)) selected.value = "";
});

function toggle() {
  choosing.value = !choosing.value;
  selected.value = "";
}
function choose(participant: string) {
  if (selected.value === participant) emit("reassign", participant);
  else selected.value = participant;
}
</script>

<template>
  <ul class="participant-list">
    <li v-for="player in lobby.members.participants" :key="player.participant">
      <span class="swatch" aria-hidden="true"
        :style="{ backgroundColor: tint(colors[player.participant] ? [colors[player.participant]!] : []) }"
      ></span>
      <span class="participant-name">
        {{ player.name }}
        <span v-if="player.participant === lobby.participant">(you)</span>
        <span v-if="player.participant === lobby.host">(host)</span>
      </span>
      <button v-if="isHost && player.participant === lobby.participant"
        type="button" :disabled="busy" :aria-expanded="choosing" @click="toggle"
      >{{ choosing ? 'Cancel' : 'Reassign' }}</button>
      <button v-else-if="isHost && choosing" type="button" :disabled="busy"
        :aria-label="`${selected === player.participant ? 'Confirm hosting for' : 'Choose'} ${player.name}`"
        @click="choose(player.participant)"
      >{{ selected === player.participant ? 'Confirm' : 'Choose' }}</button>
    </li>
  </ul>
</template>

<style scoped>
.participant-list { list-style: none; padding: 0; }
.participant-list li {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  box-sizing: border-box;
  min-height: 52px;
  padding: 8px 12px;
}
.layout .participant-list button {
  box-sizing: border-box;
  height: 36px;
  margin: 0;
  padding: 0 10px;
  font-size: 0.7rem;
}
.participant-name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.swatch { width: 0.8rem; height: 0.8rem; border: 1px solid #555; border-radius: 50%; flex-shrink: 0; }
</style>
