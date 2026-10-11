<script setup lang="ts">
import { computed, ref } from "vue";
import type { TeamsweeperWireHttp } from "../../generated/wire.ts";
import { rankingMetrics, type RankingState } from "../controller.ts";
import { tint, type PlayerColors } from "../colors.ts";

type Lobby = TeamsweeperWireHttp["/rooms/current"]["output"];

const props = defineProps<{
  lobby: Lobby | null;
  currentGame: string | null;
  screen: "lobby" | "game";
  busy: boolean;
  colors: PlayerColors;

}>();

const emit = defineEmits<{
  create: [name: string];
  join: [name: string, code: string];
}>();

const rankings = defineModel<RankingState>("rankings", { required: true });

function resultLabel(row: RankingState["rows"][number]) {
  const category = typeof row.category === "object" ? row.category : null;
  const board = category?.settings;
  const settings = board && typeof board === "object" && !Array.isArray(board)
    ? `${board.width}×${board.height}/${board.mines}` : "Unknown board";
  const units: Record<string, string> = {
    Time: "s",
    "3BV": " 3BV",
    Clicks: " moves",
    "3BV/s": " 3BV/s",
    Efficiency: "%",
  };
  const value = rankings.value.displayedMetric === "Efficiency"
    ? Math.round(row.value * 100)
    : Number(row.value.toFixed(2));
  return `${settings} · ${value}${units[rankings.value.displayedMetric] ?? ""}`;
}

function outcome(row: RankingState["rows"][number]) {
  return typeof row.category === "object" && row.category !== null ? row.category.status : null;
}

function resultClass(row: RankingState["rows"][number]) {
  const won = outcome(row) === "WON";
  return row.item === props.currentGame ? (won ? "current-win" : "current-loss")
    : won ? "past-win" : "past-loss";
}

const pages = computed(() => Math.max(1, Math.ceil(rankings.value.total / 10)));
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

    <p v-if="lobby" class="identity">
      <img class="icon" src="/icons/person.svg" alt="" />
      {{ currentName }} <small>(you)</small>
    </p>

    <fieldset v-else :disabled="busy">
      <legend>Enter a room</legend>

      <form class="entry-row" @submit.prevent="emit('create', name)">
        <label>
          Your name
          <input v-model="name" autocomplete="nickname" />
        </label>
        <button :disabled="!name.trim()">Create</button>
      </form>

      <h2 class="entry-or"><span>—</span><span>OR</span><span>—</span></h2>

      <form class="entry-row" @submit.prevent="emit('join', name, code)">
        <label>
          Room code
          <input v-model="code" required />
        </label>
        <button :disabled="!name.trim() || !code.trim()">Join</button>
      </form>
    </fieldset>

    <section v-if="lobby && screen === 'game'" class="participants">
      <h2>Participants</h2>

      <ul>
        <li
          v-for="player in lobby.members.participants"
          :key="player.participant"
        >
          <span
            class="swatch"
            aria-hidden="true"
            :style="{
              backgroundColor: tint(
                colors[player.participant]
                  ? [colors[player.participant]!]
                  : [],
              ),
            }"
          ></span>
          {{ player.name }}
          <span v-if="player.participant === lobby.participant">(you)</span>
          <span v-if="player.participant === lobby.host">(host)</span>
        </li>
      </ul>
    </section>
    <section v-if="lobby" class="past-results">
      <h2>Past results</h2>
      <div class="ranking-filters">
        <label class="inline-field">
          Rank by
          <select v-model="rankings.metric">
            <option v-for="option in rankingMetrics" :key="option.metric" :value="option.metric">
              {{ option.label }}
            </option>
          </select>
        </label>
        <button class="filter-button" :aria-label="rankings.ascending ? 'Lowest first; switch to highest first' : 'Highest first; switch to lowest first'"
          @click="rankings.ascending = !rankings.ascending">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path :d="rankings.ascending ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'"
              fill="none" stroke="currentColor" stroke-width="2" />
          </svg>
        </button>
        <button class="filter-button" :aria-pressed="rankings.wins" aria-label="Include wins"
          @click="rankings.wins = !rankings.wins">
          <img class="icon" src="/icons/win.svg" alt="" />
        </button>
        <button class="filter-button" :aria-pressed="rankings.losses" aria-label="Include losses"
          @click="rankings.losses = !rankings.losses">
          <img class="icon" src="/icons/loss.svg" alt="" />
        </button>
        <button
          class="filter-button"
          :aria-pressed="rankings.matching"
          aria-label="Match current board settings"
          @click="rankings.matching = !rankings.matching"
        >
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="1"
              fill="none" stroke="currentColor" stroke-width="1.5" />
            <path d="M9 3v18M15 3v18M3 9h18M3 15h18"
              fill="none" stroke="currentColor" stroke-width="1.5" />
          </svg>
        </button>

      </div>
      <p v-if="rankings.error" role="status">{{ rankings.error }}</p>
      <p v-else-if="rankings.loaded && !rankings.rows.length" class="empty-results">No recorded results.</p>
      <ul>
        <li v-for="row in rankings.rows" :key="row.item" :class="resultClass(row)">
          <img
            v-if="typeof row.category === 'object' && row.category !== null &&
              (row.category.status === 'WON' || row.category.status === 'LOST')"
            class="icon"
            :src="`/icons/${row.category.status === 'WON' ? 'win' : 'loss'}.svg`"
            :alt="row.category.status === 'WON' ? 'Win' : 'Loss'"
          />
          #{{ row.rank }} · {{ resultLabel(row) }}
        </li>
      </ul>
      <p class="pagination">
        <button
          aria-label="Previous page"
          :disabled="rankings.loading || rankings.page === 1"
          @click="rankings.page--"
        >←</button>
        {{ rankings.page }} / {{ pages }}
        <button
          aria-label="Next page"
          :disabled="rankings.loading || !rankings.more"
          @click="rankings.page++"
        >→</button>
      </p>
    </section>
  </aside>
</template>

<style scoped>
.swatch {
  display: inline-block;
  width: 0.8rem;
  height: 0.8rem;
  border: 1px solid #555;
  border-radius: 50%;
  margin-right: 0.35rem;
  vertical-align: middle;
}
</style>