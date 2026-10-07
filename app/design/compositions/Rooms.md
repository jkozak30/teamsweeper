# Rooms

## Creating and joining

A player [creates a private room](reaction:Rooms.Create) with a
nonempty display name. RoomJoining.create returns the room identity,
participant identity, and code. The creator becomes host.

A player [joins an open room](reaction:Rooms.Join) with its code
and a nonempty display name. RoomJoining.join returns the participant.

Each endpoint starts a Sessioning session for the participant returned
by RoomJoining. Callers cannot choose another session subject.
The HTTP adapter stores the issued token in an HttpOnly cookie and
removes the token and expiration from the JSON response.

```endpoints
Rooms.Create at /rooms/create
Rooms.Join at /rooms/join
```

## Reading the current lobby

A requester [reads their current lobby](reaction:Rooms.Current).
The HTTP adapter supplies the session from its cookie, and
Sessioning.current resolves it to the participant identity.

The [active lobby lookup](view:Rooms.ActiveLobby) finds the
participant's room when their membership is active and the room
is open. It returns the room identity, code, and host, or no rows
when there is no matching active lobby.

The endpoint returns these details, the requester’s participant
identity, and the [active room participants](former:Rooms.Members).
The former lists each active participant's identity and display name.

Unknown, ended, or expired sessions produce an unauthorized response.
Inactive or missing participants produce a forbidden response.
An active participant whose room is missing or closed receives
a conflict response.

```endpoints
Rooms.Current at /rooms/current
```

## Leaving

A requester [leaves their room](reaction:Rooms.Leave).
The endpoint resolves the cookie's session to a participant,
invokes RoomJoining.leave, then ends the presented session.
The HTTP adapter clears the cookie after a successful response.

The caller cannot select another participant to leave.
RoomJoining handles host reassignment and room closing.

```endpoints
Rooms.Leave at /rooms/leave
```

## Scope and limitations

Sessions expire 30 minutes after issuance.
Session expiration does not itself remove room membership.
Automatic departure on expiration or disconnection is future work.

Create and Join establish a new browser session. Until an explicit
room-switching workflow exists, the frontend should offer these actions
only when the browser has no current participant.

Annotation cleanup on departure remains future work.