# Annotations

Active members [highlight](reaction:Annotations.Highlight),
[remove](reaction:Annotations.Remove), and [clear](reaction:Annotations.Clear)
their annotations. Sessioning identifies the author from the cookie.
The [permission view](view:Annotations.MayAnnotate) requires active
membership in an open room whose current game matches the request.
Highlight accepts a nonempty list of at most 10000 coordinates. The entire
selection is validated against the board dimensions before any write.
Duplicate coordinates and existing highlights are harmless; Annotating.highlight
adds missing targets in one idempotent bulk operation. A storage failure can
leave a partial batch, which can safely be retried.
The [cell view](view:Annotations.Cell) verifies a removal coordinate and
constructs its GameCell identity. Clear removes all of the requester's
highlights, including those on previous games.

```endpoints
Annotations.Highlight at /annotations/highlight
Annotations.Remove at /annotations/remove
Annotations.Clear at /annotations/clear
```

The [cell highlighters](former:Annotations.CellHighlights) take room, game,
and coord and select active participants whose Annotating._byUser targets
include that GameCell. They appear as participant identities in each cell's
highlights array in Game.Current. Incremental reads use Annotating._sync
through Game.Changes to avoid retransmitting unchanged target lists.
Highlights do not reveal hidden cell contents or alter game moves.
They are permitted before, during, and after play while the game is current.

A [successful departure clears the author's highlights](reaction:Annotations.ClearOnLeave),
as in P1. Rooms.Leave waits for this reaction before answering.

```computations
gameCell(game: MinesweeperPlaying.Game, coord: MinesweeperPlaying.Coordinate): GameCell
  Return { game, coord: { row: coord.row, column: coord.column } }.

validateGameCells(game: MinesweeperPlaying.Game, coords: Array<MinesweeperPlaying.Coordinate>, settings: MinesweeperPlaying.Settings): { valid: Flag, items: Annotating.Items }
  Return valid true and the GameCell identities when every coordinate is an in-bounds safe integer pair; otherwise return valid false and no items.
```