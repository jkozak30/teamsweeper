<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import type { TeamsweeperWireHttp } from "../../generated/wire.ts";
import Board from "./Board.vue";
import GameSettings from "./GameSettings.vue";
import type { PlayerColors } from "../colors.ts";

type Snapshot = NonNullable<
  TeamsweeperWireHttp["/game/current"]["output"]["snapshot"]
>;
type Coordinate = Snapshot["cells"][number]["coord"];
type Settings = TeamsweeperWireHttp["/game/start"]["input"]["settings"];

const props = defineProps<{
  snapshot: Snapshot;
  isHost: boolean;
  busy: boolean;
  boardBusy: boolean;
  pendingCells: string[];
  participant: string;
  players: { participant: string; name: string }[];
  colors: PlayerColors;
}>();

const settings = defineModel<Settings>("settings", {
  required: true,
});

const emit = defineEmits<{
  reveal: [coord: Coordinate];
  flag: [coord: Coordinate, value: boolean];
  chord: [coord: Coordinate];
  highlight: [coord: Coordinate];
  paint: [coords: Coordinate[]];
  clear: [];
  start: [];
  lobby: [];
  leave: [];
}>();

const finished = computed(() =>
  props.snapshot.status === "WON" ||
  props.snapshot.status === "LOST"
);

const result = computed(() => props.snapshot.results[0]);
const pressing = ref(false);
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval>;
onMounted(() => {
  timer = setInterval(() => { now.value = Date.now(); }, 250);
  // Cache every board state before a move needs to swap its image.
  const graphics = ["closed", "pressed", "closed_flag", "mine", "mine_red", "mine_wrong",
    ...Array.from({ length: 9 }, (_, i) => `type${i}`),
    ...Array.from({ length: 10 }, (_, i) => `d${i}`), "d-",
    ...["unpressed", "pressed", "surprised", "win", "lose"].map(value => `face_${value}`)];
  for (const name of graphics) new Image().src = `/skins/hd/${name}.svg`;
});
onUnmounted(() => clearInterval(timer));

const elapsed = computed(() => {
  const { startedAt, endedAt } = props.snapshot;
  if (!startedAt) return 0;
  const end = endedAt ? new Date(endedAt).getTime() : now.value;
  return Math.max(0, Math.floor((end - new Date(startedAt).getTime()) / 1000));
});
const face = computed(() => props.snapshot.status === "WON" ? "win"
  : props.snapshot.status === "LOST" ? "lose"
  : pressing.value ? "surprised" : "unpressed");

function digits(value: number) {
  const clamped = Math.max(-99, Math.min(999, Math.trunc(value)));
  return clamped < 0 ? `-${String(-clamped).padStart(2, "0")}`
    : String(clamped).padStart(3, "0");
}

function startFromBar(event: MouseEvent) {
  if (!props.isHost || props.busy) return;
  if ((event.target as Element).closest("button")) return;

  (document.getElementById("new-game") as HTMLFormElement | null)
    ?.requestSubmit();
}

function openSettings(event: Event) {
  (event.currentTarget as HTMLDetailsElement).open = true;
}
</script>

<template>
  <section>
    <h2>Game: {{ snapshot.status }}</h2>

    <p>
      Click to reveal. Right-click or Shift-click to flag.
      Click a revealed number to chord.
      Middle-click to toggle your highlight, or hold the middle button
      and drag across cells to highlight them.
      Left-click or right-click clears your highlights before making a move.
    </p>

    <div class="board-container">
      <div class="game-frame">
        <div class="status-bar" @click="startFromBar">
          <div class="counter" role="img" :aria-label="`${snapshot.flagsRemaining} flags remaining`">
            <img v-for="(digit, index) in digits(snapshot.flagsRemaining)" :key="index"
              :src="`/skins/hd/d${digit}.svg`" alt="" draggable="false" />
          </div>
          <button class="face" type="submit" form="new-game"
            :disabled="!isHost || busy" :aria-label="isHost ? 'Start new game' : 'Only the host can start a new game'">
            <img :src="`/skins/hd/face_${face}.svg`" alt="" draggable="false" />
          </button>
          <div class="counter" role="img" :aria-label="`${elapsed} seconds elapsed`">
            <img v-for="(digit, index) in digits(elapsed)" :key="index"
              :src="`/skins/hd/d${digit}.svg`" alt="" draggable="false" />
          </div>
        </div>
      <Board
        :width="snapshot.settings.width"
        :cells="snapshot.cells"
        :busy="boardBusy"
        :pending-cells="pendingCells"
        :finished="finished"
        :participant="participant"
        :players="players"
        :colors="colors"
        :lost="snapshot.status === 'LOST'"
        :won="snapshot.status === 'WON'"
        @pressing="pressing = $event"
        @highlight="emit('highlight', $event)"
        @paint="emit('paint', $event)"
        @clear="emit('clear')"
        @reveal="emit('reveal', $event)"
        @flag="(coord, value) => emit('flag', coord, value)"
        @chord="emit('chord', $event)"
      />
      </div>
    </div>

    <section v-if="result">
      <h3>Results</h3>

      <dl>
        <dt>Time</dt>
        <dd>{{ result.time.toFixed(2) }} seconds</dd>

        <dt>3BV</dt>
        <dd>{{ result.bv }}</dd>

        <dt>Moves</dt>
        <dd>{{ result.clicks }}</dd>

        <dt>Speed</dt>
        <dd>{{ result.speed.toFixed(2) }} 3BV units/second</dd>

        <dt>Efficiency</dt>
        <dd>{{ result.efficiency.toFixed(2) }} 3BV units/move</dd>
      </dl>
    </section>

    <form id="new-game" v-if="isHost" @submit.prevent="emit('start')">
      <details v-if="finished" @invalid.capture="openSettings">
        <summary>Adjust settings</summary>

        <GameSettings
          v-model:settings="settings"
          :busy="busy"
        />
      </details>

      <button :disabled="busy">Start new game</button>
    </form>

    <button :disabled="busy" @click="emit('lobby')">
      Return to lobby
    </button>

    <button :disabled="busy" @click="emit('leave')">
      Leave room
    </button>
  </section>
</template>

<style scoped>
.board-container { overflow-x: auto; padding-bottom: 0.5rem; }
.game-frame {
  width: max-content;
  min-width: 194px;
  padding: 10px;
  background: #c6c6c6;
  border: 4px solid;
  border-color: #fff #808080 #808080 #fff;
}
.status-bar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 4px;
  padding: 6px;
  margin-bottom: 10px;
  background: #c0c0c0;
  border: 4px solid;
  border-color: #808080 #fff #fff #808080;
}
.counter {
  display: flex;
  padding: 3px;
  gap: 3px;
  background: url('/skins/hd/nums_background.svg') center / 100% 100% no-repeat;
}
.counter img {
  display: block;
  flex-shrink: 0;
  width: 16.5px;
  height: 31.5px;
}
.counter:first-child { justify-self: start; }
.counter:last-child { justify-self: end; }
.face { padding: 0; border: 0; background: transparent; width: 39px; height: 39px; }
.face img { display: block; width: 100%; height: 100%; }
.face:disabled { opacity: 1; cursor: default; }
.face:enabled { cursor: pointer; }
.face:enabled:active img { content: url('/skins/hd/face_pressed.svg'); }
</style>
