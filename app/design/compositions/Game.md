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
cells with their highlighters, and completed-game results. Before a game 
exists, game and snapshot are null.

```endpoints
Game.Current at /game/current
```

Active members [read incremental updates](reaction:Game.Updates) at
/game/updates with their known game, board revision (-1 for initial load), and annotation
cursors by participant. Permission checks are the same as Game.Current.
The [changes former](former:Game.Changes) reads one MinesweeperPlaying._updates
answer and each active participant's Annotating._sync answer. It returns the
board update and participant identities, cursors, and nullable target lists.
Inactive authors disappear from the returned roster and their cached highlights
must be removed. Before a game exists, game and changes are null.

A game mismatch forces a full board reset. The server discards previous annotation
cursors when the game changes and returns current annotation targets. Board
revisions and annotation cursors are independent; later polling reconciles
changes committed between those reads.

Reveal, Flag, and Chord additionally receive a nonnegative since revision and
return game plus changes containing a committed board update since that revision,
formed by [the board changes former](former:Game.BoardChanges). Clients apply
only updates based on their confirmed revision, discard older replies, and
recover with a reset when continuity is uncertain. Conflicting simultaneous
moves refuse rather than overwrite another committed move.

```endpoints
Game.Updates at /game/updates
```

```computations
boardSince(knownGame: String, game: MinesweeperPlaying.Game, since: Number): Number
  Return since when knownGame equals game, otherwise -1.

boardCursors(knownGame: String, game: MinesweeperPlaying.Game, cursors: Annotating.Cursors): Annotating.Cursors
  Return cursors when knownGame equals game, otherwise an empty record.

annotationCursor(cursors: Annotating.Cursors, author: RoomJoining.Participant): String
  Return the author's cursor when present, otherwise an empty string.
```
