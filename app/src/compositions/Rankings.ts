import { endpoint, receive, respond, type EndpointValidator } from "@mit-sdg/sync-engine/boundary";
import { composition as Game } from "./Game.ts";
import { compute, earlier, reaction, when, each, former, no, where } from "@mit-sdg/sync-engine/language";
import { concepts, computations } from "../concepts.ts";

const { MinesweeperPlaying, PerformanceRanking, RoomJoining, Sessioning } = concepts;

function recordWin(kind: "reveal" | "chord") {
  return reaction(({ game, coord, now, participant, room, settings, time, bv, clicks, speed, efficiency, category, measurements }) => {
    const move = kind === "reveal"
      ? MinesweeperPlaying.reveal({ game, coord, now })
      : MinesweeperPlaying.chord({ game, coord, now });
    return when(move.responds({ status: "WON" }))
      .where(
        earlier(Sessioning.current, {}, { subject: participant }),
        RoomJoining._getParticipant({ participant }).is({ room }),
        MinesweeperPlaying._getGame({ game }).is({ settings }),
        MinesweeperPlaying._getResult({ game }).is({ time, bv, clicks, speed, efficiency }),
        compute(computations.resultCategory, { settings, status: "WON" }, category),
        compute(computations.resultMeasurements, { time, bv, clicks, speed, efficiency }, measurements),
      )
      .then(PerformanceRanking.record({ item: game, scope: room, category, measurements }).responds({}));
  });
}


function input(kind: "rank" | "result"): EndpointValidator {
  return value => {
    const object = (item: unknown): item is Record<string, unknown> =>
      typeof item === "object" && item !== null && !Array.isArray(item);
    const required = kind === "rank" ? ["session", "metric", "ascending"] : ["session", "item"];
    const allowed = kind === "rank" ? [...required, "category", "from", "to"] : required;
    const json = (item: unknown): boolean => item === null || typeof item === "string" ||
      typeof item === "boolean" || (typeof item === "number" && Number.isFinite(item)) ||
      (Array.isArray(item) ? item.every(json) : object(item) && Object.values(item).every(json));
    const valid = object(value) && required.every(key => Object.hasOwn(value, key)) &&
      Object.keys(value).every(key => allowed.includes(key)) &&
      (value.session === null || typeof value.session === "string") &&
      (kind === "result" ? typeof value.item === "string" && value.item.length > 0 :
        typeof value.metric === "string" && value.metric.length > 0 && typeof value.ascending === "boolean" &&
        (value.category === undefined || value.category === null ||
          (typeof value.category === "string" && value.category.length > 0) ||
          (object(value.category) && json(value.category))) &&
        (value.from === undefined || (Number.isSafeInteger(value.from) && (value.from as number) >= 1)) &&
        (value.to === undefined || (Number.isSafeInteger(value.to) && (value.to as number) >= (value.from as number ?? 1))));
    return valid ? { ok: true } : { ok: false, detail: "Invalid ranking request fields." };
  };
}

const Ranked = former(
  "the room's ranked results",
  ({ room, category, metric, ascending, from, to }, { item, value, rank }) => where().form({
    results: each(PerformanceRanking._rank({ scope: room, category, metric, ascending, from, to })
      .is({ item, value, rank })).form({ item, value, rank }),
  }),
);

const Rank = endpoint(
  "/rankings/rank",
  ({ session, participant, room, category, effectiveCategory, metric, ascending, from, to }) =>
    receive({ session, category, metric, ascending, from, to })
      .then(Sessioning.current({ session }).responds({ subject: participant }))
      .then(
        where(Game.ActiveRoom({ participant }).is({ room }),
          compute(computations.rankingCategory, { category }, effectiveCategory))
          .then(respond({ ranking: Ranked({ room, category: effectiveCategory, metric, ascending, from, to }) })).named("member-ranks"),
        where(no(RoomJoining._getParticipant({ participant }).is({ active: true })))
          .then(respond({ error: "PARTICIPANT_NOT_ACTIVE" })).named("inactive"),
        where(RoomJoining._getParticipant({ participant }).is({ active: true }), no(Game.ActiveRoom({ participant })))
          .then(respond({ error: "ROOM_NOT_OPEN" })).named("room-unavailable"),
      ),
  { input: { required: ["session", "metric", "ascending"], defaults: { category: null, from: 1, to: Number.MAX_SAFE_INTEGER } },
    validators: { input: input("rank") } },
);

const Result = endpoint(
  "/rankings/result",
  ({ session, participant, room, item, category, measurements }) => receive({ session, item })
    .then(Sessioning.current({ session }).responds({ subject: participant }))
    .then(
      where(Game.ActiveRoom({ participant }).is({ room }),
        PerformanceRanking._get({ item }).is({ scope: room, category, measurements }))
        .then(respond({ item, result: { category, measurements } })).named("member-result"),
      where(Game.ActiveRoom({ participant }).is({ room }),
        no(PerformanceRanking._get({ item }).is({ scope: room })))
        .then(respond({ error: "RESULT_NOT_FOUND" })).named("missing-or-other-room"),
      where(no(RoomJoining._getParticipant({ participant }).is({ active: true })))
        .then(respond({ error: "PARTICIPANT_NOT_ACTIVE" })).named("inactive"),
      where(RoomJoining._getParticipant({ participant }).is({ active: true }), no(Game.ActiveRoom({ participant })))
        .then(respond({ error: "ROOM_NOT_OPEN" })).named("room-unavailable"),
    ),
  { input: { required: ["session", "item"] }, validators: { input: input("result") } },
);

export const composition = {
  Rank, Result, Ranked,
  RecordReveal: recordWin("reveal"),
  RecordChord: recordWin("chord"),
};
