# Rooms

A player [creates a room](reaction:Rooms.Create) with a nonempty name
and becomes its host. Other players [join](reaction:Rooms.Join)
with the room code and a nonempty name. Each endpoint starts a
Sessioning session for the returned participant; the HTTP adapter
stores its token in an HttpOnly cookie.

```endpoints
Rooms.Create at /rooms/create
Rooms.Join at /rooms/join
```

A requester [reads their current lobby](reaction:Rooms.Current)
using their session cookie. The [active lobby view](view:Rooms.ActiveLobby)
requires active membership in an open room. The response includes
the participant identity, room identity, code, host, and
[active members](former:Rooms.Members) with their identities and names.

```endpoints
Rooms.Current at /rooms/current
```

A requester [leaves their room](reaction:Rooms.Leave).
Sessioning identifies the participant, RoomJoining handles departure,
host reassignment, and room closing, then Sessioning ends the session
and the HTTP adapter clears the cookie. Successful departure also clears
the participant's annotations.

```endpoints
Rooms.Leave at /rooms/leave
```