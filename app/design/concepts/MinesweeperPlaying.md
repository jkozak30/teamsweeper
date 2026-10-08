# MinesweeperPlaying

## Purpose

Allow players to solve a Minesweeper puzzle under standard rules and moves;
track progress, time, and completion of a puzzle.

## Principle

A player creates a game with desired settings.
Their first reveal places mines while keeping that cell safe.
Revealing safe cells shows their numbers, and revealing a zero expands its neighbors.
The player flags suspected mines and chords revealed cells.
Revealing a mine loses the game; revealing every safe cell wins it.
After completion, the player can review the game's statistics.

## Types

```types
Status is IDLE or PLAYING or WON or LOST
  The lifecycle of a game.

opaque Coordinate
  A row and column, both represented as zero-based integers.
  The fields are named row and column.

opaque Settings
  Board height, width, and mine count, each represented as a safe integer.

opaque CellRevisions
  An array of numeric revisions indexed by row times width plus column.

opaque BoardUpdate
  A visible update containing revision, reset, settings, status, clicks,
  flagsRemaining, nullable timestamps, changed cells identified by numeric id
  and coordinate, and completed-game results. Hidden mines and numbers are
  absent until disclosure is permitted by the game rules.
```

## State

```state
a set of Games with
  a settings Settings
  a status Status
  a mines set of Coordinate
  a revealed set of Coordinate
  a flagged set of Coordinate
  a clicks Number
  a cellRevisions CellRevisions
  an optional startedAt DateTime
  an optional endedAt DateTime

Rule: Each successful move increments clicks and uses that value as its revision.
Rule: Each cell revision records its latest visible change.
Rule: A concurrent write must not overwrite a move committed after its read.
Rule: Height and width are positive safe integers.
Rule: Height times width is a safe integer.
Rule: Mine count is a positive safe integer smaller than height times width.
Rule: Every stored coordinate lies within the board.
Rule: Revealed and flagged cells are disjoint.
Rule: An IDLE game has no mines or timestamps.
Rule: A PLAYING game has startedAt and no endedAt.
Rule: A WON or LOST game has both timestamps.
Rule: After mine placement, the number of mines equals the configured mine count.
Rule: A WON game has every safe cell revealed and no mine revealed.
Rule: A LOST game has at least one mine revealed.
```

## Actions

