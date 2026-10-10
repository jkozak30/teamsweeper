# PerformanceRanking

## Purpose

Allow comparison of scoped and categorized items by a selected performance metric.

## Principle

An item belongs to a scope, has a category, and is recorded with performance measurements.
Items in that scope can be ranked by a metric, optionally filtering by category.

## Types

```types
external Item
  A nonempty string identifying an item.

external Scope
  A nonempty string identifying a comparison group.

external Category
  A nonempty string or JSON object identifying a category; objects compare by value.

external Metric
  A nonempty string naming a measurement.

opaque Measurements
  A nonempty sequence representing a set of (metric, value) pairs;
  metrics are distinct and values are finite numbers.
```

## State

```state
a set of Results with
  an item Item
  a scope Scope
  a category Category
  a measurements Measurements

Rule: Each item has at most one result.
```

## Actions

```actions
record(item: Item, scope: Scope, category: Category, measurements: Measurements) : returns ()
  where inputs are invalid, measurements is empty, a value is not finite, or a metric is repeated
  then
    refuses INVALID_RESULT "Use valid identities, a category, and nonempty finite measurements with distinct metrics."
  where inputs are valid and a result already has item
  then
    refuses RESULT_ALREADY_RECORDED "That item already has a recorded result."
  where inputs are valid and no result has item
  then
    create a result with the given item, scope, category, and measurements
    returns
```

## Queries

```queries
_rank(scope: Scope, category?: Category, metric: Metric, ascending: Flag, from?: Number, to?: Number) : many (item: Item, value: Number, rank: Number)
  Returns results in scope, and category when provided, that contain metric.
  Sorts by its value ascending when ascending is true, otherwise descending.
  Ranks are 1-indexed positions; ties share rank, e.g. 1, 1, 3.
  Tied items appear in ascending identity order. Optional from/to select inclusive,
  1-based positions after ranking; omitted bounds mean the first/last position.
  Provided bounds must be positive safe integers with to at least from.
  Invalid inputs refuse INVALID_RANKING.

_get(item: Item) : optional (scope: Scope, category: Category, measurements: Measurements)
  Returns the stored result, or no row for an unknown item.
```
