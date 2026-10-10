# Application types

Rooms contain Minesweeper games, sessions identify participants,
and participants highlight cells identified by game and coordinate.

```types
concrete GameCell
  A record { game, coord: { row, column } }, identifying one cell
  in one MinesweeperPlaying game.

concrete GameCategory
  A record { settings, status } from MinesweeperPlaying.

concrete RankingMetric
  A string naming a performance metric.
```

```instances
instantiate MinesweeperPlaying

instantiate RoomJoining with
  Game is MinesweeperPlaying.Game

instantiate Sessioning with
  Subject is RoomJoining.Participant

instantiate Annotating with
  User is RoomJoining.Participant
  Item is GameCell

instantiate PerformanceRanking with
  Item is MinesweeperPlaying.Game
  Scope is RoomJoining.Room
  Category is GameCategory
  Metric is RankingMetric
```