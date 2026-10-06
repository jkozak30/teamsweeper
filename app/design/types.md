# Application types

RoomJoining currently treats game identities as opaque strings.
The gameplay concept will be introduced in a later implementation step.

```types
concrete GameIdentity
  An identifier for a game associated with a room.
```

```instances
instantiate RoomJoining with
  Game is GameIdentity
```