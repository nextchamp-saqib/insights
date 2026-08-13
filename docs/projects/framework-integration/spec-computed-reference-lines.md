# Spec: computed reference lines — a rule at an aggregate, not just a constant

Status: shipped. The adapter computes in `frontend/src2/charts/adapter/axis.ts`,
the form is the new `frontend/src2/charts/components/ReferenceLinesConfig.vue`
(moved out of `YAxisConfig.vue`, mounted by the Bar and Line config forms), and
the config shape is `ReferenceLine` in `frontend/src2/types/chart.types.ts`. No
backend change and no frappe-ui change. Two decisions below changed while
building, both marked **Built as**.

Sources: [spec-charts-v2.md](spec-charts-v2.md), whose adapter this extends, and
[ADR-0002](../../adr/0002-charts-render-through-frappe-ui.md), which decides who
computes what.
Glossary: `CONTEXT.md` — adapter, filler, chart config.

## Problem Statement

A reference line can only sit at a number the author types. An author who wants
a rule at the average of what the chart draws has to read the average off the
plot, type it in, and retype it whenever the data moves. The line then lies: it
says 4,200 forever while the average drifts.

Every real use of the feature is a comparison against the data — the mean, the
best month, the worst — and the one shape we ship cannot express any of them.

## Solution

A reference line is at a **constant** or at an **aggregate of one Measure**:
average, median, min, max or sum. The adapter computes the aggregate from the
query result and hands frappe-ui a plain value, so the rule moves when the data
moves.

A computed line labels itself. Without a label, `Avg revenue: 1.2M` is printed
at the end of the rule, formatted by the Measure's own formatting.

## Why Insights computes it

echarts `markLine` has a native `type: 'average' | 'min' | 'max' | 'median'`,
and frappe-ui charts v2 cannot use it. v2 hangs every markLine on an **empty
host series** on purpose: a markLine inherits both the axis and the legend
visibility of its host, so riding a real series would read the rule against that
series' scale and let a legend toggle take the rule away with the data
(`frappe-ui/src/charts/referenceLines.ts`). A statistic type on a host with no
data averages nothing.

So the aggregate is computed by whoever holds the rows. ADR-0002 already says
that is Insights: *"Insights reshapes what v2 does not model"* — the same rule
that puts the comparison delta and the funnel's stage reshape in the adapter.
The adapter holds `input.result.rows` already.

Two things fall out of that ownership. The feature ships without waiting on a
frappe-ui release. And the auto-label can use Insights' own number formatting,
which the library does not have.

## User Stories

1. As a chart author, I want a reference line at the average of a Measure, so
   that the rule stays true as the data moves.
2. As a chart author, I want median, min, max and sum on the same control, so
   that I learn one thing.
3. As a chart author, I want to pick which Measure the aggregate reads, so that
   a multi-series chart can annotate one of them.
4. As a chart author, I want a computed line to label itself with the aggregate
   and the value, so that a reader knows what the rule means.
5. As a chart author, I want the auto-label to print the value the way the
   Measure prints it, so that a currency rule does not read as a bare number.
6. As a chart author, I want to overwrite the auto-label, so that I can call it
   "Target" instead.
7. As a chart author, I want my existing constant lines untouched, so that
   nothing I already published moves.
8. As a chart author, I want the line list to say what each line is, so that I
   do not open three popovers to find the one I meant.
9. As a chart author, I want reference lines in a section of their own, so that
   an X-axis line is not configured under "Y Axis".
10. As a chart author, I want a numeric input for a value-axis line, so that the
    keyboard matches what I am typing.
11. As a chart author, I want a line whose source Measure the query no longer
    returns to be dropped, so that a broken line never draws at zero.

## Implementation Decisions

**The config shape.** Flat optional fields, matching `Series` next to it:

```ts
export type ReferenceLine = {
	axis?: 'x' | 'y'
	align?: 'Left' | 'Right'
	// A line sits at a constant, or at an aggregate of one Measure's values.
	value?: number | string
	measure_name?: string
	aggregate?: ReferenceAggregate
	label?: string
	color?: string
	dashed?: boolean
}
```

Not a tagged union. Every config in `chart.types.ts` is a flat bag of optional
fields the form writes into, and a union would need a discriminator the form has
to maintain. A stored line carries only `value`, so it reads as a constant with
no migration and no version field.

**Built as** `measure_name`, a name, where this spec first said `measure:
Measure`, a copy. The line points at a series the chart already draws — the
result carries no other numbers, so a Measure from anywhere else has nowhere to
sit. A copy is a second answer to a question the series already answers, and it
can drift from it. The name cannot.

