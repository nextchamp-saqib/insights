# KPI authoring — decision map

A KPI card should be configured, not compiled. This map records how a number
card stops being a hand-built query pipeline.

Tickets live in `issues/`, one body of work each. A ticket carries a `Type:`, a
`Status:`, and any `Blocked by:` tickets.

Charted 2026-08-14. Continues the number card work in `312756c8..5a5fca04`.

## Destination

An author names a measure, a date column, a window and a comparison. Derivation
writes the filter, the grouping and the sort. Nobody writes a `sum_if` per
window, a constant join key, or a pruning `select`, and nobody has to know that
the card reads the last row.

The card's target stays a measure of the author's own query. Two small
query-layer changes make that join cheap.

## Notes

- Branch: `docs/framework-integration-map`, worktree `insights-islands`. The
  demo branch integrates this work, it never sources it.
- No schema change in this effort, so no migrate.
- The handoff that started this:
  `wayfinder/frappeverse-insights-demo/assets/number-card-redesign-handoff.md`
- The worked example of the pain:
  `wayfinder/frappeverse-insights-demo/build/overview_board.py`

## Decisions so far

Decided while charting, before tickets existed.

- **A window is a group-by, not a filter inside a measure.** One row per window,
  ordered oldest first. The measure stays plain. This is what removes the
  `sum_if` per window.
- **The group-by is the window itself, not the date grain.** Ticket 02 grouped by
  the unit the span names, which collapses a window to one row only when the span
  names one period. `last 3 months` returns three rows per window under that
  rule, and the card reads the newest month as if it were the three-month total —
  silently. Grouping by window membership makes every span return one row, and
  makes the single-period case correct by construction rather than by
  coincidence. See ticket 06.
- **Derivation stays pure, so the engine resolves the window.** `derive_operations`
  promises the same config always derives the same operations. A window depends on
  the clock and on Insights Settings, so derivation emits it unresolved — in the
  filter (ticket 02) and in the dimension (ticket 06) — and `ibis_utils` resolves
  it where the clock already lives.
- **The comparison stops being folklore.** `previous` reads the row before the
  last one today, and an author has to know that. Under window derivation the
  row before the last one *is* the previous window, because derivation wrote the
  sort. The adapter does not change.
- **Grouping restores the join key.** The constant `ibis.literal(1)` join key in
  `overview_board.py` is not a symptom of joining. It is a symptom of collapsing
  to one row. Grouping by window brings back a real period key, so the fake key
  goes without anyone solving the join.
- **The target stays the author's job.** A card reads one source query. This
  keeps `chart = one query, one operations list, one result`, which dashboard
  filter routing and drill-down both depend on.
- **The window vocabulary already half exists.** `handle_timespan` and
  `get_date_range` already parse `Last / Current / Next` across day, week,
  month, quarter, year and fiscal year. Only "to date", "shift" and "split" are
  missing.

- **A window is labelled by the date it starts on.** The dimension could have
  labelled windows `current` and `previous`. Naming them by their start date
  costs nothing and buys two things: the existing ascending `order_by` sorts them
  oldest first with no extra concept, and the label is a real period key — the
  same key whose absence forced the `ibis.literal(1)` join key in
  `overview_board.py`.
- **A row in two windows belongs to the oldest.** Spans can overlap, for example
  `last 3 months` shifted by one month. The oldest window wins, so no row is
  counted twice.
- **The window dimension is only correct beside its filter.** A row in no window
  is labelled nothing, and a NULL label sorts last, which would make it the
  card's reading. Derivation builds the filter and the dimension from one list of
  windows, so the two cannot drift, and a test pins that they are emitted
  together. Deliberately not defended further: there is no other caller, and
  `apply_windows` states the coupling in its own docstring.

## Rejected alternatives

- **A reading is its own execution.** Modelling each card element as an
  independent `(measure, window, source)` execution is the cleanest model on
  paper. Rejected on three counts, all found in the code:
  `_execute_live_query` is `@concurrent_limit(wait_timeout=0)` and its own
  comment says a dashboard already starves the thread pool; `route_filters`
  resolves a dashboard filter to exactly one `query::column` per chart, so
  multi-source readings become unfilterable; and the card's drill identity is a
  row, which several readings do not have. The model survives as the way to
  *think* about a card. Execution count stays a derivation decision.
- **A new "Look up Value" operation.** A dedicated step for "bring the target
  for this period". Rejected because a granularity on the existing join key
  says the same thing with no new concept, and generalises to every cross-grain
  date join. See ticket 03.
- **Target registration at site or workbook level.** Deferred, not dropped. A
  registration is a saved lookup — build the step first, let a registration
  emit it later. Building it now would drag in the dashboard filter-link
  change.
- **Pruning meta columns in the engine.** `get_column` throws hard when a column
  is absent, and it already carries four fallback strategies from past column
  renames. A pruned column has no fallback. Pruning must be recorded in the
  query document at authoring time, so old documents are untouched. See
  ticket 04.
- **An author-declared "one row per key" field, or a profile query, to catch a
  fan-out join.** Rejected both. The first asks the author to assert something
  they often do not know, and a wrong assertion is silently wrong. The second
  costs a `GROUP BY` scan. The row count before and after the join is exact,
  already fetched, and reports what did happen rather than what might.

## Not yet specified

- **The sparkline of a windowed card.** Window plus comparison is two rows, so a
  twelve-point sparkline needs a second execution. Two open parts: whether the
  card gets that second execution at all, and whether a MTD sparkline means this
  month by day (the window split one grain finer) or twelve months. Settle
  before the sparkline is wired to windows.
- **Balance metrics.** A flow sums over a window, a balance is read as of the
  window's end. Stating this once on the measure removes the per-card branch.
  Not needed for ticket 02, needed before windows are called finished.

## Out of scope

- The chart contract (`one query, one operations list, one result`). Changing it
  is real work with real payoff, but it should be decided on its own, not
  arrived at by way of a KPI card.
- Dashboard filter links and the drill-down contract, which only move if the
  chart contract does.
