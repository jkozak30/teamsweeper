import { assemble } from "@mit-sdg/sync-engine/assembly";

import { composition as RoomComposition } from "./compositions/Rooms.ts";
import { composition as gameComposition } from "./compositions/Game.ts";
import { composition as annotationComposition } from "./compositions/Annotations.ts";
import { composition as rankingComposition } from "./compositions/Rankings.ts";
import { MinesweeperPlayingConcept } from "./concepts/MinesweeperPlaying.ts";
import { RoomJoiningConcept } from "./concepts/RoomJoining.ts";
import { SessioningConcept } from "./concepts/Sessioning.ts";
import { AnnotatingConcept } from "./concepts/Annotating.ts";
import { PerformanceRankingConcept } from "./concepts/PerformanceRanking.ts";
import { applicationConceptSet } from "./concepts.ts";
import { db } from "./db.ts";

export function assembleApplication() {
  return assemble({
    conceptSet: applicationConceptSet,
    instances: {
      MinesweeperPlaying: new MinesweeperPlayingConcept(db),
      RoomJoining: new RoomJoiningConcept(db),
      Sessioning: new SessioningConcept(db),
      Annotating: new AnnotatingConcept(db),
      PerformanceRanking: new PerformanceRankingConcept(db),
    },
    composition: {
      Rooms: RoomComposition,
      Game: gameComposition,
      Annotations: annotationComposition,
      Rankings: rankingComposition,
    },
    rawFaultReporter: ({ error }) => console.error(error),
  });
}