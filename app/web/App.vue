<script setup lang="ts">
import Sidebar from "./components/Sidebar.vue";
import LobbyView from "./components/Lobby.vue";
import GameView from "./components/Game.vue";
import { useTeamsweeperController } from "./controller.ts";

const {
  screen,
  lobby,
  gameState,
  settings,
  status,
  busy,
  boardPending,
  pendingCell,
  syncProblem,
  isHost,
  colors,
  delayed,
  createRoom,
  joinRoom,
  leaveRoom,
  startGame,
  move,
  toggleHighlight,
  paintHighlights,
  clearHighlights,
  copyCode,
} = useTeamsweeperController();
</script>

<template>
  <div class="layout">
    <Sidebar
      :lobby="lobby"
      :colors="colors"
      :screen="screen"
      :busy="busy || boardPending"
      @create="createRoom"
      @join="joinRoom"
    />

    <main>
      <template v-if="lobby">
        <p>
          Code: <strong>{{ lobby.code }}</strong>
          <button
            :disabled="busy || boardPending"
            @click="copyCode"
          >
            Copy code
          </button>
        </p>

        <LobbyView
          v-if="screen === 'lobby' || !gameState?.snapshot"
          v-model:settings="settings"
          :lobby="lobby"
          :colors="colors"
          :is-host="isHost"
          :has-game="!!gameState?.snapshot"
          :busy="busy || boardPending"
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
          :busy="busy || boardPending || syncProblem"
          :pending-cell="pendingCell"
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

      <p v-if="delayed" role="status">
        Updates are delayed. The displayed board may be out of date.
      </p>

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