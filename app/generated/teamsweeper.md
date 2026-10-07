<!-- Generated from the Teamsweeper assembly. Do not edit. -->
<!-- Manifest producer: @mit-sdg/sync-engine@1.1.0; concept specification: sync-engine.concept-specification@1; renderer: @mit-sdg/sync-engine@1.1.0. -->

# Teamsweeper — assembled read-back

_Assembled by sync-engine from registered concepts and composition. Edit the concept_
_specifications and composition source, then regenerate this file._

## Concepts

### MinesweeperPlaying

Defined in [MinesweeperPlaying](../design/concepts/MinesweeperPlaying.md), line 1.

#### Actions

- `create(settings: Settings) : returns (game: Game)`
  - Refuses `INVALID_SETTINGS`: Use positive safe integer dimensions and fewer mines than cells.
- `reveal(game: Game, coord: Coordinate, now: DateTime) : returns (status: Status)`
  - Refuses `GAME_NOT_FOUND`: That game does not exist.
  - Refuses `MOVE_NOT_ALLOWED`: That move is not allowed in the current game state.
- `flag(game: Game, coord: Coordinate, value: Flag) : returns ()`
  - Refuses `GAME_NOT_FOUND`: That game does not exist.
  - Refuses `MOVE_NOT_ALLOWED`: That move is not allowed in the current game state.
- `chord(game: Game, coord: Coordinate, now: DateTime) : returns (status: Status)`
  - Refuses `GAME_NOT_FOUND`: That game does not exist.
  - Refuses `MOVE_NOT_ALLOWED`: That move is not allowed in the current game state.

#### Queries

- `_getGame(game: Game) : optional (settings: Settings, status: Status, clicks: Number, flagsRemaining: Number, startedAt?: DateTime, endedAt?: DateTime)`
- `_visibleCells(game: Game) : many (coord: Coordinate, revealed: Flag, flagged: Flag, adjacent?: Number, mine?: Flag, triggered?: Flag)`
- `_getResult(game: Game) : optional (time: Number, bv: Number, clicks: Number, speed: Number, efficiency: Number)`

#### Instances

- `MinesweeperPlaying` — instance of `MinesweeperPlaying` — [Application types](../design/types.md), line 7.

### RoomJoining

Defined in [RoomJoining](../design/concepts/RoomJoining.md), line 1.

#### Actions

- `create(name: String) : returns (room: Room, participant: Participant, code: String)`
  - Refuses `CREATE_NAME_REQUIRED`: Enter a display name to create a room.
- `join(code: String, name: String) : returns (participant: Participant)`
  - Refuses `JOIN_NAME_REQUIRED`: Enter a display name to join a room.
  - Refuses `ROOM_UNAVAILABLE`: No open room has that code.
- `leave(participant: Participant) : returns ()`
  - Refuses `PARTICIPANT_NOT_ACTIVE`: That participant is not active.
- `associate(room: Room, game: Game) : returns ()`
  - Refuses `ROOM_NOT_OPEN`: That room is not open.
  - Refuses `GAME_ALREADY_ASSOCIATED`: That game already belongs to a room.

#### Queries

- `_getRoom(room: Room) : optional (code: String, status: RoomStatus, host?: Participant, currentGame?: Game)`
- `_getParticipant(participant: Participant) : optional (room: Room, name: String, active: Flag)`
- `_activeParticipants(room: Room) : many (participant: Participant, name: String)`

#### Instances

- `RoomJoining` — instance of `RoomJoining` — [Application types](../design/types.md), line 9.
  - `Game` is `MinesweeperPlaying.Game` — [Application types](../design/types.md), line 10.

### Sessioning

Defined in [Sessioning](../design/concepts/Sessioning.md), line 1.

#### Actions

- `start(subject: Subject) : returns (session: Session, expiresAt: DateTime)`
- `current(session: Session) : returns (subject: Subject)`
  - Refuses `UNKNOWN_SESSION`: This session is not active.
- `end(session: Session) : returns (ended: Flag)`
  - Refuses `END_SESSION_NOT_ACTIVE`: This session is not active.

#### Queries

- `_active(session: Session) : optional (subject: Subject, expiresAt: DateTime)`

