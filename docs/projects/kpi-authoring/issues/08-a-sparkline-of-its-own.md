# A sparkline of its own

Type: task
Status: ready-for-agent
Blocked by: 03

## Question

A windowed card returns two rows — the current window and the comparison. A
sparkline drawn from them is two points.

## The decision

The sparkline gets its own execution. One query answers "what is this number and
what do I hold it against", the other answers "how did it move". Two questions,
two queries.

One execution cannot serve both. Grouping at the finer grain and summing the
rows into windows in the adapter was considered and rejected: it breaks for every
non-additive measure — average, count distinct, and any percent — and a card that
is right for sums and silently wrong for averages is worse than one that costs a
second query.

The cost is two executions per number chart instead of one, only for cards that
switch the sparkline on, and both cache on their SQL digest. Accepted.

A month-to-date card draws **this month by day** — the card's own window, split
one grain finer. The rejected reading was the last twelve months, which is a
different window and answers a line chart's question, not a card's.

## What to build

A second execution for a card whose `sparkline` is on and whose `window` is set:
the same source and the same business filter, over the configured window only —
not the comparison window — grouped by the window split one grain finer.

`split_window(start, end, unit)` in `insights/insights/query_builders/sql_functions.py`
already returns those sub-windows. Resolution stays in the engine, the same way
the window dimension does. Derivation stays pure.

A card with a sparkline and no window keeps today's behaviour: the series is
whatever rows the query returned.

## Done when

- A month-to-date card with a sparkline draws one point per elapsed day.
- The reading and the comparison are unchanged by the sparkline being on or off.
- A card with no window is untouched.
- The second execution does not run for a card whose sparkline is off.

## Notes

`_execute_live_query` rejects at the concurrency limiter rather than queueing,
and its comment says a dashboard already pushes the pool. Two executions per card
is bounded and opt-in, which is why it was accepted, but do not make the second
one unconditional.
