import type { Db } from "mongodb";
import { assemble } from "@mit-sdg/sync-engine/assembly";
import { createGateway } from "@mit-sdg/sync-engine/boundary";
import { createHttpHandler } from "@mit-sdg/sync-engine-http/handler";
import { applicationConceptSet } from "../src/concepts.ts";
import { composition as Rooms } from "../src/compositions/Rooms.ts";
import { composition as Game } from "../src/compositions/Game.ts";
import { composition as Annotations } from "../src/compositions/Annotations.ts";
import { RoomJoiningConcept } from "../src/concepts/RoomJoining.ts";
import { SessioningConcept } from "../src/concepts/Sessioning.ts";
import { MinesweeperPlayingConcept } from "../src/concepts/MinesweeperPlaying.ts";
import { AnnotatingConcept } from "../src/concepts/Annotating.ts";
import { policy } from "../src/http.ts";

export function createTestApp(db: Db, clock: () => Date = () => new Date()) {
  const rooms = new RoomJoiningConcept(db);

  const application = assemble({
    conceptSet: applicationConceptSet,
    instances: {
      RoomJoining: rooms,
      Sessioning: new SessioningConcept(db, clock),
      MinesweeperPlaying: new MinesweeperPlayingConcept(db),
      Annotating: new AnnotatingConcept(db),
    },
    composition: { Rooms, Game, Annotations },
    rawFaultReporter: ({ error }) => console.error(error),
  });

  const api = createHttpHandler({
    application,
    gateway: createGateway({ application }),
    policy,
  });

  return { api, rooms };
}