#### Instances

- `Sessioning` — instance of `Sessioning` — [Application types](../design/types.md), line 12.
  - `Subject` is `RoomJoining.Participant` — [Application types](../design/types.md), line 13.

## Views

_Views name reusable conditions. Multiple `where` blocks are alternatives._

### the active lobby of (participant)

Authored path: `Rooms.ActiveLobby`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 15.

```view
the active lobby of (participant) — inputs (participant); outputs (room, code, host); bindings () — answers at most one (room, code, host)
  where
    RoomJoining._getParticipant (participant) has (active: true, room)
    RoomJoining._getRoom (room) has (code, host, status: "OPEN")
```

### the current game of (room)

Authored path: `Game.CurrentGame`.
- Covered by [Game](../design/compositions/Game.md), line 16.

```view
the current game of (room) — inputs (room); outputs (game); bindings () — answers at most one (game)
  where RoomJoining._getRoom (room) has (currentGame: game, status: "OPEN")
```

### the open room of active (participant)

Authored path: `Game.ActiveRoom`.
- Covered by [Game](../design/compositions/Game.md), line 5.

```view
the open room of active (participant) — inputs (participant); outputs (room, host); bindings () — answers at most one (room, host)
  where
    RoomJoining._getParticipant (participant) has (active: true, room)
    RoomJoining._getRoom (room) has (host, status: "OPEN")
```

### whether (participant) may play (game)

Authored path: `Game.PlayableGame`.
- Covered by [Game](../design/compositions/Game.md), line 15.

```view
whether (participant) may play (game) — inputs (participant, game); outputs (); bindings (room)
  where
    view "the open room of active (participant)" with (participant) has (room)
    view "the current game of (room)" with (room) has (game)
```

## Formers

_Formers name result shapes evaluated when asked. The source former owns_
_the authored explanation; this section records the generated shape._

### the active room participants

Authored path: `Rooms.Members`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 18.

```former
Former "the active room participants" — inputs (room); bindings (participant, name); promises exactly one record — forms:
  a record of
    participants: each RoomJoining._activeParticipants (room) has (name, participant)
      form a record of
        name
        participant
```

### the visible game state

Authored path: `Game.Snapshot`.
- Covered by [Game](../design/compositions/Game.md), line 27.

```former
Former "the visible game state" — inputs (game); bindings (settings, status, clicks, flagsRemaining, startedAt, endedAt, coord, revealed, flagged, adjacent, mine, triggered, time, bv, resultClicks, speed, efficiency); promises exactly one record — forms:
  a record of
    where MinesweeperPlaying._getGame (game) has (clicks, flagsRemaining, settings, status)
    where whether MinesweeperPlaying._getGame (game) has (startedAt)
    where whether MinesweeperPlaying._getGame (game) has (endedAt)
    cells: each MinesweeperPlaying._visibleCells (game) has (coord, flagged, revealed)
      where whether MinesweeperPlaying._visibleCells (game) has (adjacent, coord)
      where whether MinesweeperPlaying._visibleCells (game) has (coord, mine, triggered)
      form a record of
        adjacent
        coord
        flagged
        mine
        revealed
        triggered
    clicks
    endedAt
    flagsRemaining
    results: each MinesweeperPlaying._getResult (game) has (bv, clicks: resultClicks, efficiency, speed, time)
      form a record of
        bv
        clicks: resultClicks
        efficiency
        speed
        time
    settings
    startedAt
    status
```

## Reactions

### DeliverFaultToAsker

```reaction
when any action is faulted, not asked by DeliverFaultToAsker
where
  earlier, RequestBoundary.request (requestId)
then
  RequestBoundary.respondFramework (error: "INTERNAL_ERROR", requestId)
```

### DeliverRefusalToAsker

```reaction
when any action is refused (message), except RequestBoundary
where
  earlier, RequestBoundary.request (requestId)
then
  RequestBoundary.respond (error: message, requestId)
```

### Game.Chord

Authored path: `Game.Chord`.
- Covered by [Game](../design/compositions/Game.md), line 14.
- Covered by [Game](../design/compositions/Game.md), line 23.

```reaction
when RequestBoundary.request (coord, game, path: "/game/chord", requestId, session)
then
  Sessioning.current (session)
```

