import {
  endpoint,
  receive,
  respond,
} from "@mit-sdg/sync-engine/boundary";

import { concepts } from "../concepts.ts";

const { RoomJoining } = concepts;

const Create = endpoint(
  "/rooms/create",
  ({ name, room, participant, code }) =>
    receive({ name })
      .then(
        RoomJoining.create({ name }).responds({
          room,
          participant,
          code,
        }),
      )
      .then(respond({ room, participant, code })),
  { input: { required: ["name"] } },
);

const Join = endpoint(
  "/rooms/join",
  ({ code, name, participant }) =>
    receive({ code, name })
      .then(
        RoomJoining.join({ code, name }).responds({
          participant,
        }),
      )
      .then(respond({ participant })),
  { input: { required: ["code", "name"] } },
);

export const composition = {
  Create,
  Join,
};