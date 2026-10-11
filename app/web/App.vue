<script setup lang="ts">
import Sidebar from "./components/Sidebar.vue";
import LobbyView from "./components/Lobby.vue";
import GameView from "./components/Game.vue";
import { useTeamsweeperController } from "./controller.ts";

const {
  rankings,
  screen,
  lobby,
  gameState,
  settings,
  status,
  busy,
  pendingCells,
  syncProblem,
  isHost,
  colors,
  delayed,
  createRoom,
  joinRoom,
  leaveRoom,
  reassignHost,
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
      v-model:rankings="rankings"
      :lobby="lobby"
      :current-game="gameState?.game ?? null"
      :colors="colors"
      :screen="screen"
      :busy="busy"
      @create="createRoom"
      @join="joinRoom"
      @reassign="reassignHost"
    />

    <main>
      <template v-if="lobby">
        <p class="room-bar">
          <strong>{{ lobby.code }}</strong>
          <button
            class="copy-button"
            aria-label="Copy room code"
            :disabled="busy"
            @click="copyCode"
          >
            <span class="icon copy-icon" aria-hidden="true"></span>
          </button>
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
          @reassign="reassignHost"
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
          :busy="busy || syncProblem"
          :board-busy="busy || syncProblem"
          :pending-cells="pendingCells"
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
  grid-template-columns: clamp(20.5rem, 28vw, 24rem) minmax(max-content, 1fr);
  width: max-content;
  min-width: 100%;
  gap: 1rem;
  align-items: start;
  padding: 20px;
  box-sizing: border-box;
  background: #1d232b;
  border-radius: 0;
}

main {
  min-width: 0;
}

@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
</style>