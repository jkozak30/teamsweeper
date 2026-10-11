<script setup lang="ts">
import { computed, ref } from "vue";
import type { TeamsweeperWireHttp } from "../../generated/wire.ts";
import { rankingMetrics, type RankingState } from "../controller.ts";
import { tint, type PlayerColors } from "../colors.ts";

type Lobby = TeamsweeperWireHttp["/rooms/current"]["output"];

const props = defineProps<{
  lobby: Lobby | null;
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
    Efficiency: " 3BV/move",
  };
  const value = Number(row.value.toFixed(2));
  return `${category?.status === "WON" ? "✓ Win" : category?.status === "LOST" ? "✗ Loss" : "Result"} · ${settings} · ${value}${units[rankings.value.metric] ?? ""}`;
}

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
    <section v-if="lobby">
      <h2>Past results</h2>
      <label>
        Rank by
        <select v-model="rankings.metric">
          <option v-for="option in rankingMetrics" :key="option.metric" :value="option.metric">
            {{ option.label }}
          </option>
        </select>
      </label>
      <label>
        Order
        <select v-model="rankings.ascending">
          <option :value="true">Lowest first</option>
          <option :value="false">Highest first</option>
        </select>
      </label>
      <label>
        Outcome
        <select v-model="rankings.status">
          <option value="">Wins and losses</option>
          <option value="WON">Wins</option>
          <option value="LOST">Losses</option>
        </select>
      </label>
      <label><input v-model="rankings.matching" type="checkbox" /> Match board settings</label>
      <p v-if="rankings.loading" role="status">Loading rankings…</p>
      <p v-else-if="rankings.error" role="status">{{ rankings.error }}</p>
      <p v-else-if="!rankings.rows.length">No recorded results{{ rankings.matching ? ' for these settings' : '' }}.</p>
      <ul>
        <li v-for="row in rankings.rows" :key="row.item">
          #{{ row.rank }} · {{ resultLabel(row) }}
        </li>
      </ul>
      <p>
        <button :disabled="rankings.loading || rankings.page === 1" @click="rankings.page--">Previous</button>
        Page {{ rankings.page }}
        <button :disabled="rankings.loading || !rankings.more" @click="rankings.page++">Next</button>
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
}
</style>