### Game.Chord:inactive#2

Authored path: `Game.Chord`.
- Covered by [Game](../design/compositions/Game.md), line 14.
- Covered by [Game](../design/compositions/Game.md), line 23.

```reaction
when Sessioning.current (session, subject: participant), asked by Game.Chord
where
  no RoomJoining._getParticipant (participant) has (active: true)
  earlier, RequestBoundary.request (coord, game, path: "/game/chord", requestId, session)
then
  RequestBoundary.respond (error: "PARTICIPANT_NOT_ACTIVE", requestId)
```

### Game.Chord:member-moves#2

Authored path: `Game.Chord`.
- Covered by [Game](../design/compositions/Game.md), line 14.
- Covered by [Game](../design/compositions/Game.md), line 23.

```reaction
when Sessioning.current (session, subject: participant), asked by Game.Chord
where
  instant is the current flow's instant
  earlier, RequestBoundary.request (coord, game, path: "/game/chord", requestId, session)
  view "whether (participant) may play (game)" with (game, participant)
then
  MinesweeperPlaying.chord (coord, game, now: instant)
```

### Game.Chord:member-moves#3

Authored path: `Game.Chord`.
- Covered by [Game](../design/compositions/Game.md), line 14.
- Covered by [Game](../design/compositions/Game.md), line 23.

```reaction
when MinesweeperPlaying.chord (coord, game, now: instant), asked by Game.Chord:member-moves#2
where
  earlier, RequestBoundary.request (coord, game, path: "/game/chord", requestId, session)
then
  RequestBoundary.respond (game, requestId)
```

### Game.Chord:room-unavailable#2

Authored path: `Game.Chord`.
- Covered by [Game](../design/compositions/Game.md), line 14.
- Covered by [Game](../design/compositions/Game.md), line 23.

```reaction
when Sessioning.current (session, subject: participant), asked by Game.Chord
where
  RoomJoining._getParticipant (participant) has (active: true)
  no view "the open room of active (participant)" with (participant)
  earlier, RequestBoundary.request (coord, game, path: "/game/chord", requestId, session)
then
  RequestBoundary.respond (error: "ROOM_NOT_OPEN", requestId)
```

### Game.Chord:wrong-game#2

Authored path: `Game.Chord`.
- Covered by [Game](../design/compositions/Game.md), line 14.
- Covered by [Game](../design/compositions/Game.md), line 23.

```reaction
when Sessioning.current (session, subject: participant), asked by Game.Chord
where
  view "the open room of active (participant)" with (participant)
  earlier, RequestBoundary.request (coord, game, path: "/game/chord", requestId, session)
  no view "whether (participant) may play (game)" with (game, participant)
then
  RequestBoundary.respond (error: "GAME_NOT_CURRENT", requestId)
```

### Game.Current

Authored path: `Game.Current`.
- Covered by [Game](../design/compositions/Game.md), line 26.
- Covered by [Game](../design/compositions/Game.md), line 33.

```reaction
when RequestBoundary.request (path: "/game/current", requestId, session)
then
  Sessioning.current (session)
```

### Game.Current:current-game#2

Authored path: `Game.Current`.
- Covered by [Game](../design/compositions/Game.md), line 26.
- Covered by [Game](../design/compositions/Game.md), line 33.

```reaction
when Sessioning.current (session, subject: participant), asked by Game.Current
where
  view "the open room of active (participant)" with (participant) has (room)
  view "the current game of (room)" with (room) has (game)
  earlier, RequestBoundary.request (path: "/game/current", requestId, session)
then
  RequestBoundary.respond (game, requestId, snapshot: former "the visible game state" with (game))
```

### Game.Current:inactive#2

Authored path: `Game.Current`.
- Covered by [Game](../design/compositions/Game.md), line 26.
- Covered by [Game](../design/compositions/Game.md), line 33.

```reaction
when Sessioning.current (session, subject: participant), asked by Game.Current
where
  no RoomJoining._getParticipant (participant) has (active: true)
  earlier, RequestBoundary.request (path: "/game/current", requestId, session)
then
  RequestBoundary.respond (error: "PARTICIPANT_NOT_ACTIVE", requestId)
```

