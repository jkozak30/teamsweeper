# Rooms

A player [creates a room](reaction:Rooms.Create) or
[joins an open room](reaction:Rooms.Join). RoomJoining establishes membership;
Sessioning starts a session whose subject is the participant. The HTTP adapter
stores the token and expiration in an HttpOnly cookie.

```endpoints
Rooms.Create at /rooms/create
Rooms.Join at /rooms/join
```

The [current lobby](reaction:Rooms.Current) resolves the session and waits for
host recovery before reading room state. The
[active lobby view](view:Rooms.ActiveLobby) requires active membership in an
open room; the [member former](former:Rooms.Members) supplies its active roster.

```endpoints
Rooms.Current at /rooms/current
```

[Renewal](reaction:Rooms.Renew) resolves the session, requires active membership
in an open room, and waits for host recovery. Sessioning.renew
updates expiration at most once per minute. The HTTP adapter reissues the same
cookie with the returned expiration and responds with an empty JSON object.

```endpoints
Rooms.Renew at /rooms/renew
```

[Departure](reaction:Rooms.Leave) resolves the session, invokes RoomJoining.leave,
and ends the session. The [departure reaction](reaction:Annotations.ClearOnLeave)
clears the participant's annotations before the response. The HTTP adapter
clears the cookie.

```endpoints
Rooms.Leave at /rooms/leave
```

[Host recovery](reaction:Rooms.RecoverHost) follows successful Sessioning.current
calls. It combines Sessioning._present with active membership in an open room.
If the host is absent, Sessioning.expireAbsent expires its sessions. A successful
expiration invokes RoomJoining.leave for that host. Existing
RoomJoining behavior reassigns hosting or closes an empty room;
Annotations.ClearOnLeave removes the departed host's annotations.
