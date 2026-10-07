import {
  conceptSet,
  registerConcept,
} from "@mit-sdg/sync-engine/assembly";

import spec from "@design/concepts/RoomJoining.md" with { type: "text" };

import {
  RoomJoiningConcept,
  CreateNameRequired,
  JoinNameRequired,
  RoomUnavailable,
  ParticipantNotActive,
  RoomNotOpen,
  GameAlreadyAssociated,
} from "./concepts/RoomJoining.ts";

const roomJoining = registerConcept({
  class: RoomJoiningConcept,
  spec,
  refusals: {
    CREATE_NAME_REQUIRED: CreateNameRequired,
    JOIN_NAME_REQUIRED: JoinNameRequired,
    ROOM_UNAVAILABLE: RoomUnavailable,
    PARTICIPANT_NOT_ACTIVE: ParticipantNotActive,
    ROOM_NOT_OPEN: RoomNotOpen,
    GAME_ALREADY_ASSOCIATED: GameAlreadyAssociated,
  },
});

export const applicationConceptSet = conceptSet({
  RoomJoining: roomJoining,
});

export const { concepts } = applicationConceptSet;