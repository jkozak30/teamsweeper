import { endpoint, receive, respond, type EndpointValidator } from "@mit-sdg/sync-engine/boundary";
import { compute, each, former, no, now, view, where, whether } from "@mit-sdg/sync-engine/language";
import { CellHighlights } from "./Annotations.ts";
import { concepts, computations } from "../concepts.ts";

const { RoomJoining, Sessioning, MinesweeperPlaying } = concepts;

// Validate request shapes; concepts still enforce the game rules.
function input(kind: "start" | "current" | "updates" | "reveal" | "flag" | "chord"): EndpointValidator {
  return value => {
    const object = (item: unknown): item is Record<string, unknown> =>
      typeof item === "object" && item !== null && !Array.isArray(item);

    const numeric = (item: unknown, keys: string[]) =>
      object(item) &&
      Object.keys(item).length === keys.length &&
      keys.every(key =>
        typeof item[key] === "number" && Number.isFinite(item[key])
      );

    const keys = kind === "start"
      ? ["session", "room", "settings"]
      : kind === "current"
      ? ["session"]
      : kind === "updates"
      ? ["session", "game", "since", "cursors"]
      : kind === "flag"
      ? ["session", "game", "coord", "value", "since"]
      : ["session", "game", "coord", "since"];

    const valid =
      object(value) &&
      Object.keys(value).length === keys.length &&
      keys.every(key => Object.hasOwn(value, key)) &&
      (value.session === null || typeof value.session === "string") &&
      (
        kind !== "start" ||
        (
          typeof value.room === "string" &&
          numeric(value.settings, ["height", "width", "mines"])
        )
      ) &&
      (
        kind === "start" ||
        kind === "current" ||
        kind === "updates" ||
        (
          typeof value.game === "string" &&
          numeric(value.coord, ["row", "column"])
        )
      ) &&
      (kind !== "flag" || typeof value.value === "boolean") &&
      (kind === "start" || kind === "current" ||
        (kind === "updates" && value.since === -1) ||
        (typeof value.since === "number" && Number.isSafeInteger(value.since) && value.since >= 0)) &&
      (kind !== "updates" || (
        typeof value.game === "string" &&
        object(value.cursors) &&
        Object.values(value.cursors).every(cursor => typeof cursor === "string" && cursor.length <= 64)
      ));

    return valid
      ? { ok: true }
      : { ok: false, detail: "Invalid game request fields." };
  };
}

const ActiveRoom = view(
  "the open room of active (participant)",
  ({ participant }, { room, host }, _bindings) => where(
    RoomJoining._getParticipant({ participant }).is({ room, active: true }),
    RoomJoining._getRoom({ room }).is({ status: "OPEN", host }),
  ),
).optional();

const CurrentGame = view(
  "the current game of (room)",
  ({ room }, { game }, _bindings) => where(
    RoomJoining._getRoom({ room }).is({ status: "OPEN", currentGame: game }),
  ),
).optional();

const PlayableGame = view(
  "whether (participant) may play (game)",
  ({ participant, game }, _outputs, { room }) => where(
    ActiveRoom({ participant }).is({ room }),
    CurrentGame({ room }).is({ game }),
  ),
).holds();

const Snapshot = former(
  "the visible game state",
  ({ room, game }, {
    settings, status, clicks, flagsRemaining, startedAt, endedAt,
    coord, revealed, flagged, adjacent, mine, triggered,
    time, bv, resultClicks, speed, efficiency,
  }) => where(
    MinesweeperPlaying._getGame({ game }).is({ settings, status, clicks, flagsRemaining }),
    whether(MinesweeperPlaying._getGame({ game }).is({ startedAt })),
    whether(MinesweeperPlaying._getGame({ game }).is({ endedAt })),
  ).form({
    settings,
    status,
    clicks,
    flagsRemaining,
    startedAt,
    endedAt,
    cells: each(
      MinesweeperPlaying._visibleCells({ game }).is({ coord, revealed, flagged }),
    )
      .where(
        whether(MinesweeperPlaying._visibleCells({ game }).is({ coord, adjacent })),
        whether(MinesweeperPlaying._visibleCells({ game }).is({ coord, mine, triggered })),
      )
      .form({ coord, revealed, flagged, adjacent, mine, triggered })
      .splicing(CellHighlights({ room, game, coord })),
    results: each(
      MinesweeperPlaying._getResult({ game }).is({
        time, bv, clicks: resultClicks, speed, efficiency,
      }),
    ).form({ time, bv, clicks: resultClicks, speed, efficiency }),
  }),
);

const Start = endpoint(
  "/game/start",
  ({ session, settings, participant, room, game }) =>
    receive({ session, room, settings })
      .then(Sessioning.current({ session }).responds({ subject: participant }))
      .then(
        where(ActiveRoom({ participant }).is({ room, host: participant }))
          .then(MinesweeperPlaying.create({ settings }).responds({ game }))
          .then(RoomJoining.associate({ room, game }).responds({}))
          .then(respond({ game }))
          .named("host-starts"),

        where(
          ActiveRoom({ participant }),
          no(ActiveRoom({ participant }).is({ room, host: participant })),
        )
          .then(respond({ error: "HOST_REQUIRED" }))
          .named("not-host"),

        where(no(RoomJoining._getParticipant({ participant }).is({ active: true })))
          .then(respond({ error: "PARTICIPANT_NOT_ACTIVE" }))
          .named("inactive"),

        where(
          RoomJoining._getParticipant({ participant }).is({ active: true }),
          no(ActiveRoom({ participant })),
        )
          .then(respond({ error: "ROOM_NOT_OPEN" }))
          .named("room-unavailable"),
      ),
  {
    input: { required: ["session", "room", "settings"] },
    validators: { input: input("start") },
  },
);

