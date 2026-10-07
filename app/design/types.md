# Application types

Teamsweeper associates rooms with Minesweeper games.
A session identifies a room participant.

```instances
instantiate MinesweeperPlaying

instantiate RoomJoining with
  Game is MinesweeperPlaying.Game

instantiate Sessioning with
  Subject is RoomJoining.Participant
```