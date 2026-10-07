<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { createHttpClient } from "@mit-sdg/sync-engine-http/client";
import type { TeamsweeperWireHttp } from "../generated/wire.ts";
import Board from "./Board.vue";

const api = createHttpClient<TeamsweeperWireHttp>({
  baseUrl: "/api",
});

type Lobby = TeamsweeperWireHttp["/rooms/current"]["output"];
type Game = TeamsweeperWireHttp["/game/current"]["output"];
type Coordinate = TeamsweeperWireHttp["/game/reveal"]["input"]["coord"];

const name = ref("");
const code = ref("");
const lobby = ref<Lobby | null>(null);
const gameState = ref<Game | null>(null);
const settings = ref({ height: 9, width: 9, mines: 10 });
const status = ref("");
const busy = ref(true);

const isHost = computed(() =>
  !!lobby.value &&
  lobby.value.participant === lobby.value.host
);

const finished = computed(() =>
  gameState.value?.snapshot?.status === "WON" ||
  gameState.value?.snapshot?.status === "LOST"
);

let pending: Promise<void> | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
let disposed = false;

function clearRoom() {
  lobby.value = null;
  gameState.value = null;
}

function report(error: string) {
  const messages: Record<string, string> = {
    INVALID_REQUEST: "Check your name, room code, or board settings.",
    NOT_FOUND: "Room or game not found.",
    FORBIDDEN: "You do not have permission to do that.",
    CONFLICT: "That move is unavailable, or the current game has changed.",
    UNAUTHORIZED: "Your session has expired. Please join again.",
  };

  status.value = messages[error] ?? `Request failed: ${error}`;
  if (error === "UNAUTHORIZED") clearRoom();
}

// Share one refresh at a time. Actions wait for older polls to finish.
function refreshState(): Promise<void> {
  if (pending) return pending;

  pending = (async () => {
    const room = await api.rooms.current({});
    if (disposed) return;

    if ("error" in room) {
      if (
        ["UNAUTHORIZED", "FORBIDDEN", "CONFLICT"].includes(room.error)
      ) {
        if (lobby.value) {
          status.value = "Your room session is no longer available.";
        }
        clearRoom();
      } else {
        report(room.error);
      }
      return;
    }

    lobby.value = room;

    const game = await api.game.current({});
    if (disposed) return;

    if ("error" in game) {
      gameState.value = null;
      report(game.error);
      return;
    }

    gameState.value = game;
  })().finally(() => {
    pending = null;
  });

  return pending;
}

async function run(operation: () => Promise<void>) {
  if (busy.value || disposed) return;

  busy.value = true;
  status.value = "";

  try {
    if (pending) await pending;
    if (disposed) return;

    await operation();
    if (!disposed) await refreshState();
  } catch {
    if (!disposed) {
      status.value = "Could not reach the server. Please try again.";
    }
  } finally {
    busy.value = false;
  }
}

function createRoom() {
  return run(async () => {
    const result = await api.rooms.create({
      name: name.value.trim(),
    });

    if ("error" in result) return report(result.error);
    status.value = "Room created. Share the code with another player.";
  });
}

function joinRoom() {
  return run(async () => {
    const result = await api.rooms.join({
      name: name.value.trim(),
      code: code.value.trim().toUpperCase(),
    });

    if ("error" in result) return report(result.error);
    status.value = "Joined the room.";
  });
}

function leaveRoom() {
  return run(async () => {
    const result = await api.rooms.leave({});

    if ("error" in result && result.error !== "UNAUTHORIZED") {
      return report(result.error);
    }

    clearRoom();
    status.value = "You have left the room.";
  });
}

function startGame() {
  return run(async () => {
    if (!lobby.value || !isHost.value) return;

    const result = await api.game.start({
      room: lobby.value.room,
      settings: { ...settings.value },
    });

    if ("error" in result) report(result.error);
  });
}

function move(
  kind: "reveal" | "flag" | "chord",
  coord: Coordinate,
  value = false,
) {
  const game = gameState.value?.game;
  if (!game || finished.value) return;

  return run(async () => {
    const result = kind === "flag"
      ? await api.game.flag({ game, coord, value })
      : kind === "reveal"
      ? await api.game.reveal({ game, coord })
      : await api.game.chord({ game, coord });

    if ("error" in result) report(result.error);
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
  try {
    await refreshState();
  } catch {
    status.value = "Could not reach the server. Please reload to try again.";
  } finally {
    busy.value = false;
  }

  if (disposed) return;

  timer = setInterval(() => {
    if (lobby.value && !busy.value) {
      void refreshState().catch(() => {
        if (!disposed) {
          status.value = "Could not update the room. Retrying automatically.";
        }
      });
    }
  }, 500);
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

      <form v-if="isHost" @submit.prevent="startGame">
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

          <button>
            {{ gameState?.game ? 'Start new game' : 'Start game' }}
          </button>
        </fieldset>
      </form>
      <p v-else>The host can start a game.</p>

      <section v-if="gameState?.snapshot">
        <h2>Game: {{ gameState.snapshot.status }}</h2>
        <p>
          Flags remaining: {{ gameState.snapshot.flagsRemaining }}
          · Moves: {{ gameState.snapshot.clicks }}
        </p>
        <p>
          Click to reveal. Right-click or Shift-click to flag.
          Click a revealed number to chord.
        </p>

        <Board
          :width="gameState.snapshot.settings.width"
          :cells="gameState.snapshot.cells"
          :disabled="busy || finished"
          @reveal="move('reveal', $event)"
          @flag="(coord, value) => move('flag', coord, value)"
          @chord="move('chord', $event)"
        />

        <section v-if="gameState.snapshot.results[0]">
          <h3>Results</h3>
          <dl>
            <dt>Time</dt>
            <dd>
              {{ gameState.snapshot.results[0].time.toFixed(2) }} seconds
            </dd>
            <dt>3BV</dt>
            <dd>{{ gameState.snapshot.results[0].bv }}</dd>
            <dt>Moves</dt>
            <dd>{{ gameState.snapshot.results[0].clicks }}</dd>
            <dt>Speed</dt>
            <dd>
              {{ gameState.snapshot.results[0].speed.toFixed(2) }}
              3BV units/second
            </dd>
            <dt>Efficiency</dt>
            <dd>
              {{ gameState.snapshot.results[0].efficiency.toFixed(2) }}
              3BV units/move
            </dd>
          </dl>
        </section>
      </section>
      <p v-else>No game has started yet.</p>

      <button :disabled="busy" @click="leaveRoom">Leave room</button>
    </section>

    <p v-if="busy">Loading...</p>
    <p role="status">{{ status }}</p>
  </main>
</template>