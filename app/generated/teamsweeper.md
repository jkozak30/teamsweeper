<!-- Generated from the Teamsweeper assembly. Do not edit. -->
<!-- Manifest producer: @mit-sdg/sync-engine@1.1.0; concept specification: sync-engine.concept-specification@1; renderer: @mit-sdg/sync-engine@1.1.0. -->

# Teamsweeper — assembled read-back

_Assembled by sync-engine from registered concepts and composition. Edit the concept_
_specifications and composition source, then regenerate this file._

## Concepts

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

- `RoomJoining` — instance of `RoomJoining` — [Application types](../design/types.md), line 12.
  - `Game` is `GameIdentity` — [Application types](../design/types.md), line 13.

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

- `Sessioning` — instance of `Sessioning` — [Application types](../design/types.md), line 14.
  - `Subject` is `RoomJoining.Participant` — [Application types](../design/types.md), line 15.

## Application types

Concrete types:

- `GameIdentity` — [Application types](../design/types.md), line 7.

## Views

_Views name reusable conditions. Multiple `where` blocks are alternatives._

### the active lobby of (participant)

Authored path: `Rooms.ActiveLobby`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 28.

```view
the active lobby of (participant) — inputs (participant); outputs (room, code, host); bindings () — answers at most one (room, code, host)
  where
    RoomJoining._getParticipant (participant) has (active: true, room)
    RoomJoining._getRoom (room) has (code, host, status: "OPEN")
```

## Formers

_Formers name result shapes evaluated when asked. The source former owns_
_the authored explanation; this section records the generated shape._

### the active room participants

Authored path: `Rooms.Members`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 34.

```former
Former "the active room participants" — inputs (room); bindings (participant, name); promises exactly one record — forms:
  a record of
    participants: each RoomJoining._activeParticipants (room) has (name, participant)
      form a record of
        name
        participant
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

### Rooms.Create

Authored path: `Rooms.Create`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 5.
- Covered by [Rooms](../design/compositions/Rooms.md), line 18.

```reaction
when RequestBoundary.request (name, path: "/rooms/create", requestId)
then
  RoomJoining.create (name)
```

### Rooms.Create#2

Authored path: `Rooms.Create`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 5.
- Covered by [Rooms](../design/compositions/Rooms.md), line 18.

```reaction
when RoomJoining.create (name, code, participant, room), asked by Rooms.Create
then
  Sessioning.start (subject: participant)
```

### Rooms.Create#3

Authored path: `Rooms.Create`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 5.
- Covered by [Rooms](../design/compositions/Rooms.md), line 18.

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
- Covered by [Rooms](../design/compositions/Rooms.md), line 24.
- Covered by [Rooms](../design/compositions/Rooms.md), line 43.

```reaction
when RequestBoundary.request (path: "/rooms/current", requestId, session)
then
  Sessioning.current (session)
```

### Rooms.Current:participant-inactive#2

Authored path: `Rooms.Current`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 24.
- Covered by [Rooms](../design/compositions/Rooms.md), line 43.

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
- Covered by [Rooms](../design/compositions/Rooms.md), line 24.
- Covered by [Rooms](../design/compositions/Rooms.md), line 43.

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
- Covered by [Rooms](../design/compositions/Rooms.md), line 24.
- Covered by [Rooms](../design/compositions/Rooms.md), line 43.

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
- Covered by [Rooms](../design/compositions/Rooms.md), line 9.
- Covered by [Rooms](../design/compositions/Rooms.md), line 19.

```reaction
when RequestBoundary.request (code, name, path: "/rooms/join", requestId)
then
  RoomJoining.join (code, name)
```

### Rooms.Join#2

Authored path: `Rooms.Join`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 9.
- Covered by [Rooms](../design/compositions/Rooms.md), line 19.

```reaction
when RoomJoining.join (code, name, participant), asked by Rooms.Join
then
  Sessioning.start (subject: participant)
```

### Rooms.Join#3

Authored path: `Rooms.Join`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 9.
- Covered by [Rooms](../design/compositions/Rooms.md), line 19.

```reaction
when Sessioning.start (subject: participant, expiresAt, session), asked by Rooms.Join#2
where
  earlier, RequestBoundary.request (code, name, path: "/rooms/join", requestId)
then
  RequestBoundary.respond (expiresAt, participant, requestId, session)
```

### Rooms.Leave

Authored path: `Rooms.Leave`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 48.
- Covered by [Rooms](../design/compositions/Rooms.md), line 57.

```reaction
when RequestBoundary.request (path: "/rooms/leave", requestId, session)
then
  Sessioning.current (session)
```

### Rooms.Leave#2

Authored path: `Rooms.Leave`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 48.
- Covered by [Rooms](../design/compositions/Rooms.md), line 57.

```reaction
when Sessioning.current (session, subject: participant), asked by Rooms.Leave
then
  RoomJoining.leave (participant)
```

### Rooms.Leave#3

Authored path: `Rooms.Leave`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 48.
- Covered by [Rooms](../design/compositions/Rooms.md), line 57.

```reaction
when RoomJoining.leave (participant), asked by Rooms.Leave#2
where
  earlier, Sessioning.current (session, subject: participant), asked by Rooms.Leave
then
  Sessioning.end (session)
```

### Rooms.Leave#4

Authored path: `Rooms.Leave`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 48.
- Covered by [Rooms](../design/compositions/Rooms.md), line 57.

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

- `/rooms/create` — requires `name`
- `/rooms/current` — requires `session`
- `/rooms/join` — requires `code`, `name`
- `/rooms/leave` — requires `session`
