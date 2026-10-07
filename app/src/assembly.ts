import { assemble } from "@mit-sdg/sync-engine/assembly";

import { composition } from "./compositions/Rooms.ts";
import { MinesweeperPlayingConcept } from "./concepts/MinesweeperPlaying.ts";
import { RoomJoiningConcept } from "./concepts/RoomJoining.ts";
import { SessioningConcept } from "./concepts/Sessioning.ts";
import { applicationConceptSet } from "./concepts.ts";
import { db } from "./db.ts";

export function assembleApplication() {
  return assemble({
    conceptSet: applicationConceptSet,
    instances: {
      MinesweeperPlaying: new MinesweeperPlayingConcept(db),
      RoomJoining: new RoomJoiningConcept(db),
      Sessioning: new SessioningConcept(db),
    },
    composition: {
      Rooms: composition,
    },
    rawFaultReporter: ({ error }) => console.error(error),
  });
}