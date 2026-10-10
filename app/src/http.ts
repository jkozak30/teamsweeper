import { httpPolicy } from "@mit-sdg/sync-engine-http/policy";

export const policy = httpPolicy({
  publicOrigin:
    process.env.PUBLIC_ORIGIN ?? "http://127.0.0.1:3000",
  basePath: "/api",
  publicErrors: {
    CREATE_NAME_REQUIRED: "INVALID_REQUEST",
    JOIN_NAME_REQUIRED: "INVALID_REQUEST",
    ROOM_UNAVAILABLE: "NOT_FOUND",
    PARTICIPANT_NOT_ACTIVE: "FORBIDDEN",
    ROOM_NOT_OPEN: "CONFLICT",
    GAME_ALREADY_ASSOCIATED: "CONFLICT",
    UNKNOWN_SESSION: "UNAUTHORIZED",
    END_SESSION_NOT_ACTIVE: "UNAUTHORIZED",
    INVALID_SETTINGS: "INVALID_REQUEST",
    GAME_NOT_FOUND: "NOT_FOUND",
    MOVE_NOT_ALLOWED: "CONFLICT",
    HOST_REQUIRED: "FORBIDDEN",
    GAME_NOT_CURRENT: "CONFLICT",
    ALREADY_HIGHLIGHTED: "CONFLICT",
    HIGHLIGHT_NOT_FOUND: "NOT_FOUND",
    RESULT_NOT_FOUND: "NOT_FOUND",
    INVALID_COORDINATE: "INVALID_REQUEST",
  },
  cookies: {
    session: {
      name: "teamsweeper-session",
      input: "session",
      issue: [
        {
          path: "/rooms/create",
          value: "session",
          expires: "expiresAt",
        },
        {
          path: "/rooms/join",
          value: "session",
          expires: "expiresAt",
        },
      ],
      clear: ["/rooms/leave"],
    },
  },
});