### Game.Current:no-game#2

Authored path: `Game.Current`.
- Covered by [Game](../design/compositions/Game.md), line 26.
- Covered by [Game](../design/compositions/Game.md), line 33.

```reaction
when Sessioning.current (session, subject: participant), asked by Game.Current
where
  view "the open room of active (participant)" with (participant) has (room)
  no view "the current game of (room)" with (room)
  earlier, RequestBoundary.request (path: "/game/current", requestId, session)
then
  RequestBoundary.respond (game: null, requestId, snapshot: null)
```

### Game.Current:room-unavailable#2

Authored path: `Game.Current`.
- Covered by [Game](../design/compositions/Game.md), line 26.
- Covered by [Game](../design/compositions/Game.md), line 33.

```reaction
when Sessioning.current (session, subject: participant), asked by Game.Current
where
  RoomJoining._getParticipant (participant) has (active: true)
  no view "the open room of active (participant)" with (participant)
  earlier, RequestBoundary.request (path: "/game/current", requestId, session)
then
  RequestBoundary.respond (error: "ROOM_NOT_OPEN", requestId)
```

### Game.Flag

Authored path: `Game.Flag`.
- Covered by [Game](../design/compositions/Game.md), line 13.
- Covered by [Game](../design/compositions/Game.md), line 22.

```reaction
when RequestBoundary.request (coord, game, path: "/game/flag", requestId, session, value)
then
  Sessioning.current (session)
```

### Game.Flag:inactive#2

Authored path: `Game.Flag`.
- Covered by [Game](../design/compositions/Game.md), line 13.
- Covered by [Game](../design/compositions/Game.md), line 22.

```reaction
when Sessioning.current (session, subject: participant), asked by Game.Flag
where
  no RoomJoining._getParticipant (participant) has (active: true)
  earlier, RequestBoundary.request (coord, game, path: "/game/flag", requestId, session, value)
then
  RequestBoundary.respond (error: "PARTICIPANT_NOT_ACTIVE", requestId)
```

### Game.Flag:member-moves#2

Authored path: `Game.Flag`.
- Covered by [Game](../design/compositions/Game.md), line 13.
- Covered by [Game](../design/compositions/Game.md), line 22.

```reaction
when Sessioning.current (session, subject: participant), asked by Game.Flag
where
  instant is the current flow's instant
  earlier, RequestBoundary.request (coord, game, path: "/game/flag", requestId, session, value)
  view "whether (participant) may play (game)" with (game, participant)
then
  MinesweeperPlaying.flag (coord, game, value)
```

### Game.Flag:member-moves#3

Authored path: `Game.Flag`.
- Covered by [Game](../design/compositions/Game.md), line 13.
- Covered by [Game](../design/compositions/Game.md), line 22.

```reaction
when MinesweeperPlaying.flag (coord, game, value), asked by Game.Flag:member-moves#2
where
  earlier, RequestBoundary.request (coord, game, path: "/game/flag", requestId, session, value)
then
  RequestBoundary.respond (game, requestId)
```

### Game.Flag:room-unavailable#2

Authored path: `Game.Flag`.
- Covered by [Game](../design/compositions/Game.md), line 13.
- Covered by [Game](../design/compositions/Game.md), line 22.

```reaction
when Sessioning.current (session, subject: participant), asked by Game.Flag
where
  RoomJoining._getParticipant (participant) has (active: true)
  no view "the open room of active (participant)" with (participant)
  earlier, RequestBoundary.request (coord, game, path: "/game/flag", requestId, session, value)
then
  RequestBoundary.respond (error: "ROOM_NOT_OPEN", requestId)
```

### Game.Flag:wrong-game#2

Authored path: `Game.Flag`.
- Covered by [Game](../design/compositions/Game.md), line 13.
- Covered by [Game](../design/compositions/Game.md), line 22.

```reaction
when Sessioning.current (session, subject: participant), asked by Game.Flag
where
  view "the open room of active (participant)" with (participant)
  earlier, RequestBoundary.request (coord, game, path: "/game/flag", requestId, session, value)
  no view "whether (participant) may play (game)" with (game, participant)
then
  RequestBoundary.respond (error: "GAME_NOT_CURRENT", requestId)
```

