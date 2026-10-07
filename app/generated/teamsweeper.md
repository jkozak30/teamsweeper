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

## Application types

Concrete types:

- `GameIdentity` — [Application types](../design/types.md), line 7.

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
- Covered by [Rooms](../design/compositions/Rooms.md), line 3.
- Covered by [Rooms](../design/compositions/Rooms.md), line 15.

```reaction
when RequestBoundary.request (name, path: "/rooms/create", requestId)
then
  RoomJoining.create (name)
```

### Rooms.Create#2

Authored path: `Rooms.Create`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 3.
- Covered by [Rooms](../design/compositions/Rooms.md), line 15.

```reaction
when RoomJoining.create (name, code, participant, room), asked by Rooms.Create
where
  earlier, RequestBoundary.request (name, path: "/rooms/create", requestId)
then
  RequestBoundary.respond (code, participant, requestId, room)
```

### Rooms.Join

Authored path: `Rooms.Join`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 7.
- Covered by [Rooms](../design/compositions/Rooms.md), line 16.

```reaction
when RequestBoundary.request (code, name, path: "/rooms/join", requestId)
then
  RoomJoining.join (code, name)
```

### Rooms.Join#2

Authored path: `Rooms.Join`.
- Covered by [Rooms](../design/compositions/Rooms.md), line 7.
- Covered by [Rooms](../design/compositions/Rooms.md), line 16.

```reaction
when RoomJoining.join (code, name, participant), asked by Rooms.Join
where
  earlier, RequestBoundary.request (code, name, path: "/rooms/join", requestId)
then
  RequestBoundary.respond (participant, requestId)
```

## Endpoint input contracts

Before recording an action ask, the boundary rejects a body that is not an
object or lacks a required key. The response uses `INVALID_INPUT` and names
the path or missing key. A declared default fills an absent key. Endpoints
not listed here have no explicit input contract.

- `/rooms/create` — requires `name`
- `/rooms/join` — requires `code`, `name`
