# RoomJoining

## Purpose

Allow a group to gather privately for a shared activity.

## Principle

A host creates a room and shares its code with a group.
Group members join the room and may leave throughout the activity.
If the host leaves, another active participant becomes host.
Once every participant leaves, the room closes.

## Types

```types
external Game
  The shared activity associated with a room.

RoomStatus is OPEN or CLOSED
  Whether a room accepts participation.
```

## State

```state
a set of Rooms with
  a unique code String
  a status RoomStatus
  an optional host Participant
  an optional currentGame Game
  a games set of Game

a set of Participants with
  a room Room
  a name String
  an active Flag

Rule: Every open room has an active host belonging to that room.
Rule: Closed rooms have no active participants and no host.
Rule: A room's currentGame, when present, belongs to its games.
Rule: A game belongs to at most one room's games.
```

## Actions

```actions
create(name: String) : returns (room: Room, participant: Participant, code: String)
  where name is nonempty
  then
    generate a random code not shared by any other room
    create a new room with that code, status OPEN, no host, no currentGame, and an empty games set
    create a new participant with that room, the given name, and active true
    set the room's host to that participant
    returns room, participant, code
  where name is empty
  then
    refuses CREATE_NAME_REQUIRED "Enter a display name to create a room."

join(code: String, name: String) : returns (participant: Participant)
  where name is empty
  then
    refuses JOIN_NAME_REQUIRED "Enter a display name to join a room."
  where name is nonempty and no OPEN room has the given code
  then
    refuses ROOM_UNAVAILABLE "No open room has that code."
  where name is nonempty and an OPEN room has the given code
  then
    create a new participant with that room, the given name, and active true
    returns participant

leave(participant: Participant) : returns ()
  where participant does not exist or is inactive
  then
    refuses PARTICIPANT_NOT_ACTIVE "That participant is not active."
  where participant exists and is active
  then
    set participant's active field to false
    if the participant's room has no remaining active participants, set its status to CLOSED and remove its host
    otherwise, if the participant was the host, assign any remaining active participant as host
    returns

associate(room: Room, game: Game) : returns ()
  where room does not exist or is CLOSED
  then
    refuses ROOM_NOT_OPEN "That room is not open."
  where room exists and is OPEN and game belongs to a room's games
  then
    refuses GAME_ALREADY_ASSOCIATED "That game already belongs to a room."
  where room exists and is OPEN and game belongs to no room's games
  then
    add game to the room's games
    set the room's currentGame to game
    returns
```

## Queries

```queries
_getRoom(room: Room) : optional (code: String, status: RoomStatus, host?: Participant, currentGame?: Game)
  Returns the room's code, status, host, and current game.
  Returns no row if the room does not exist.
  Absent host and currentGame values are omitted.

_getParticipant(participant: Participant) : optional (room: Room, name: String, active: Flag)
  Returns the participant's room, display name, and active status.
  Returns no row if the participant does not exist.

_activeParticipants(room: Room) : many (participant: Participant, name: String)
  Returns active participants belonging to the room, ordered by participant identifier.
  Returns no rows if the room does not exist or has no active participants.
```