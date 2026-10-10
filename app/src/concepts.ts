import {
  conceptSet,
  registerConcept,
} from "@mit-sdg/sync-engine/assembly";

import roomSpec from "@design/concepts/RoomJoining.md" with { type: "text" };
import sessionSpec from "@design/concepts/Sessioning.md" with { type: "text" };
import playingSpec from "@design/concepts/MinesweeperPlaying.md" with { type: "text" };
import annotatingSpec from "@design/concepts/Annotating.md" with { type: "text" };
import rankingSpec from "@design/concepts/PerformanceRanking.md" with { type: "text" };

import {
  RoomJoiningConcept,
  CreateNameRequired,
  JoinNameRequired,
  RoomUnavailable,
  ParticipantNotActive,
  RoomNotOpen,
  GameAlreadyAssociated,
} from "./concepts/RoomJoining.ts";

import {
  SessioningConcept,
  UnknownSession,
  EndSessionNotActive,
} from "./concepts/Sessioning.ts";

import {
  MinesweeperPlayingConcept,
  InvalidSettings,
  GameNotFound,
  MoveNotAllowed,
} from "./concepts/MinesweeperPlaying.ts";

import {
  AnnotatingConcept,
  AlreadyHighlighted,
  HighlightNotFound,
} from "./concepts/Annotating.ts";

import {
  PerformanceRankingConcept,
  InvalidResult,
  ResultAlreadyRecorded,
} from "./concepts/PerformanceRanking.ts";

const resultMetrics: Record<string, string> = {
  time: "Time",
  bv: "3BV",
  clicks: "Clicks",
  speed: "3BV/s",
  efficiency: "Efficiency",
};

const roomJoining = registerConcept({
  class: RoomJoiningConcept,
  spec: roomSpec,
  refusals: {
    CREATE_NAME_REQUIRED: CreateNameRequired,
    JOIN_NAME_REQUIRED: JoinNameRequired,
    ROOM_UNAVAILABLE: RoomUnavailable,
    PARTICIPANT_NOT_ACTIVE: ParticipantNotActive,
    ROOM_NOT_OPEN: RoomNotOpen,
    GAME_ALREADY_ASSOCIATED: GameAlreadyAssociated,
  },
});

const sessioning = registerConcept({
  class: SessioningConcept,
  spec: sessionSpec,
  refusals: {
    UNKNOWN_SESSION: UnknownSession,
    END_SESSION_NOT_ACTIVE: EndSessionNotActive,
  },
});

const minesweeperPlaying = registerConcept({
  class: MinesweeperPlayingConcept,
  spec: playingSpec,
  refusals: {
    INVALID_SETTINGS: InvalidSettings,
    GAME_NOT_FOUND: GameNotFound,
    MOVE_NOT_ALLOWED: MoveNotAllowed,
  },
});

const annotating = registerConcept({
  class: AnnotatingConcept,
  spec: annotatingSpec,
  refusals: {
    ALREADY_HIGHLIGHTED: AlreadyHighlighted,
    HIGHLIGHT_NOT_FOUND: HighlightNotFound,
  },
});

const performanceRanking = registerConcept({
  class: PerformanceRankingConcept,
  spec: rankingSpec,
  refusals: {
    INVALID_RESULT: InvalidResult,
    RESULT_ALREADY_RECORDED: ResultAlreadyRecorded,
  },
});

export const applicationConceptSet = conceptSet({
  MinesweeperPlaying: minesweeperPlaying,
  RoomJoining: roomJoining,
  Sessioning: sessioning,
  Annotating: annotating,
  PerformanceRanking: performanceRanking,
}, {
  rankingCategory: ({ category }: { category: unknown }) => category ?? undefined,
  resultCategory: ({ settings, status }: {
    settings: { height: number; width: number; mines: number };
    status: string;
  }) => ({ settings, status }),
  resultMeasurements: (result: { time: number; bv: number; clicks: number; speed: number; efficiency: number }) =>
    Object.entries(result).map(([field, value]) => ({
      metric: resultMetrics[field] ?? field,
      value,
    })),
  boardCursors: ({ knownGame, game, cursors }: { knownGame: string; game: string; cursors: Record<string, string> }) =>
    knownGame === game ? cursors : {},
  boardSince: ({ knownGame, game, since }: { knownGame: string; game: string; since: number }) =>
    knownGame === game ? since : -1,
  annotationCursor: ({ cursors, author }: { cursors: Record<string, string>; author: string }) =>
    cursors[author] ?? "",
  gameCell: ({ game, coord }: {
    game: string;
    coord: { row: number; column: number };
  }) => ({
    game,
    coord: { row: coord.row, column: coord.column },
  }),
});

export const { concepts, computations } = applicationConceptSet;