# Annotations

Active members [highlight](reaction:Annotations.Highlight),
[remove](reaction:Annotations.Remove), and [clear](reaction:Annotations.Clear)
their annotations. Sessioning identifies the author from the cookie.
The [permission view](view:Annotations.MayAnnotate) requires active
membership in an open room whose current game matches the request.
The [cell view](view:Annotations.Cell) verifies the coordinate and
constructs its GameCell identity. Clear removes all of the requester's
highlights, including those on previous games.

```endpoints
Annotations.Highlight at /annotations/highlight
Annotations.Remove at /annotations/remove
Annotations.Clear at /annotations/clear
```

The [cell highlighters](former:Annotations.CellHighlights) appear as
participant identities in each cell's highlights array in Game.Current.
Highlights do not reveal hidden cell contents or alter game moves.
They are permitted before, during, and after play while the game is current.

A [successful departure clears the author's highlights](reaction:Annotations.ClearOnLeave),
as in P1. Rooms.Leave waits for this reaction before answering.

```computations
gameCell(game: MinesweeperPlaying.Game, coord: MinesweeperPlaying.Coord): GameCell
  Return { game, coord: { row: coord.row, column: coord.column } }.
```