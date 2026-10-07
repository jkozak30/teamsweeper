<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { createHttpClient } from "@mit-sdg/sync-engine-http/client";
import type { TeamsweeperWireHttp } from "../generated/wire.ts";

const api = createHttpClient<TeamsweeperWireHttp>({
  baseUrl: "/api",
});

type Lobby = TeamsweeperWireHttp["/rooms/current"]["output"];

const name = ref("");
const code = ref("");
const lobby = ref<Lobby | null>(null);
const status = ref("");
const busy = ref(true);

let refreshing = false;
let timer: ReturnType<typeof setInterval> | undefined;
let disposed = false;

async function refreshLobby() {
  if (refreshing) return;
  refreshing = true;

  try {
    const result = await api.rooms.current({});
    if (disposed) return;

    if ("error" in result) {
      if (
        result.error === "UNAUTHORIZED" ||
        result.error === "FORBIDDEN" ||
        result.error === "CONFLICT"
      ) {
        if (lobby.value) {
          status.value = "Your room session is no longer available.";
        }
        lobby.value = null;
      } else {
        status.value = `Could not load room: ${result.error}`;
      }
      return;
    }

    lobby.value = result;
  } finally {
    refreshing = false;
  }
}

async function run(operation: () => Promise<void>) {
  busy.value = true;
  status.value = "";

  try {
    await operation();
  } catch {
    status.value = "Could not reach the server. Please try again.";
  } finally {
    busy.value = false;
  }
}

function createRoom() {
  return run(async () => {
    const result = await api.rooms.create({
      name: name.value.trim(),
    });

    if ("error" in result) {
      status.value = `Could not create room: ${result.error}`;
      return;
    }

    await refreshLobby();
    if (lobby.value) {
      status.value = "Room created. Share the code with another player.";
    }
  });
}

function joinRoom() {
  return run(async () => {
    const result = await api.rooms.join({
      name: name.value.trim(),
      code: code.value.trim().toUpperCase(),
    });

    if ("error" in result) {
      status.value = result.error === "NOT_FOUND"
        ? "Room not found or closed. Check the code."
        : `Could not join room: ${result.error}`;
      return;
    }

    await refreshLobby();
    if (lobby.value) status.value = "Joined the room.";
  });
}

function leaveRoom() {
  return run(async () => {
    const result = await api.rooms.leave({});

    if ("error" in result && result.error !== "UNAUTHORIZED") {
      status.value = `Could not leave room: ${result.error}`;
      return;
    }

    lobby.value = null;
    status.value = "You are no longer signed in to the room.";
  });
}

async function copyCode() {
  if (!lobby.value) return;

  try {
    await navigator.clipboard.writeText(lobby.value.code);
    status.value = "Code copied.";
  } catch {
    status.value = "Could not copy. Select and copy the code manually.";
  }
}

onMounted(async () => {
  await run(refreshLobby);
  if (disposed) return;

  timer = setInterval(() => {
    if (lobby.value && !busy.value) {
      void refreshLobby().catch(() => {
        if (!disposed) {
          status.value = "Could not update room. Retrying automatically.";
        }
      });
    }
  }, 2000);
});

onUnmounted(() => {
  disposed = true;
  if (timer !== undefined) clearInterval(timer);
});
</script>

<template>
  <main>
    <h1>Teamsweeper</h1>

    <fieldset v-if="!lobby" :disabled="busy">
      <legend>Enter a room</legend>

      <label>
        Your name
        <input v-model="name" autocomplete="nickname" />
      </label>

      <form @submit.prevent="createRoom">
        <button :disabled="!name.trim()">Create room</button>
      </form>

      <form @submit.prevent="joinRoom">
        <label>
          Room code
          <input v-model="code" required />
        </label>
        <button :disabled="!name.trim() || !code.trim()">
          Join room
        </button>
      </form>
    </fieldset>

    <section v-else>
      <h2>Room</h2>

      <p>
        Code: <strong>{{ lobby.code }}</strong>
        <button :disabled="busy" @click="copyCode">Copy code</button>
      </p>

      <h3>Players</h3>
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

      <button :disabled="busy" @click="leaveRoom">Leave room</button>
    </section>

    <p v-if="busy">Loading...</p>
    <p role="status">{{ status }}</p>
  </main>
</template>