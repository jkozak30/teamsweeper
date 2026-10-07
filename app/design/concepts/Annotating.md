# Annotating

## Purpose

Help users draw attention to particular items when discussing them.

## Principle

A user highlights a set of items, and other users can see the highlights.
The user can remove a highlight or clear all their highlights.

## Types

```types
external User
  The author of a highlight.

external Item
  The target of a highlight.
```

## State

```state
a set of Annotations with
  an author User
  a target Item

Rule: At most one annotation has any given author and target pair.
```

## Actions

```actions
highlight(user: User, item: Item) : returns ()
  where an annotation exists with author user and target item
  then
    refuses ALREADY_HIGHLIGHTED "You have already highlighted that item."
  where no annotation exists with author user and target item
  then
    create an annotation with author user and target item
    returns

remove(user: User, item: Item) : returns ()
  where no annotation exists with author user and target item
  then
    refuses HIGHLIGHT_NOT_FOUND "You have not highlighted that item."
  where an annotation exists with author user and target item
  then
    remove that annotation
    returns

clear(user: User) : returns ()
  where true
  then
    remove all annotations with author user
    returns
```

## Queries

```queries
_forItem(item: Item) : many (author: User)
  Returns the authors highlighting the given item, ordered by author identity.
  Returns no rows when the item has no highlights.

_byUser(user: User) : many (target: Item)
  Returns the items highlighted by the user, ordered by canonical target encoding.
  Returns no rows when the user has no highlights.
```