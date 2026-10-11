import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { createHttpClient } from "@mit-sdg/sync-engine-http/client";
import type { ClientCallOptions } from "@mit-sdg/sync-engine/client";
import type { TeamsweeperWireHttp } from "../generated/wire.ts";
import { createActionQueue } from "./action-queue.ts";
import { applyBoard, applyAnnotations, type AnnotationCache } from "./sync.ts";
import { playerColors } from "./colors.ts";

type Lobby = TeamsweeperWireHttp["/rooms/current"]["output"];
type Game = TeamsweeperWireHttp["/game/current"]["output"];
type Snapshot = NonNullable<Game["snapshot"]>;
type Cell = Snapshot["cells"][number];
type Coordinate = Cell["coord"];

export const rankingMetrics = [
  { metric: "Time", label: "Time (seconds)", field: "time", ascending: true },
  { metric: "3BV", label: "3BV", field: "bv", ascending: false },
  { metric: "Clicks", label: "Moves", field: "clicks", ascending: true },
  { metric: "3BV/s", label: "Speed (3BV/s)", field: "speed", ascending: false },
  { metric: "Efficiency", label: "Efficiency (%)", field: "efficiency", ascending: false },
] as const;

export interface RankingState {
  metric: string;
  ascending: boolean;
  matching: boolean;
  wins: boolean;
  losses: boolean;
  total: number;
  page: number;
  rows: TeamsweeperWireHttp["/rankings/rank"]["output"]["ranking"]["results"];
  displayedMetric: string;
  more: boolean;
  loading: boolean;
  refreshing: boolean;
  loaded: boolean;
  error: string;
}

