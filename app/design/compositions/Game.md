# Game

The host [starts a game](reaction:Game.Start) with a room and settings.
Sessioning resolves the requester from the cookie.
The [active room view](view:Game.ActiveRoom) verifies membership and
host ownership. MinesweeperPlaying creates the game, then RoomJoining
associates it as the room's current game, replacing any previous one.

```endpoints
Game.Start at /game/start
```

Active members [reveal](reaction:Game.Reveal), [flag](reaction:Game.Flag),
and [chord](reaction:Game.Chord). The
[play permission view](view:Game.PlayableGame) requires active membership
in an open room whose [current game](view:Game.CurrentGame) matches
the request. Reveal and Chord use the engine's timestamp;
MinesweeperPlaying enforces move rules and win/loss.

```endpoints
Game.Reveal at /game/reveal
Game.Flag at /game/flag
Game.Chord at /game/chord
```

An active member [reads the current game](reaction:Game.Current).
The [snapshot former](former:Game.Snapshot) returns metadata, visible
cells, and completed-game results. Hidden contents remain concealed
during play; absent optional values become null. Before a game exists,
game and snapshot are null.

```endpoints
Game.Current at /game/current
```