**The kind is read, not stored.** A line with a `measure` and an `aggregate` is
computed. Anything else is a constant. `referenceLinesFor` today drops any line
with no `value`, which would drop every computed line, so the filter moves to
the kind: a constant needs a `value`, a computed line needs both fields and at
least one source column present in the result.

**Source columns resolve the way series do.** Under a `split_by` the value
columns are named after split values, so one Measure owns several columns.
`seriesFor` already inverts that mapping, and the source columns are the ones it
answers with. No second answer to the same question.

**The aggregate reads cell values.** Every number the chart draws for those
columns, across every row. Not per-category totals. On a stacked bar chart the
totals are the better reading, and everywhere else they are the wrong one — one
mechanism that is right in general beats two that are each right once. `sum`
over cell values is the grand total either way.

Nulls and non-numeric cells are skipped, not read as zero. A source column with
no numeric cell at all makes the line undrawable, so it is dropped.

**The label.** A computed line with no `label` gets one built from the aggregate
and the computed value, run through the Measure's format: `Avg revenue: 1.2M`.
The aggregate word is short and fixed — `Avg`, `Median`, `Min`, `Max`, `Sum`. An
author-typed `label` wins and is printed as typed.

**The form.** The lines move out of `YAxisConfig.vue` into
`ReferenceLinesConfig.vue`, a `CollapsibleSection` of its own that the Bar and
Line config forms mount. The `axis` select already offered X, so a list under "Y
Axis" was already lying. Inside it:

- Every row leads with an "At" select: `Constant`, `Average`, `Median`, `Min`,
  `Max`, `Sum`. `Constant` is the default, so a stored line opens unchanged.
- Beside it, the value input for a constant, or the Measure for an aggregate. A
  new computed line defaults to the first series' Measure.
- The gear keeps label, colour, dash, align, and — for a constant only — the
  axis. An aggregate is a number, so it is read on a value axis and nowhere
  else. A value-axis constant gets `type="number"`; a category or date value
  stays text.

**Built as** an "At" select on the row rather than in the gear, and a plain
select over the chart's series Measures rather than a `MeasurePicker`. Two
reasons. The row then reads what the line is — `Average` `revenue` — with
nothing opened, which is what user story 8 asks for and cheaper than a summary
string. And `MeasurePicker` builds a Measure by picking an aggregation and a
column, which is a second aggregation control next to this one, on a Measure the
result would not carry.

**Nothing else moves.** The backend does not read `reference_lines`, and
`insights/ai/knowledge/charts.md` does not mention them, so the AI surface is
out of scope. `quadrantLines` on the bubble adapter writes the same frappe-ui
prop from its own config and is left alone.

## Non-goals

**Query-driven values** — a rule at a number from another query, a target stored
in a table. It needs a second execution, a cache and an invalidation rule, none
of which this feature has. The route to it opens the day this ships: a target
Measure the query already carries, marked `hide_from_chart`, is a legal source
for a computed line. That covers a target column fetched by the same query
without a second query. A cross-query value stays the destination.

**Reference bands** — a shaded min-max region. frappe-ui exposes no `markArea`,
so it is a library change, not this one.

## Testing Decisions

`axis.test.ts`, through the fixture builder, per ADR-0002: the suite asserts on
props and writes no config literal. `ReferenceLine` already carries the new keys,
so the builder gains one field: `readings`, the numbers a value column came back
with. A case that reads values rather than column names needs to name them.

Twelve cases, all shipped and passing:

- each of the five aggregates over one Measure
- an even count of readings: the median averages the two middle ones
- a computed line under a `split_by`: the Measure's split columns are all read
- a computed line on a multi-series chart reads only its own Measure
- nulls and non-numeric cells are skipped, not counted as zero
- a computed line whose Measure the chart does not draw is dropped
- a computed line missing `aggregate`, or missing `measure_name`, is dropped
- a Measure that came back with nothing numeric drops its line
- a constant line with no `value` is still dropped
- `align: 'Right'` puts a computed line on `y2`, exactly as a constant
- the auto-label prints the aggregate and the shortened value
- an author-typed label wins over the auto-label

The four existing reference line cases pass unchanged, which is the claim that a
stored constant line did not move.

The form has no test harness, and this spec does not add one.

## Also shipped

`toNumber` was private to the Number adapter and this feature needed the same
coercion. It moved to `helpers/index.ts` and both adapters read it there, rather
than a second copy answering the same question.
