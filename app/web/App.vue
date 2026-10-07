<script setup lang="ts">
import { onMounted, ref } from "vue";
import { createHttpClient } from "@mit-sdg/sync-engine-http/client";
import type { TeamsweeperWireHttp } from "../generated/wire.ts";

const api = createHttpClient<TeamsweeperWireHttp>({
  baseUrl: "/api",
});

const name = ref("");
const code = ref("");
const participant = ref<string | null>(null);
const roomCode = ref("");
const status = ref("");
const busy = ref(true);

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

    participant.value = result.participant;
    roomCode.value = result.code;
    status.value = "Room created. Share the code with another player.";
  });
}

function joinRoom() {
  return run(async () => {
    const enteredCode = code.value.trim().toUpperCase();
    const result = await api.rooms.join({
      name: name.value.trim(),
      code: enteredCode,
    });

    if ("error" in result) {
      status.value = result.error === "NOT_FOUND"
        ? "Room not found or closed. Check the code."
        : `Could not join room: ${result.error}`;
      return;
    }

    participant.value = result.participant;
    roomCode.value = enteredCode;
    status.value = "Joined the room.";
  });
}

function leaveRoom() {
  return run(async () => {
    const result = await api.rooms.leave({});

    if ("error" in result && result.error !== "UNAUTHORIZED") {
      status.value = `Could not leave room: ${result.error}`;
      return;
    }

    participant.value = null;
    roomCode.value = "";
    status.value = "You are no longer signed in to the room.";
  });
}

async function copyCode() {
  try {
    await navigator.clipboard.writeText(roomCode.value);
    status.value = "Code copied.";
  } catch {
    status.value = "Could not copy. Select and copy the code manually.";
  }
}

onMounted(() => {
  void run(async () => {
    const result = await api.rooms.current({});

    if ("error" in result) {
      if (result.error !== "UNAUTHORIZED") {
        status.value = `Could not restore session: ${result.error}`;
      }
      return;
    }

    participant.value = result.participant;
    status.value = "Session restored.";
  });
});
</script>

<template>
  <main>
    <h1>Teamsweeper</h1>

    <fieldset v-if="!participant" :disabled="busy">
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

      <p v-if="roomCode">
        Code: <strong>{{ roomCode }}</strong>
        <button :disabled="busy" @click="copyCode">Copy code</button>
      </p>
      <p v-else>
        Your session was restored. Room details are not available yet.
      </p>

      <button :disabled="busy" @click="leaveRoom">Leave room</button>
    </section>

    <p v-if="busy">Loading...</p>
    <p role="status">{{ status }}</p>
  </main>
</template>