### Game.Reveal

Authored path: `Game.Reveal`.
- Covered by [Game](../design/compositions/Game.md), line 13.
- Covered by [Game](../design/compositions/Game.md), line 21.

```reaction
when RequestBoundary.request (coord, game, path: "/game/reveal", requestId, session)
then
  Sessioning.current (session)
```

### Game.Reveal:inactive#2

Authored path: `Game.Reveal`.
- Covered by [Game](../design/compositions/Game.md), line 13.
- Covered by [Game](../design/compositions/Game.md), line 21.

```reaction
when Sessioning.current (session, subject: participant), asked by Game.Reveal
where
  no RoomJoining._getParticipant (participant) has (active: true)
  earlier, RequestBoundary.request (coord, game, path: "/game/reveal", requestId, session)
then
  RequestBoundary.respond (error: "PARTICIPANT_NOT_ACTIVE", requestId)
```

### Game.Reveal:member-moves#2

Authored path: `Game.Reveal`.
- Covered by [Game](../design/compositions/Game.md), line 13.
- Covered by [Game](../design/compositions/Game.md), line 21.

```reaction
when Sessioning.current (session, subject: participant), asked by Game.Reveal
where
  instant is the current flow's instant
  earlier, RequestBoundary.request (coord, game, path: "/game/reveal", requestId, session)
  view "whether (participant) may play (game)" with (game, participant)
then
  MinesweeperPlaying.reveal (coord, game, now: instant)
```

### Game.Reveal:member-moves#3

Authored path: `Game.Reveal`.
- Covered by [Game](../design/compositions/Game.md), line 13.
- Covered by [Game](../design/compositions/Game.md), line 21.

```reaction
when MinesweeperPlaying.reveal (coord, game, now: instant), asked by Game.Reveal:member-moves#2
where
  earlier, RequestBoundary.request (coord, game, path: "/game/reveal", requestId, session)
then
  RequestBoundary.respond (game, requestId)
```

### Game.Reveal:room-unavailable#2

Authored path: `Game.Reveal`.
- Covered by [Game](../design/compositions/Game.md), line 13.
- Covered by [Game](../design/compositions/Game.md), line 21.

```reaction
when Sessioning.current (session, subject: participant), asked by Game.Reveal
where
  RoomJoining._getParticipant (participant) has (active: true)
  no view "the open room of active (participant)" with (participant)
  earlier, RequestBoundary.request (coord, game, path: "/game/reveal", requestId, session)
then
  RequestBoundary.respond (error: "ROOM_NOT_OPEN", requestId)
```

### Game.Reveal:wrong-game#2

Authored path: `Game.Reveal`.
- Covered by [Game](../design/compositions/Game.md), line 13.
- Covered by [Game](../design/compositions/Game.md), line 21.

```reaction
when Sessioning.current (session, subject: participant), asked by Game.Reveal
where
  view "the open room of active (participant)" with (participant)
  earlier, RequestBoundary.request (coord, game, path: "/game/reveal", requestId, session)
  no view "whether (participant) may play (game)" with (game, participant)
then
  RequestBoundary.respond (error: "GAME_NOT_CURRENT", requestId)
```

### Game.Start

Authored path: `Game.Start`.
- Covered by [Game](../design/compositions/Game.md), line 3.
- Covered by [Game](../design/compositions/Game.md), line 10.

```reaction
when RequestBoundary.request (path: "/game/start", requestId, room, session, settings)
then
  Sessioning.current (session)
```

### Game.Start:host-starts#2

Authored path: `Game.Start`.
- Covered by [Game](../design/compositions/Game.md), line 3.
- Covered by [Game](../design/compositions/Game.md), line 10.

```reaction
when Sessioning.current (session, subject: participant), asked by Game.Start
where
  view "the open room of active (participant)" with (participant) has (host: participant, room)
  earlier, RequestBoundary.request (path: "/game/start", requestId, room, session, settings)
then
  MinesweeperPlaying.create (settings)
```

### Game.Start:host-starts#3

Authored path: `Game.Start`.
- Covered by [Game](../design/compositions/Game.md), line 3.
- Covered by [Game](../design/compositions/Game.md), line 10.