export function useTeamsweeperController() {
  const api = createHttpClient<TeamsweeperWireHttp>({
    baseUrl: "/api",
  });

  const screen = ref<"lobby" | "game">("lobby");
  const lobby = ref<Lobby | null>(null);
  const gameState = ref<Game | null>(null);
  const settings = ref({ height: 9, width: 9, mines: 10 });
  const status = ref("");

  const rankings = ref<RankingState>({
    metric: "Time", ascending: true, matching: true, wins: true, losses: false, total: 0, page: 1,
    rows: [], displayedMetric: "Time", more: false, loading: false, refreshing: false, loaded: false, error: "",
  });
  let rankingRequest = 0;
  let lastRankingRead = 0;
  let savedGame = "";

  const busy = ref(true);
  const boardPending = ref(false);
  const pendingCell = ref<string | null>(null);
  const pendingCells = ref<string[]>([]);
  const queuedActions = ref(0);
  const controlsPending = computed(() => boardPending.value || queuedActions.value > 0);
  const syncProblem = ref(false);
  const lastSynced = ref(0);
  const clock = ref(Date.now());

  const isHost = computed(() =>
    !!lobby.value &&
    lobby.value.participant === lobby.value.host
  );

  const finished = computed(() =>
    ["WON", "LOST"].includes(gameState.value?.snapshot?.status ?? "")
  );

  const colors = computed(() => playerColors(
    lobby.value?.members.participants.map(player => player.participant) ?? [],
    lobby.value?.room ?? "",
  ));

  const delayed = computed(() =>
    !!lobby.value &&
    (syncProblem.value || clock.value - lastSynced.value > 3000)
  );

  const key = (coord: Coordinate) =>
    `${coord.row},${coord.column}`;

  let boardRevision = -1;
  let annotationCursors: Record<string, string> = {};
  const annotationCache: AnnotationCache = new Map();

  let revision = 0;
  let pendingRead: Promise<void> | null = null;
  let readController: AbortController | null = null;
  let actionController: AbortController | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  let disposed = false;

  const queue = createActionQueue(
    () => !disposed && !busy.value && !syncProblem.value && !!lobby.value,
    pending => {
      queuedActions.value = pending.length;
      pendingCells.value = pending.filter((cell): cell is string => cell !== null);
    },
  );

  function enqueue(operation: () => Promise<unknown> | undefined, coord?: Coordinate) {
    const game = gameState.value?.game;
    const result = queue.enqueue(async () => {
      if (gameState.value?.game !== game) {
        status.value = "Queued moves were discarded because the game changed.";
        return;
      }
      return operation();
    }, coord ? key(coord) : null);
    if (!result) status.value = "Waiting to reconnect, or too many moves are already queued.";
    return result;
  }

  function move(kind: "reveal" | "flag" | "chord", coord: Coordinate, value = false) {
    return enqueue(() => performMove(kind, coord, value), kind === "flag" ? undefined : coord);
  }

  function toggleHighlight(coord: Coordinate) {
    return enqueue(() => performToggleHighlight(coord));
  }

  function paintHighlights(coords: Coordinate[]) {
    return enqueue(() => performPaintHighlights(coords));
  }

  function clearHighlights() {
    return enqueue(() => performClearHighlights());
  }

  function clearRoom() {
    rankingRequest++;
    savedGame = "";
    rankings.value.rows = [];
    rankings.value.total = 0;
    rankings.value.more = rankings.value.loading = rankings.value.refreshing = false;
    rankings.value.error = "";
    rankings.value.loaded = false;
    rankings.value.page = 1;
    boardRevision = -1;
    annotationCursors = {};
    annotationCache.clear();
    lobby.value = null;
    gameState.value = null;
    screen.value = "lobby";
    syncProblem.value = false;
  }

  function report(error: string) {
    const messages: Record<string, string> = {
      INVALID_REQUEST: "Check your name, room code, board settings, or selected cell.",
      NOT_FOUND: "Room, game, or highlight not found.",
      FORBIDDEN: "You do not have permission to do that.",
      CONFLICT: "That action is unavailable, or the current game has changed.",
      UNAUTHORIZED: "Your session has expired. Please join again.",
      ABORTED: "The request took too long. Checking the server for its result.",
      TIMED_OUT: "The request took too long. Checking the server for its result.",
      NETWORK_ERROR: "Could not reach the server. Retrying updates automatically.",
    };

    status.value = messages[error] ?? `Request failed: ${error}`;
    if (error === "UNAUTHORIZED") clearRoom();
  }

  function check(result: object) {
    if ("error" in result) {
      throw new Error(String(result.error));
    }
  }

  async function refreshRankings() {
    const room = lobby.value?.room;
    if (!room || disposed) return;
    const request = ++rankingRequest;
    const state = rankings.value;
    const metric = state.metric;
    if (!state.wins && !state.losses) {
      state.rows = [];
      state.total = 0;
      state.more = state.loading = state.refreshing = false;
      state.loaded = true;
      state.error = "";
      return;
    }
    const outcome = state.wins === state.losses ? "" : state.wins ? "WON" : "LOST";
    state.refreshing = true;
    state.loading = !state.loaded;
    state.error = "";
    lastRankingRead = Date.now();
    try {
      const result = await api.rankings.rank({
        metric, ascending: state.ascending,
        ...(state.matching || outcome ? { category: {
          ...(state.matching ? { settings: { ...(gameState.value?.snapshot?.settings ?? settings.value) } } : {}),
          ...(outcome ? { status: outcome } : {}),
        } } : {}),
        from: (state.page - 1) * 10 + 1, to: state.page * 10,
      }, { timeoutMs: 2500 });
      if (disposed || request !== rankingRequest || lobby.value?.room !== room) return;
      check(result);
      if ("error" in result) return;
      state.displayedMetric = metric;
      state.rows = result.ranking.results.slice(0, 10);
      state.loaded = true;
      state.rows = result.ranking.results.slice(0, 10);
      state.total = result.ranking.total;
      state.more = state.page * 10 < state.total;
      const lastPage = Math.max(1, Math.ceil(state.total / 10));
      if (state.page > lastPage) state.page = lastPage;
    } catch {
      if (!disposed && request === rankingRequest && lobby.value?.room === room) {
        state.error = "Could not load rankings. Retry or wait for the next refresh.";
      }
    } finally {
      if (request === rankingRequest) state.loading = state.refreshing = false;
    }
  }

  watch(() => rankings.value.metric, metric => {
    rankings.value.ascending = rankingMetrics.find(value => value.metric === metric)?.ascending ?? true;
  }, { flush: "sync" });
  watch([
    () => lobby.value?.room,
    () => rankings.value.metric,
    () => rankings.value.ascending,
    () => rankings.value.wins,
    () => rankings.value.losses,
    () => rankings.value.matching,
    () => rankings.value.matching
      ? JSON.stringify(gameState.value?.snapshot?.settings ?? settings.value)
      : "",
  ], (next, previous) => {
    // Clear old results only when changing rooms.
    if (next[0] !== previous[0]) {
      rankings.value.rows = [];
      rankings.value.total = 0;
      rankings.value.loaded = false;
      rankings.value.more = false;
    }

    if (rankings.value.page !== 1) rankings.value.page = 1;
    else void refreshRankings();
  });

  watch(() => rankings.value.page, () => {
    void refreshRankings();
  });

  function refreshState(
    scope: "full" | "game" = "full",
  ): Promise<void> {
    if (pendingRead) return pendingRead;

    const version = revision;
    const controller = new AbortController();
    readController = controller;

    const options = {
      signal: controller.signal,
      timeoutMs: 2500,
    };

    const obsolete = () => disposed || version !== revision;

    pendingRead = (async () => {
      let nextRoom = lobby.value;
      if (scope === "full") {
        const room = await api.rooms.current({}, options);
        if (obsolete()) return;

        if ("error" in room) {
          if (["UNAUTHORIZED", "FORBIDDEN", "CONFLICT"].includes(room.error)) {
            if (lobby.value) {
              status.value = "Your room session is no longer available.";
            }
            clearRoom();
            return;
          }

          check(room);
          return;
        }

        nextRoom = room;
      }

      if (!nextRoom) return;

      const knownGame = gameState.value?.game ?? "";
      const game = await api.game.updates({
        game: knownGame, since: boardRevision, cursors: annotationCursors,
      }, options);
      if (obsolete()) return;

      if ("error" in game) {
        if (["UNAUTHORIZED", "FORBIDDEN", "CONFLICT"].includes(game.error)) {
          report(game.error);
          clearRoom();
          return;
        }

        check(game);
        return;
      }

      if (!game.changes || !game.game) {
        gameState.value = { game: null, snapshot: null };
        boardRevision = -1;
        annotationCursors = {};
        annotationCache.clear();
      } else {
        const changedGame = game.game !== knownGame;
        const update = game.changes.update;
        if (!changedGame && boardRevision >= 0 && update.revision < boardRevision) return;
        if (changedGame) {
          annotationCursors = {};
          annotationCache.clear();
          settings.value = { ...update.settings };
          screen.value = "game";
        }
        try {
          const board = applyBoard(gameState.value, game.game, update);
          gameState.value = applyAnnotations(board, game.changes.annotations, annotationCache);
          boardRevision = update.revision;
          annotationCursors = Object.fromEntries(
            game.changes.annotations.map(({ participant, cursor }) => [participant, cursor]),
          );
        } catch (error) {
          boardRevision = -1;
          annotationCursors = {};
          annotationCache.clear();
          throw error;
        }
      }
      // Publish the room after its game state is ready.
      lobby.value = nextRoom;
      // Read saved completed games once; if recording is still pending, the next poll retries.
      if (gameState.value?.game && ["WON", "LOST"].includes(gameState.value.snapshot?.status ?? "") && savedGame !== gameState.value.game) {
        const item = gameState.value.game;
        try {
          const saved = await api.rankings.result({ item }, options);
          if (obsolete() || gameState.value?.game !== item) return;
          if (!("error" in saved)) {
            const values = new Map(saved.result.measurements.map(value => [value.metric, value.value]));
            const result = Object.fromEntries(rankingMetrics.map(value => [value.field, values.get(value.metric)]));
            if (rankingMetrics.every(value => Number.isFinite(result[value.field]))) {
              updateSnapshot(snapshot => ({ ...snapshot, results: [result as Snapshot["results"][number]] }));
              savedGame = item;
              void refreshRankings();
            }
          }
        } catch { /* Keep confirmed statistics if the saved read fails. */ }
      }
      if (obsolete()) return;
      lastSynced.value = Date.now();
      clock.value = Date.now();
      syncProblem.value = false;
    })().finally(() => {
      pendingRead = null;
      if (readController === controller) readController = null;
    });

    return pendingRead;
  }

  function updateSnapshot(edit: (snapshot: Snapshot) => Snapshot) {
    const state = gameState.value;

    if (state?.snapshot) {
      gameState.value = {
        ...state,
        snapshot: edit(state.snapshot),
      };
    }
  }

  function clearLocalHighlights(cell: Cell): Cell {
    return {
      ...cell,
      highlights: cell.highlights.filter(
        value => value.participant !== lobby.value?.participant,
      ),
    };
  }

  async function run(
    mode: "room" | "board",
    operation: (options: ClientCallOptions) => Promise<void | boolean>,
    optimistic?: () => void,
    coord?: Coordinate,
  ) {
    if (busy.value || boardPending.value || disposed) return;

    if (mode === "board" && syncProblem.value) {
      status.value = "Waiting to reconnect before accepting another move.";
      return;
    }

    const before = gameState.value;
    let confirmedBoard = false;

    if (mode === "room") busy.value = true;
    else boardPending.value = true;

    pendingCell.value = coord ? key(coord) : null;
    status.value = "";

    // Older reads cannot overwrite this action's local feedback.
    revision++;
    readController?.abort();
    optimistic?.();

    const controller = new AbortController();
    actionController = controller;
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      if (pendingRead) await pendingRead.catch(() => {});
      if (disposed) return;

      confirmedBoard = await operation({ signal: controller.signal }) === true;
    } catch (error) {
      if (!disposed) {
        if (lobby.value && gameState.value?.game === before?.game) {
          gameState.value = before;
        }

        if (!(error instanceof Error && error.message === "QUIET_MOVE")) {
          report(error instanceof Error ? error.message : "NETWORK_ERROR");
        }
      }
    } finally {
      clearTimeout(timeout);
      if (actionController === controller) actionController = null;

      revision++;

      if (!disposed) {
        try {
          if (!confirmedBoard) await refreshState(mode === "board" ? "game" : "full");
          else {
            lastSynced.value = Date.now();
            clock.value = Date.now();
            syncProblem.value = false;
          }
        } catch {
          boardRevision = -1;
          syncProblem.value = true;
          status.value =
            "Could not confirm the latest state. Reconnecting automatically.";
        }
      }

      pendingCell.value = null;
      busy.value = false;
      boardPending.value = false;
    }
  }

  async function createRoom(name: string) {
    let created = false;

    await run("room", async options => {
      check(await api.rooms.create({ name: name.trim() }, options));
      created = true;
    });

    if (created && lobby.value && !syncProblem.value) {
      status.value = "Room created. Share the code with another player.";
    }
  }

  async function joinRoom(name: string, code: string) {
    let joined = false;

    await run("room", async options => {
      check(await api.rooms.join({
        name: name.trim(),
        code: code.trim().toUpperCase(),
      }, options));
      joined = true;
    });

    if (joined && lobby.value && !syncProblem.value) {
      status.value = "Joined the room.";
    }
  }

  function leaveRoom() {
    return enqueue(() => run("room", async options => {
      const result = await api.rooms.leave({}, options);

      if (!("error" in result && result.error === "UNAUTHORIZED")) {
        check(result);
      }

      clearRoom();
      status.value = "You have left the room.";
    }));
  }

  function startGame() {
    return enqueue(() => run("room", async options => {
      if (!lobby.value || !isHost.value) return;

      check(await api.game.start({
        room: lobby.value.room,
        settings: { ...settings.value },
      }, options));

      screen.value = "game";
    }));
  }

  function performMove(
    kind: "reveal" | "flag" | "chord",
    coord: Coordinate,
    value = false,
  ) {
    const game = gameState.value?.game;
    if (!game) return;

    const canMove = !finished.value;

    return run("board", async options => {
      check(await api.annotations.clear({ game }, options));
      if (!canMove) return;

      const since = Math.max(0, boardRevision);
      const result = kind === "flag"
        ? await api.game.flag({ game, coord, value, since }, options)
        : kind === "reveal"
        ? await api.game.reveal({ game, coord, since }, options)
        : await api.game.chord({ game, coord, since }, options);
      if ("error" in result && result.error === "CONFLICT") throw new Error("QUIET_MOVE");
      check(result);
      if ("error" in result) return;
      const update = result.changes.update;
      if (boardRevision >= 0 && update.revision < boardRevision) return;
      gameState.value = applyBoard(gameState.value, game, update);
      boardRevision = update.revision;
      return true;
    }, () => updateSnapshot(snapshot => {
      let flagsRemaining = snapshot.flagsRemaining;

      const cells = snapshot.cells.map(cell => {
        const cleared = clearLocalHighlights(cell);

        if (
          kind !== "flag" ||
          !canMove ||
          key(cell.coord) !== key(coord)
        ) {
          return cleared;
        }

        flagsRemaining += Number(cell.flagged) - Number(value);
        return { ...cleared, flagged: value };
      });

      return {
        ...snapshot,
        cells,
        flagsRemaining,
        clicks: snapshot.clicks + (kind === "flag" && canMove ? 1 : 0),
      };
    }), kind === "flag" ? undefined : coord);
  }

  function performToggleHighlight(coord: Coordinate) {
    const state = gameState.value;
    const participant = lobby.value?.participant;

    if (!state?.game || !state.snapshot || !participant) return;

    const cell = state.snapshot.cells.find(
      cell => key(cell.coord) === key(coord),
    );
    if (!cell) return;

    const game = state.game;
    const removing = cell.highlights.some(
      value => value.participant === participant,
    );

    return run("board", async options => {
      check(removing
        ? await api.annotations.remove({ game, coord }, options)
        : await api.annotations.highlight({ game, coord }, options));
    }, () => updateSnapshot(snapshot => ({
      ...snapshot,
      cells: snapshot.cells.map(cell =>
        key(cell.coord) !== key(coord)
          ? cell
          : {
            ...cell,
            highlights: removing
              ? clearLocalHighlights(cell).highlights
              : [...cell.highlights, { participant }],
          }
      ),
    })));
  }

  function performPaintHighlights(coords: Coordinate[]) {
    const state = gameState.value;
    const participant = lobby.value?.participant;

    if (!state?.game || !state.snapshot || !participant) return;

    const game = state.game;
    const existing = new Set(
      state.snapshot.cells
        .filter(cell =>
          cell.highlights.some(
            value => value.participant === participant,
          )
        )
        .map(cell => key(cell.coord)),
    );

    const selected = new Map(coords.map(coord => [key(coord), coord]));
    const additions = [...selected.values()].filter(
      coord => !existing.has(key(coord)),
    );

    if (!additions.length) return;

    return run("board", async options => {
      for (const coord of additions) {
        check(await api.annotations.highlight({ game, coord }, options));
      }
    }, () => updateSnapshot(snapshot => ({
      ...snapshot,
      cells: snapshot.cells.map(cell =>
        selected.has(key(cell.coord)) && !existing.has(key(cell.coord))
          ? {
            ...cell,
            highlights: [...cell.highlights, { participant }],
          }
          : cell
      ),
    })));
  }

  function performClearHighlights() {
    const game = gameState.value?.game;
    if (!game) return;

    return run("board", async options => {
      check(await api.annotations.clear({ game }, options));
    }, () => updateSnapshot(snapshot => ({
      ...snapshot,
      cells: snapshot.cells.map(clearLocalHighlights),
    })));
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

  function poll() {
    clock.value = Date.now();
    if (lobby.value && !rankings.value.refreshing && clock.value - lastRankingRead >= 5000) {
      void refreshRankings();
    }

    if (
      !busy.value &&
      !controlsPending.value &&
      (lobby.value || syncProblem.value)
    ) {
      void refreshState().catch(() => {
        if (!disposed) syncProblem.value = true;
      });
    }
  }

  onMounted(async () => {
    try {
      await refreshState();
    } catch {
      syncProblem.value = true;
      status.value = "Could not reach the server. Retrying automatically.";
    } finally {
      busy.value = false;
    }

    if (disposed) return;

    timer = setInterval(poll, 500);
    window.addEventListener("focus", poll);
    document.addEventListener("visibilitychange", poll);
  });

  onUnmounted(() => {
    disposed = true;
    readController?.abort();
    actionController?.abort();

    if (timer !== undefined) clearInterval(timer);
    window.removeEventListener("focus", poll);
    document.removeEventListener("visibilitychange", poll);
  });

  return {
    rankings,
    screen,
    lobby,
    gameState,
    settings,
    status,
    busy,
    boardPending,
    pendingCell,
    pendingCells,
    controlsPending,
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
  };
}