```actions
create(settings: Settings) : returns (game: Game)
  where height, width, or mines is not a positive safe integer, or height times width is not a safe integer, or mines is at least height times width
  then
    refuses INVALID_SETTINGS "Use positive safe integer dimensions and fewer mines than cells."
  where height, width, and mines are positive safe integers and height times width is a safe integer and mines is smaller than height times width
  then
    create a game with the given settings and status IDLE
    initialize mines, revealed, and flagged as empty sets
    set clicks and every cell revision to zero and leave both timestamps absent
    returns game

reveal(game: Game, coord: Coordinate, now: DateTime) : returns (status: Status)
  where game does not exist
  then
    refuses GAME_NOT_FOUND "That game does not exist."
  where game exists and at least one condition holds: its status is WON or LOST; coord is invalid; coord is already revealed or flagged
  then
    refuses MOVE_NOT_ALLOWED "That move is not allowed in the current game state."
  where game exists and its status is IDLE or PLAYING and coord is valid and is neither revealed nor flagged
  then
    if status is IDLE, uniformly choose the configured number of distinct mine cells from all cells except coord, set startedAt to now, and set status to PLAYING
    increment clicks by one
    add coord to revealed
    if coord contains a mine, set status to LOST and endedAt to now
    otherwise, if coord has no adjacent mines, expand through adjacent unflagged zero cells and reveal their unflagged numbered boundary cells
    automatic expansion does not increment clicks and never reveals flagged cells
    if no mine was revealed and every safe cell is revealed, set status to WON and endedAt to now
    record the new revision for newly revealed cells and for mines disclosed at completion
    commit only if no intervening move changed the game; otherwise refuse MOVE_NOT_ALLOWED
    returns status

flag(game: Game, coord: Coordinate, value: Flag) : returns ()
  where game does not exist
  then
    refuses GAME_NOT_FOUND "That game does not exist."
  where game exists and at least one condition holds: its status is WON or LOST; coord is invalid; coord is revealed; its flagged state already equals value
  then
    refuses MOVE_NOT_ALLOWED "That move is not allowed in the current game state."
  where game exists and its status is IDLE or PLAYING and coord is valid and unrevealed and its flagged state differs from value
  then
    if value is true, add coord to flagged
    otherwise remove coord from flagged
    increment clicks by one
    record the new revision for coord
    commit only if no intervening move changed the game; otherwise refuse MOVE_NOT_ALLOWED
    returns

chord(game: Game, coord: Coordinate, now: DateTime) : returns (status: Status)
  where game does not exist
  then
    refuses GAME_NOT_FOUND "That game does not exist."
  where game exists and at least one condition holds: its status is not PLAYING; coord is invalid; coord is unrevealed; adjacent flag and mine counts differ; no neighbor is both unflagged and unrevealed
  then
    refuses MOVE_NOT_ALLOWED "That move is not allowed in the current game state."
  where game exists and its status is PLAYING and coord is valid and revealed and adjacent flag and mine counts match and at least one neighbor is both unflagged and unrevealed
  then
    increment clicks by one
    reveal all unflagged and unrevealed neighbors, including zero expansion as in reveal
    these reveals do not increment clicks
    if any mine is revealed, set status to LOST and endedAt to now
    otherwise, if every safe cell is revealed, set status to WON and endedAt to now
    record the new revision for newly revealed cells and for mines disclosed at completion
    commit only if no intervening move changed the game; otherwise refuse MOVE_NOT_ALLOWED
    returns status
```

## Queries

```queries
_updates(game: Game, since: Number) : optional (update: BoardUpdate)
  Returns no row for a missing game. Otherwise reads one committed game state.
  A -1, future, or unusable revision returns reset true and all visible cells.
  Otherwise reset is false and cells contains only cells changed after since,
  ordered by numeric id. Revision is the committed click count. An up-to-date
  read contains no cells. Results is null when the revision is unchanged,
  meaning keep the previously received results without recalculation.
  Otherwise results is computed from the same committed state as the cells.
  Legacy games lacking cell revisions return a full reset until their next move.

_getGame(game: Game) : optional (settings: Settings, status: Status, clicks: Number, flagsRemaining: Number, startedAt?: DateTime, endedAt?: DateTime)
  Returns no row if the game does not exist.
  Otherwise returns settings, status, clicks, timestamps when present,
  and flagsRemaining equal to the configured mine count minus the number of flags.
  This query does not change the game.

_visibleCells(game: Game) : many (coord: Coordinate, revealed: Flag, flagged: Flag, adjacent?: Number, mine?: Flag, triggered?: Flag)
  Returns one row per cell, ordered by row then column, or no rows for a missing game.
  Every row includes coord, revealed, and flagged.
  Revealed safe cells include adjacent, their adjacent mine count.
  While IDLE or PLAYING, hidden cells disclose neither mines nor adjacent mine counts.
  After WON or LOST, mine cells include mine true and triggered indicating whether revealed.
  Optional fields are absent when they do not apply.
  This query does not change the game.

_getResult(game: Game) : optional (time: Number, bv: Number, clicks: Number, speed: Number, efficiency: Number)
  Returns no row if the game does not exist, is not WON or LOST,
  or has a nonpositive elapsed time.
  Otherwise time is endedAt minus startedAt in seconds, and clicks is the recorded click count.
  bv is the board's 3BV: the number of connected zero-cell regions plus
  the number of safe numbered cells outside every zero region's numbered boundary.
  solved3BV counts zero regions opened by a revealed zero and revealed numbered
  cells outside every zero region's numbered boundary.
  speed is solved3BV divided by time.
  efficiency is solved3BV divided by clicks.
```