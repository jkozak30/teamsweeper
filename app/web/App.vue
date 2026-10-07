<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { createHttpClient } from "@mit-sdg/sync-engine-http/client";
import type { TeamsweeperWireHttp } from "../generated/wire.ts";
import Sidebar from "./components/Sidebar.vue";
import LobbyView from "./components/Lobby.vue";
import GameView from "./components/Game.vue";
import { playerColors } from "./colors.ts";

const api = createHttpClient<TeamsweeperWireHttp>({
  baseUrl: "/api",
});

type Lobby = TeamsweeperWireHttp["/rooms/current"]["output"];
type Game = TeamsweeperWireHttp["/game/current"]["output"];
type Coordinate = TeamsweeperWireHttp["/game/reveal"]["input"]["coord"];

const screen = ref<"lobby" | "game">("lobby");
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

const colors = computed(() => playerColors(
  lobby.value?.members.participants.map(player => player.participant) ?? [],
  lobby.value?.room ?? "",
));

let pending: Promise<void> | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
let disposed = false;

function clearRoom() {
  lobby.value = null;
  gameState.value = null;
  screen.value = "lobby";
}

function report(error: string) {
  const messages: Record<string, string> = {
    INVALID_REQUEST: "Check your name, room code, board settings, or selected cell.",
    NOT_FOUND: "Room, game, or highlight not found.",
    FORBIDDEN: "You do not have permission to do that.",
    CONFLICT: "That action is unavailable, or the current game has changed.",
    UNAUTHORIZED: "Your session has expired. Please join again.",
  };

  status.value = messages[error] ?? `Request failed: ${error}`;
  if (error === "UNAUTHORIZED") clearRoom();
}

function refreshState(): Promise<void> {
  if (pending) return pending;

  pending = (async () => {
    const room = await api.rooms.current({});
    if (disposed) return;

    if ("error" in room) {
      if (["UNAUTHORIZED", "FORBIDDEN", "CONFLICT"].includes(room.error)) {
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

    // Open newly started/restored games, but preserve local navigation
    // when a poll returns the same game.
    if (game.snapshot && game.game !== gameState.value?.game) {
      settings.value = { ...game.snapshot.settings };
      screen.value = "game";
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

function createRoom(name: string) {
  return run(async () => {
    const result = await api.rooms.create({ name: name.trim() });
    if ("error" in result) return report(result.error);

    status.value = "Room created. Share the code with another player.";
  });
}

function joinRoom(name: string, code: string) {
  return run(async () => {
    const result = await api.rooms.join({
      name: name.trim(),
      code: code.trim().toUpperCase(),
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
    if ("error" in result) return report(result.error);

    screen.value = "game";
  });
}

function move(
  kind: "reveal" | "flag" | "chord",
  coord: Coordinate,
  value = false,
) {
  const game = gameState.value?.game;
  if (!game) return;

  return run(async () => {
    const cleared = await api.annotations.clear({ game });
    if ("error" in cleared) return report(cleared.error);

    if (finished.value) return;

    const result = kind === "flag"
      ? await api.game.flag({ game, coord, value })
      : kind === "reveal"
      ? await api.game.reveal({ game, coord })
      : await api.game.chord({ game, coord });

    if ("error" in result) report(result.error);
  });
}

function toggleHighlight(coord: Coordinate) {
  const game = gameState.value?.game;
  if (!game) return;

  return run(async () => {
    const state = gameState.value;
    if (!state || state.game !== game) return report("CONFLICT");

    const participant = lobby.value?.participant;
    const cell = state.snapshot?.cells.find(cell =>
      cell.coord.row === coord.row &&
      cell.coord.column === coord.column
    );
    if (!participant || !cell) return;

    const highlighted = cell.highlights.some(
      value => value.participant === participant,
    );

    const result = highlighted
      ? await api.annotations.remove({ game, coord })
      : await api.annotations.highlight({ game, coord });

    if ("error" in result) report(result.error);
  });
}

function paintHighlights(coords: Coordinate[]) {
  const game = gameState.value?.game;
  if (!game) return;

  return run(async () => {
    const state = gameState.value;
    if (!state || state.game !== game) return report("CONFLICT");

    const participant = lobby.value?.participant;
    if (!participant || !state.snapshot) return;

    const existing = new Set(
      state.snapshot.cells
        .filter(cell =>
          cell.highlights.some(
            value => value.participant === participant,
          )
        )
        .map(cell => `${cell.coord.row},${cell.coord.column}`),
    );

    for (const coord of coords) {
      const key = `${coord.row},${coord.column}`;
      if (existing.has(key)) continue;

      const result = await api.annotations.highlight({ game, coord });
      if ("error" in result) return report(result.error);

      existing.add(key);
    }
  });
}

function clearHighlights() {
  const game = gameState.value?.game;
  if (!game) return;

  return run(async () => {
    const result = await api.annotations.clear({ game });
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
  <div class="layout">
    <Sidebar
      :lobby="lobby"
      :colors="colors"
      :screen="screen"
      :busy="busy"
      @create="createRoom"
      @join="joinRoom"
    />

    <main>
      <template v-if="lobby">
        <p>
          Code: <strong>{{ lobby.code }}</strong>
          <button :disabled="busy" @click="copyCode">Copy code</button>
        </p>

        <LobbyView
          v-if="screen === 'lobby' || !gameState?.snapshot"
          v-model:settings="settings"
          :lobby="lobby"
          :colors="colors"
          :is-host="isHost"
          :has-game="!!gameState?.snapshot"
          :busy="busy"
          @start="startGame"
          @return="screen = 'game'"
          @leave="leaveRoom"
        />

        <GameView
          v-else
          v-model:settings="settings"
          :snapshot="gameState.snapshot"
          :participant="lobby.participant"
          :players="lobby.members.participants"
          :colors="colors"
          :is-host="isHost"
          :busy="busy"
          @reveal="move('reveal', $event)"
          @flag="(coord, value) => move('flag', coord, value)"
          @chord="move('chord', $event)"
          @highlight="toggleHighlight"
          @paint="paintHighlights"
          @clear="clearHighlights"
          @start="startGame"
          @lobby="screen = 'lobby'"
          @leave="leaveRoom"
        />
      </template>

      <p v-else>Create or join a room to play.</p>
      <p v-if="busy">Loading...</p>
      <p role="status">{{ status }}</p>
    </main>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 14rem minmax(0, 1fr);
  gap: 2rem;
  align-items: start;
}

@media (max-width: 650px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
</style>