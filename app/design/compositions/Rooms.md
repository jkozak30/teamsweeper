# Rooms

A player [creates a private room](reaction:Rooms.Create) by providing
a nonempty display name. RoomJoining.create returns the room identity,
participant identity, and shareable code. The creator becomes host.

A player [joins an open room](reaction:Rooms.Join) by providing
its code and a nonempty display name. RoomJoining.join returns
the new participant identity.

Invalid requests return the declared concept refusals, mapped to
public errors by the HTTP policy.

```endpoints
Rooms.Create at /rooms/create
Rooms.Join at /rooms/join
```