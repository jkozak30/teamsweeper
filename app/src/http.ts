import { httpPolicy } from "@mit-sdg/sync-engine-http/policy";

export const policy = httpPolicy({
  basePath: "/api",
  publicErrors: {
    CREATE_NAME_REQUIRED: "INVALID_REQUEST",
    JOIN_NAME_REQUIRED: "INVALID_REQUEST",
    ROOM_UNAVAILABLE: "NOT_FOUND",
    PARTICIPANT_NOT_ACTIVE: "FORBIDDEN",
    ROOM_NOT_OPEN: "CONFLICT",
    GAME_ALREADY_ASSOCIATED: "CONFLICT",
  },
});