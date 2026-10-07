# Sessioning

## Purpose

Identify an external subject across requests using a temporary,
revocable session without changing the subject's identity.

## Principle

A session starts for a subject.
Before expiration, the session resolves to that subject.
Ending the session makes it unavailable.
Unknown or expired sessions do not identify a subject.

## Types

```types
external Subject
  The external identity represented by a session.
```

## State

```state
a set of Sessions with
  a subject Subject
  an expiresAt DateTime
```

## Actions

```actions
start(subject: Subject) : returns (session: Session, expiresAt: DateTime)
  where true
  then
    remove expired sessions
    create a new session with an unpredictable identity for subject
    set expiresAt to 30 minutes after the current server time
    returns session, expiresAt

current(session: Session) : returns (subject: Subject)
  where session is unknown or expired
  then
    refuses UNKNOWN_SESSION "This session is not active."
  where session exists and has not expired
  then
    set subject to the session's subject
    returns subject

end(session: Session) : returns (ended: Flag)
  where session is unknown or expired
  then
    refuses END_SESSION_NOT_ACTIVE "This session is not active."
  where session exists and has not expired
  then
    remove session
    set ended to true
    returns ended
```

## Queries

```queries
_active(session: Session) : optional (subject: Subject, expiresAt: DateTime)
  Returns the subject and expiration of an unexpired session.
  Returns no row for an unknown or expired session.
  Does not change state.
```