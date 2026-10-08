import { endpoint, receive, respond, type EndpointValidator } from "@mit-sdg/sync-engine/boundary";
import { compute, each, former, no, reaction, view, when, where } from "@mit-sdg/sync-engine/language";
import { concepts, computations } from "../concepts.ts";
import { composition as Rooms } from "./Rooms.ts";

const { Annotating, MinesweeperPlaying, RoomJoining, Sessioning } = concepts;
const { ActiveLobby } = Rooms;

function input(kind: "highlight" | "remove" | "clear"): EndpointValidator {
  return value => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return { ok: false, detail: "Expected annotation request fields." };
    }

    const body = value as Record<string, unknown>;
    const keys = kind === "clear" ? ["session", "game"] : ["session", "game", "coord"];
    const coord = body.coord as Record<string, unknown> | null;

    const valid =
      Object.keys(body).length === keys.length &&
      keys.every(key => Object.hasOwn(body, key)) &&
      (body.session === null || typeof body.session === "string") &&
      typeof body.game === "string" &&
      (kind === "clear" || (
        typeof coord === "object" &&
        coord !== null &&
        !Array.isArray(coord) &&
        Object.keys(coord).length === 2 &&
        typeof coord.row === "number" &&
        Number.isFinite(coord.row) &&
        typeof coord.column === "number" &&
        Number.isFinite(coord.column)
      ));

    return valid
      ? { ok: true }
      : { ok: false, detail: "Expected annotation request fields." };
  };
}

const MayAnnotate = view(
  "whether (participant) may annotate (game)",
  ({ participant, game }, _outputs, { room }) => where(
    ActiveLobby({ participant }).is({ room }),
    RoomJoining._getRoom({ room }).is({ currentGame: game }),
  ),
).holds();

const Cell = view(
  "the cell identity in (game) at (coord)",
  ({ game, coord }, { item }, _bindings) => where(
    MinesweeperPlaying._visibleCells({ game }).is({ coord }),
    compute(computations.gameCell, { game, coord }, item),
  ),
).optional();

export const CellHighlights = former(
  "the cell highlighters",
  ({ game, coord }, { item, author }) => where(
    compute(computations.gameCell, { game, coord }, item),
  ).form({
    highlights: each(Annotating._forItem({ item }).is({ author })).form({ participant: author }),
  }),
);

function edit(kind: "highlight" | "remove" | "clear") {
  return endpoint(
    `/annotations/${kind}`,
    ({ session, game, coord, participant, item }) => {
      const fields = kind === "clear" ? { session, game } : { session, game, coord };

      const action = kind === "highlight"
        ? Annotating.highlight({ user: participant, item })
        : kind === "remove"
        ? Annotating.remove({ user: participant, item })
        : Annotating.clear({ user: participant });

      const allowed = kind === "clear"
        ? where(MayAnnotate({ participant, game }))
        : where(
          MayAnnotate({ participant, game }),
          Cell({ game, coord }).is({ item }),
        );

      const invalidCell = kind === "clear" ? [] : [
        where(
          MayAnnotate({ participant, game }),
          no(Cell({ game, coord })),
        )
          .then(respond({ error: "INVALID_COORDINATE" }))
          .named("invalid-cell"),
      ];

      return receive(fields)
        .then(Sessioning.current({ session }).responds({ subject: participant }))
        .then(
          allowed
            .then(action.responds({}))
            .then(respond({}))
            .named("member-edits"),

          where(
            ActiveLobby({ participant }),
            no(MayAnnotate({ participant, game })),
          )
            .then(respond({ error: "GAME_NOT_CURRENT" }))
            .named("wrong-game"),

          where(
            no(RoomJoining._getParticipant({ participant }).is({ active: true })),
          )
            .then(respond({ error: "PARTICIPANT_NOT_ACTIVE" }))
            .named("inactive"),

          where(
            RoomJoining._getParticipant({ participant }).is({ active: true }),
            no(ActiveLobby({ participant })),
          )
            .then(respond({ error: "ROOM_NOT_OPEN" }))
            .named("room-unavailable"),

          ...invalidCell,
        );
    },
    {
      input: {
        required: kind === "clear"
          ? ["session", "game"]
          : ["session", "game", "coord"],
      },
      validators: { input: input(kind) },
    },
  );
}

const Highlight = edit("highlight");
const Remove = edit("remove");
const Clear = edit("clear");

const ClearOnLeave = reaction(({ participant }) =>
  when(RoomJoining.leave({ participant }).responds({}))
    .then(Annotating.clear({ user: participant }).responds({})),
);

export const composition = {
  MayAnnotate,
  Cell,
  CellHighlights,
  Highlight,
  Remove,
  Clear,
  ClearOnLeave,
};