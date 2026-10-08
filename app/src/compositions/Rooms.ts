import { endpoint, receive, respond, type EndpointValidator } from "@mit-sdg/sync-engine/boundary";
import { each, form, former, no, view, where } from "@mit-sdg/sync-engine/language";
import { concepts } from "../concepts.ts";

const { RoomJoining, Sessioning } = concepts;

function strings(...keys: string[]): EndpointValidator {
  return value => {
    const valid =
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      Object.keys(value).length === keys.length &&
      keys.every(key =>
        Object.hasOwn(value, key) &&
        typeof (value as Record<string, unknown>)[key] === "string"
      );

    return valid
      ? { ok: true }
      : { ok: false, detail: `Expected string fields: ${keys.join(", ")}.` };
  };
}

// The cookie adapter supplies null when no session cookie is present.
const sessionInput: EndpointValidator = value => {
  const valid =
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    Object.hasOwn(value, "session") &&
    (
      typeof (value as Record<string, unknown>).session === "string" ||
      (value as Record<string, unknown>).session === null
    );

  return valid
    ? { ok: true }
    : { ok: false, detail: "Expected a session cookie." };
};

const Create = endpoint(
  "/rooms/create",
  ({ name, room, participant, code, session, expiresAt }) =>
    receive({ name })
      .then(RoomJoining.create({ name }).responds({ room, participant, code }))
      .then(Sessioning.start({ subject: participant }).responds({ session, expiresAt }))
      .then(respond({ room, participant, code, session, expiresAt })),
  {
    input: { required: ["name"] },
    validators: { input: strings("name") },
  },
);

const Join = endpoint(
  "/rooms/join",
  ({ code, name, participant, session, expiresAt }) =>
    receive({ code, name })
      .then(RoomJoining.join({ code, name }).responds({ participant }))
      .then(Sessioning.start({ subject: participant }).responds({ session, expiresAt }))
      .then(respond({ participant, session, expiresAt })),
  {
    input: { required: ["code", "name"] },
    validators: { input: strings("code", "name") },
  },
);

const ActiveLobby = view(
  "the active lobby of (participant)",
  ({ participant }, { room, code, host }, _bindings) => where(
    RoomJoining._getParticipant({ participant }).is({ room, active: true }),
    RoomJoining._getRoom({ room }).is({ code, status: "OPEN", host }),
  ),
).optional();

const Members = former(
  "the active room participants",
  ({ room }, { participant, name }) => form({
    participants: each(
      RoomJoining._activeParticipants({ room }).is({ participant, name }),
    ).form({ participant, name }),
  }),
);

const Current = endpoint(
  "/rooms/current",
  ({ session, participant, room, code, host }) =>
    receive({ session })
      .then(Sessioning.current({ session }).responds({ subject: participant }))
      .then(
        where(ActiveLobby({ participant }).is({ room, code, host }))
          .then(respond({
            participant, room, code, host,
            members: Members({ room }),
          }))
          .named("room-open"),

        where(
          RoomJoining._getParticipant({ participant }).is({ room, active: true }),
          no(RoomJoining._getRoom({ room }).is({ status: "OPEN" })),
        )
          .then(respond({ error: "ROOM_NOT_OPEN" }))
          .named("room-unavailable"),

        where(no(RoomJoining._getParticipant({ participant }).is({ active: true })))
          .then(respond({ error: "PARTICIPANT_NOT_ACTIVE" }))
          .named("participant-inactive"),
      ),
  {
    input: { required: ["session"] },
    validators: { input: sessionInput },
  },
);

const Leave = endpoint(
  "/rooms/leave",
  ({ session, participant, ended }) =>
    receive({ session })
      .then(Sessioning.current({ session }).responds({ subject: participant }))
      .then(RoomJoining.leave({ participant }).responds({}))
      .then(Sessioning.end({ session }).responds({ ended }))
      .afterFlowSettles()
      .then(respond({ ended })),
  {
    input: { required: ["session"] },
    validators: { input: sessionInput },
  },
);

export const composition = { Create, Join, ActiveLobby, Members, Current, Leave };