const BoardChanges = former(
  "the committed board changes",
  ({ game, since }, { update }) => where(
    MinesweeperPlaying._updates({ game, since }).is({ update }),
  ).form({ update }),
);

// The moves share membership checks and their success response.
function move(kind: "reveal" | "flag" | "chord") {
  return endpoint(
    `/game/${kind}`,
    ({ session, game, coord, value, since, participant, instant, update }) => {
      const fields = kind === "flag"
        ? { session, game, coord, value, since }
        : { session, game, coord, since };

      const action = kind === "flag"
        ? MinesweeperPlaying.flag({ game, coord, value })
        : kind === "reveal"
        ? MinesweeperPlaying.reveal({ game, coord, now: instant })
        : MinesweeperPlaying.chord({ game, coord, now: instant });

      return receive(fields)
        .then(Sessioning.current({ session }).responds({ subject: participant }))
        .then(
          where(
            PlayableGame({ participant, game }),
            now(instant),
          )
            .then(action.responds({}))
            .then(respond({ game, changes: BoardChanges({ game, since }) }))
            .named("member-moves"),

          where(
            ActiveRoom({ participant }),
            no(PlayableGame({ participant, game })),
          )
            .then(respond({ error: "GAME_NOT_CURRENT" }))
            .named("wrong-game"),

          where(no(RoomJoining._getParticipant({ participant }).is({ active: true })))
            .then(respond({ error: "PARTICIPANT_NOT_ACTIVE" }))
            .named("inactive"),

          where(
            RoomJoining._getParticipant({ participant }).is({ active: true }),
            no(ActiveRoom({ participant })),
          )
            .then(respond({ error: "ROOM_NOT_OPEN" }))
            .named("room-unavailable"),
        );
    },
    {
      input: {
        required: kind === "flag"
          ? ["session", "game", "coord", "value", "since"]
          : ["session", "game", "coord", "since"],
      },
      validators: { input: input(kind) },
    },
  );
}

const Reveal = move("reveal");
const Flag = move("flag");
const Chord = move("chord");

const Current = endpoint(
  "/game/current",
  ({ session, participant, room, game }) =>
    receive({ session })
      .then(Sessioning.current({ session }).responds({ subject: participant }))
      .then(
        where(
          ActiveRoom({ participant }).is({ room }),
          CurrentGame({ room }).is({ game }),
        )
          .then(respond({ game, snapshot: Snapshot({ room, game }) }))
          .named("current-game"),

        where(
          ActiveRoom({ participant }).is({ room }),
          no(CurrentGame({ room })),
        )
          .then(respond({ game: null, snapshot: null }))
          .named("no-game"),

        where(no(RoomJoining._getParticipant({ participant }).is({ active: true })))
          .then(respond({ error: "PARTICIPANT_NOT_ACTIVE" }))
          .named("inactive"),

        where(
          RoomJoining._getParticipant({ participant }).is({ active: true }),
          no(ActiveRoom({ participant })),
        )
          .then(respond({ error: "ROOM_NOT_OPEN" }))
          .named("room-unavailable"),
      ),
  {
    input: { required: ["session"] },
    validators: { input: input("current") },
  },
);

const Changes = former(
  "the incremental game state",
  ({ room, game, since, cursors }, { update, author, cursor, nextCursor, targets }) => where(
    MinesweeperPlaying._updates({ game, since }).is({ update }),
  ).form({
    update,
    annotations: each(RoomJoining._activeParticipants({ room }).is({ participant: author }))
      .where(
        compute(computations.annotationCursor, { cursors, author }, cursor),
        concepts.Annotating._sync({ user: author, since: cursor }).is({ cursor: nextCursor, targets }),
      )
      .form({ participant: author, cursor: nextCursor, targets }),
  }),
);

const Updates = endpoint(
  "/game/updates",
  ({ session, game: knownGame, since, cursors, participant, room, game, effectiveSince, effectiveCursors }) =>
    receive({ session, game: knownGame, since, cursors })
      .then(Sessioning.current({ session }).responds({ subject: participant }))
      .then(
        where(
          ActiveRoom({ participant }).is({ room }),
          CurrentGame({ room }).is({ game }),
          compute(computations.boardSince, { knownGame, game, since }, effectiveSince),
          compute(computations.boardCursors, { knownGame, game, cursors }, effectiveCursors),
        )
          .then(respond({ game, changes: Changes({ room, game, since: effectiveSince, cursors: effectiveCursors }) }))
          .named("current-updates"),
        where(ActiveRoom({ participant }).is({ room }), no(CurrentGame({ room })))
          .then(respond({ game: null, changes: null })).named("no-game"),
        where(no(RoomJoining._getParticipant({ participant }).is({ active: true })))
          .then(respond({ error: "PARTICIPANT_NOT_ACTIVE" })).named("inactive"),
        where(RoomJoining._getParticipant({ participant }).is({ active: true }), no(ActiveRoom({ participant })))
          .then(respond({ error: "ROOM_NOT_OPEN" })).named("room-unavailable"),
      ),
  {
    input: { required: ["session", "game", "since", "cursors"] },
    validators: { input: input("updates") },
  },
);

export const composition = {
  ActiveRoom, CurrentGame, PlayableGame, Snapshot,
  Start, Reveal, Flag, Chord, Current, BoardChanges, Changes, Updates,
};