```reaction
when MinesweeperPlaying.create (settings, game), asked by Game.Start:host-starts#2
where
  earlier, RequestBoundary.request (path: "/game/start", requestId, room, session, settings)
then
  RoomJoining.associate (game, room)
```

### Game.Start:host-starts#4

Authored path: `Game.Start`.
- Covered by [Game](../design/compositions/Game.md), line 3.
- Covered by [Game](../design/compositions/Game.md), line 10.

```reaction
when RoomJoining.associate (game, room), asked by Game.Start:host-starts#3
where
  earlier, RequestBoundary.request (path: "/game/start", requestId, room, session, settings)
then
  RequestBoundary.respond (game, requestId)
```

### Game.Start:inactive#2

Authored path: `Game.Start`.
- Covered by [Game](../design/compositions/Game.md), line 3.
- Covered by [Game](../design/compositions/Game.md), line 10.

```reaction
when Sessioning.current (session, subject: participant), asked by Game.Start
where
  no RoomJoining._getParticipant (participant) has (active: true)
  earlier, RequestBoundary.request (path: "/game/start", requestId, room, session, settings)
then
  RequestBoundary.respond (error: "PARTICIPANT_NOT_ACTIVE", requestId)
```

### Game.Start:not-host#2

Authored path: `Game.Start`.
- Covered by [Game](../design/compositions/Game.md), line 3.
- Covered by [Game](../design/compositions/Game.md), line 10.

```reaction
when Sessioning.current (session, subject: participant), asked by Game.Start
where
  view "the open room of active (participant)" with (participant)
  earlier, RequestBoundary.request (path: "/game/start", requestId, room, session, settings)
  no view "the open room of active (participant)" with (participant) has (host: participant, room)
then
  RequestBoundary.respond (error: "HOST_REQUIRED", requestId)
```

### Game.Start:room-unavailable#2

Authored path: `Game.Start`.
- Covered by [Game](../design/compositions/Game.md), line 3.
- Covered by [Game](../design/compositions/Game.md), line 10.

```reaction
when Sessioning.current (session, subject: participant), asked by Game.Start
where
  RoomJoining._getParticipant (participant) has (active: true)
  no view "the open room of active (participant)" with (participant)
  earlier, RequestBoundary.request (path: "/game/start", requestId, room, session, settings)
then
  RequestBoundary.respond (error: "ROOM_NOT_OPEN", requestId)
```

### Rooms.Create

Authored path: `Rooms.Create`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 3.
- Covered by [Rooms](../design/compositions/Rooms.md), line 10.

```reaction
when RequestBoundary.request (name, path: "/rooms/create", requestId)
then
  RoomJoining.create (name)
```

### Rooms.Create#2

Authored path: `Rooms.Create`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 3.
- Covered by [Rooms](../design/compositions/Rooms.md), line 10.

```reaction
when RoomJoining.create (name, code, participant, room), asked by Rooms.Create
then
  Sessioning.start (subject: participant)
```

### Rooms.Create#3

Authored path: `Rooms.Create`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 3.
- Covered by [Rooms](../design/compositions/Rooms.md), line 10.

```reaction
when Sessioning.start (subject: participant, expiresAt, session), asked by Rooms.Create#2
where
  earlier, RoomJoining.create (name, code, participant, room), asked by Rooms.Create
  earlier, RequestBoundary.request (name, path: "/rooms/create", requestId)
then
  RequestBoundary.respond (code, expiresAt, participant, requestId, room, session)
```

### Rooms.Current

Authored path: `Rooms.Current`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 14.
- Covered by [Rooms](../design/compositions/Rooms.md), line 21.

```reaction
when RequestBoundary.request (path: "/rooms/current", requestId, session)
then
  Sessioning.current (session)
```

### Rooms.Current:participant-inactive#2

Authored path: `Rooms.Current`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 14.
- Covered by [Rooms](../design/compositions/Rooms.md), line 21.

```reaction
when Sessioning.current (session, subject: participant), asked by Rooms.Current
where
  no RoomJoining._getParticipant (participant) has (active: true)
  earlier, RequestBoundary.request (path: "/rooms/current", requestId, session)
then
  RequestBoundary.respond (error: "PARTICIPANT_NOT_ACTIVE", requestId)
```

