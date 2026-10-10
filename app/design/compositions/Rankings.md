# Rankings

A winning [reveal](reaction:Rankings.RecordReveal) or [chord](reaction:Rankings.RecordChord)
records the game in PerformanceRanking. The request's resolved participant supplies
room scope through RoomJoining's existing membership query; category is settings/status.
MinesweeperPlaying supplies the statistics. Losses and unfinished games are not recorded.
Active members [rank saved games](reaction:Rankings.Rank) in their open room.
Sessioning resolves the participant, and Game.ActiveRoom supplies scope; callers cannot choose another room.
The [ranking former](former:Rankings.Ranked) returns results containing item, value, and rank.
Requests select metric and ascending direction, optionally category and inclusive 1-based from/to positions.
Omitted bounds retain the concept defaults; ranks are calculated before slicing.

Active members [retrieve a saved result](reaction:Rankings.Result) by item, including previous games.
The result's stored scope must match their active room. Missing items and other-room items both return
RESULT_NOT_FOUND. The response contains item and result { category, measurements }.
These reads never recompute board statistics or write results. Game responses stay unchanged;
the UI uses this endpoint for saved statistics on reload. An immediate read can precede the
independent recording reaction; callers may retry a missing result after a winning move.

```endpoints
Rankings.Rank at /rankings/rank
Rankings.Result at /rankings/result
```

```computations
rankingCategory(category: GameCategory | String | null): GameCategory | String | undefined
  Treat an omitted or null category as no filter.

resultCategory(settings: MinesweeperPlaying.Settings, status: MinesweeperPlaying.Status): PerformanceRanking.Category
  Pair settings and final status.

resultMeasurements(time: Number, bv: Number, clicks: Number, speed: Number, efficiency: Number): PerformanceRanking.Measurements
  Map numeric result fields to measurements, using the P1 metric names declared once in concepts.ts.
```
