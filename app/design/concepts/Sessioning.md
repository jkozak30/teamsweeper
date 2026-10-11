# Sessioning

## Purpose

Identify an external subject across requests using a temporary,
revocable session without changing the subject's identity.

## Principle

Starting a session identifies its subject until expiration or explicit termination.
Resolving or renewing an active session records presence. Renewal extends its
lifetime; an expired session cannot be renewed.

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
  an optional lastSeen DateTime
  an optional lastRenewed DateTime
```

## Actions

```actions
start(subject: Subject) : returns (session: Session, expiresAt: DateTime)
  where true
  then
    create a new session with an unpredictable identity for subject
    set expiresAt to 10 minutes after the current server time
    set lastSeen and lastRenewed to the current server time
    returns session, expiresAt

current(session: Session) : returns (subject: Subject)
  where session is unknown or expired
  then
    refuses UNKNOWN_SESSION "This session is not active."
  where session exists and has not expired
  then
    update lastSeen to the current server time without decreasing it
    set subject to the session's subject
    returns subject

renew(session: Session) : returns (session: Session, expiresAt: DateTime)
  where session is unknown or expired
  then
    refuses UNKNOWN_SESSION "This session is not active."
  where session exists and has not expired
  then
    if lastRenewed is absent, adopt a 10-minute lifetime and set lastRenewed to the current server time
    otherwise if at least one minute has elapsed since lastRenewed, extend expiresAt to at least 10 minutes after the current server time and advance lastRenewed
    update lastSeen to at least the current server time
    returns session, expiresAt

expireAbsent(subject: Subject) : returns (expired: Flag)
  where subject has an unexpired session seen in the last 10 seconds
  then
    set expired to false
    returns expired
  where subject has no unexpired session seen in the last 10 seconds
  then
    expire its unexpired sessions whose lastSeen values remain unchanged
    set expired to whether any session was expired
    returns expired

purge(session: Session) : returns ()
  where true
  then
    remove the session only if it has expired
    returns

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
_present(subject: Subject) : optional (subject: Subject)
  answers subject if it has a session with expiresAt > now and lastSeen > now minus 10 seconds
  answers no row otherwise

_expired() : many (session: Session, subject: Subject)
  answers sessions with expiresAt <= now and their subjects

_subjectActive(subject: Subject) : optional (subject: Subject)
  answers subject if it has an unexpired session
  answers no row otherwise

_active(session: Session) : optional (subject: Subject, expiresAt: DateTime)
  answers the subject and expiration of an unexpired session
  answers no row for an unknown or expired session
```