### Rooms.Current:room-open#2

Authored path: `Rooms.Current`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 14.
- Covered by [Rooms](../design/compositions/Rooms.md), line 21.

```reaction
when Sessioning.current (session, subject: participant), asked by Rooms.Current
where
  view "the active lobby of (participant)" with (participant) has (code, host, room)
  earlier, RequestBoundary.request (path: "/rooms/current", requestId, session)
then
  RequestBoundary.respond (code, host, members: former "the active room participants" with (room), participant, requestId, room)
```

### Rooms.Current:room-unavailable#2

Authored path: `Rooms.Current`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 14.
- Covered by [Rooms](../design/compositions/Rooms.md), line 21.

```reaction
when Sessioning.current (session, subject: participant), asked by Rooms.Current
where
  RoomJoining._getParticipant (participant) has (active: true, room)
  no RoomJoining._getRoom (room) has (status: "OPEN")
  earlier, RequestBoundary.request (path: "/rooms/current", requestId, session)
then
  RequestBoundary.respond (error: "ROOM_NOT_OPEN", requestId)
```

### Rooms.Join

Authored path: `Rooms.Join`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 4.
- Covered by [Rooms](../design/compositions/Rooms.md), line 11.

```reaction
when RequestBoundary.request (code, name, path: "/rooms/join", requestId)
then
  RoomJoining.join (code, name)
```

### Rooms.Join#2

Authored path: `Rooms.Join`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 4.
- Covered by [Rooms](../design/compositions/Rooms.md), line 11.

```reaction
when RoomJoining.join (code, name, participant), asked by Rooms.Join
then
  Sessioning.start (subject: participant)
```

### Rooms.Join#3

Authored path: `Rooms.Join`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 4.
- Covered by [Rooms](../design/compositions/Rooms.md), line 11.

```reaction
when Sessioning.start (subject: participant, expiresAt, session), asked by Rooms.Join#2
where
  earlier, RequestBoundary.request (code, name, path: "/rooms/join", requestId)
then
  RequestBoundary.respond (expiresAt, participant, requestId, session)
```

### Rooms.Leave

Authored path: `Rooms.Leave`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 24.
- Covered by [Rooms](../design/compositions/Rooms.md), line 30.

```reaction
when RequestBoundary.request (path: "/rooms/leave", requestId, session)
then
  Sessioning.current (session)
```

### Rooms.Leave#2

Authored path: `Rooms.Leave`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 24.
- Covered by [Rooms](../design/compositions/Rooms.md), line 30.

```reaction
when Sessioning.current (session, subject: participant), asked by Rooms.Leave
then
  RoomJoining.leave (participant)
```

### Rooms.Leave#3

Authored path: `Rooms.Leave`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 24.
- Covered by [Rooms](../design/compositions/Rooms.md), line 30.

```reaction
when RoomJoining.leave (participant), asked by Rooms.Leave#2
where
  earlier, Sessioning.current (session, subject: participant), asked by Rooms.Leave
then
  Sessioning.end (session)
```

### Rooms.Leave#4

Authored path: `Rooms.Leave`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 24.
- Covered by [Rooms](../design/compositions/Rooms.md), line 30.

```reaction
when Sessioning.end (session, ended), asked by Rooms.Leave#3
where
  earlier, RequestBoundary.request (path: "/rooms/leave", requestId, session)
then
  RequestBoundary.respond (ended, requestId)
```

## Endpoint input contracts

Before recording an action ask, the boundary rejects a body that is not an
object or lacks a required key. The response uses `INVALID_INPUT` and names
the path or missing key. A declared default fills an absent key. Endpoints
not listed here have no explicit input contract.

- `/game/chord` — requires `session`, `game`, `coord`
- `/game/current` — requires `session`
- `/game/flag` — requires `session`, `game`, `coord`, `value`
- `/game/reveal` — requires `session`, `game`, `coord`
- `/game/start` — requires `session`, `room`, `settings`
- `/rooms/create` — requires `name`
- `/rooms/current` — requires `session`
- `/rooms/join` — requires `code`, `name`
- `/rooms/leave` — requires `session`
