<script setup lang="ts">
import { computed, ref } from "vue";
import type { TeamsweeperWireHttp } from "../../generated/wire.ts";

type Lobby = TeamsweeperWireHttp["/rooms/current"]["output"];

const props = defineProps<{
  lobby: Lobby | null;
  screen: "lobby" | "game";
  busy: boolean;
}>();

const emit = defineEmits<{
  create: [name: string];
  join: [name: string, code: string];
}>();

const name = ref("");
const code = ref("");

const currentName = computed(() =>
  props.lobby?.members.participants.find(
    player => player.participant === props.lobby?.participant,
  )?.name
);
</script>

<template>
  <aside>
    <h1>Teamsweeper</h1>

    <p v-if="lobby">{{ currentName }} (you)</p>

    <fieldset v-else :disabled="busy">
      <legend>Enter a room</legend>

      <label>
        Your name
        <input v-model="name" autocomplete="nickname" />
      </label>

      <form @submit.prevent="emit('create', name)">
        <button :disabled="!name.trim()">Create room</button>
      </form>

      <form @submit.prevent="emit('join', name, code)">
        <label>
          Room code
          <input v-model="code" required />
        </label>
        <button :disabled="!name.trim() || !code.trim()">
          Join room
        </button>
      </form>
    </fieldset>

    <section v-if="lobby && screen === 'game'">
      <h2>Participants</h2>
      <ul>
        <li
          v-for="player in lobby.members.participants"
          :key="player.participant"
        >
          {{ player.name }}
          <span v-if="player.participant === lobby.participant">(you)</span>
          <span v-if="player.participant === lobby.host">(host)</span>
        </li>
      </ul>
    </section>
  </aside>
</template>