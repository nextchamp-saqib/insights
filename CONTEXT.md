# Insights

Frappe's BI/analytics app. Users connect data sources, build queries as operation
pipelines, and assemble charts into dashboards — all inside a Workbook.

## Language

### Analysis

**Workbook**:
The document where analysis happens — a named collection of queries, charts, and
dashboards, saved and shared as one unit.
_Avoid_: notebook, report

**Query**:
An ordered pipeline of Operations producing tabular, per-row results. Queries return
rows; aggregation for presentation belongs to Charts.
_Avoid_: dataset

**Operation**:
One step in a query pipeline — `source`, `join`, `union`, `filter_group`, `select`,
`mutate`, `summarize`, `order_by`, `limit`, `pivot_wider`, …. Stored as JSON on the
query, compiled to SQL through ibis.
_Avoid_: transform, step

**Chart**:
An aggregated visualization over a query, configured with dimensions and measures.
Charts aggregate; a mid-pipeline `summarize` in a query is a grain change, not
presentation.
_Avoid_: visual, graph

**Dashboard**:
A grid of charts, filters, and text blocks; each item carries a Layout.

**Dashboard filter**:
A dashboard-level control that routes filter conditions into the queries behind its
linked charts.

**Measure**:
A column or expression aggregated with an aggregation type (sum, count, …).
_Avoid_: metric

**Dimension**:
A column that results are grouped or split by, optionally with a date granularity.
_Avoid_: group-by column

**Grain**:
The size of the bucket a date or ordered column is grouped into — day, week,
month, quarter, year. "Grain" is the prose word. The identifier stays
`granularity`: the key on a Dimension, the doctype field, and the wire field a
viewer receives. frappe-ui's own prop type is `TimeGrain`. Both words are
correct in their own layer.
_Avoid_: renaming `granularity` in code, or writing "granularity" in prose

**Expression**:
An inline calculated column, measure, or filter written in the ibis-based expression
syntax.
_Avoid_: formula

### Drill-down

**Drill**:
Reading what a number in a chart is made of. A drill cuts the chart's pipeline
just before the step that aggregated it, and reads the surface underneath. Every
read surface offers the same drill: the desk island, the dashboard viewer, the
public page, and the builder's preview.
_Avoid_: drill-through, explore

**Surface**:
Three senses, all of them live, in three different layers.

1. The rows under a chart's aggregation — the pipeline cut just before its
   summarize or pivot step (`chart_drill.py`). This surface is the exposure
   bound. A drill may name only its columns, so a drill never reaches past what
   the chart already published.
2. A screen a user works on: the viewer surface, an authoring surface, the desk
   surface. Read surfaces and authoring surfaces get different answers from the
   server.
3. frappe-ui's `bg-surface-*` token, a background step in the design system.

The three do not collide in practice, because each layer only ever means one of
them. Say which one when a sentence could take two.
_Avoid_: renaming any of the three

**Segment**:
The part of a chart a reader clicked — one bar, one slice, one point. It travels
to the server as its dimension values, plain triples of column, operator and
value. It never travels as operations. One level of a drill stack carries one
segment, and levels accumulate, so each level narrows the rows further.
_Avoid_: slice, data point, cell

**Breakdown**:
One of the two answers a drill level can ask for: group the segment by one more
column of the surface. The other answer is records, the rows behind the segment.
A breakdown draws as an ad-hoc chart the answer picks for itself, and a click on
it recurses.
_Avoid_: split, group-by (that is a Dimension)

**Additive**:
Whether a level's group values add up to the value of the segment above them.
True of a sum and a count, false of an average, a distinct count and an
expression. The server says it on the answer, beside the order the rows run in,
because a column of decimals does not say which aggregation made it. A breakdown
reads it to decide whether it may draw itself as parts of one whole.
_Avoid_: summable, part-of-whole (that is what being additive licenses)

### Data

**Data Source**:
A configured connection to one database (Frappe site, MariaDB, Postgres, DuckDB, …).
_Avoid_: connection

**Table**:
A table exposed by a data source, selectable as a query's source.

**Table Link**:
A stored join relationship between two tables, used to suggest joins.

**Data Store**:
The site-local DuckDB warehouse holding imported copies of source tables so queries
run without hitting the source live.
_Avoid_: warehouse (implementation file name only)

**Table Import**:
The sync job that copies a source table into the Data Store.

**Unexplained Orphan**:
A Data Store table the weekly cleanup cannot show to be rebuildable. The cleanup
keeps it and raises an `Error Log`. See the cleanup ADR,
`docs/adr/the-cleanup-deletes-only-what-it-can-rebuild.md`.
_Avoid_: unknown table, stray table

### Framework integration

**Island**:
An app-provided, self-contained UI unit that the framework mounts into a host page
(desk or a Vue-frontend app) — shadow-root isolated, and bundled by the app, so it
carries its own Vue and frappe-ui. Declared via the `ui_islands` hook; Insights
ships `insights.dashboard` and `insights.chart`.
_Avoid_: widget, block, embed (embed = the public iframe-sharing feature)

**Chrome**:
Everything around a plot: the card, the title, the actions, the legend, the tooltip,
and the loading, error and empty states. frappe-ui charts v2 owns it for every
Insights chart without exception, so a chart on a desk page reads as one of the
family it sits beside. See ADR-0002.
_Avoid_: frame, shell, container

**Plot**:
The picture inside the chrome — the marks that carry the data. The only part that
varies by chart type, and it has three fillers: a charts v2 component, an Insights
plot built on v2's `useChart` (Map), or none at all (Table).
_Avoid_: graph, canvas, visual

**Adapter**:
The one module that turns a stored Chart config and a query result into the props of
a charts v2 component (`frontend/src2/charts/adapter/`). One pure function per chart
type. Insights builds no ECharts option for a type v2 admits.
_Avoid_: mapper, translator, transformer

**Standard workbook**:
The unit an app ships analytics in — a workbook, shipped as an
`insights/<folder>/` folder holding one JSON file per named item in typed
subfolders (`query/`, `chart/`, `dashboard/`), plus a `workbook.json`
(title, `required_apps`, `format_version`). The folder name is the workbook's
identity: `{app}/{folder}` is its Standard ID. Item names stay flat across an
app. References inside the folder are logical names, never docnames.
_Avoid_: bundle (the retired name), template (the retired import-a-copy channel),
package

**Standard content**:
What a shipped workbook becomes on a site: real documents (the workbook and its
items), flagged `is_standard`, each identified by a Standard ID — synced on
migrate, so shipped content exists everywhere and a reference to it never
dangles. Read-only outside developer mode; a standard workbook admits only
standard items — a site that wants it different duplicates.
_Avoid_: imported workbook, shipped copy

**Standard ID**:
The `{app}/{name}` identity of a shipped document, stored in `standard_id` on
the workbook and the three content doctypes. The only reference currency across
the app boundary; docnames are site-local hashes and never cross it. Only
standard content has one.
_Avoid_: logical id (the retired name)

**Logical name**:
The bare `{name}` half of a Standard ID, as written inside a shipped folder's
files. A reference from one item of a workbook to another is a logical name.
Sync resolves it against the shipping app into a Standard ID. It is a live term,
distinct from Standard ID, and it never crosses an app boundary on its own.
_Avoid_: using it for the cross-app identity — that is the Standard ID

**Closure**:
Everything a dashboard needs to stand alone: the dashboard, the charts its items
name, and the queries those charts read. `dashboard_closure` walks it. Export to
app and Duplicate both copy a closure, through the same walk, so the two paths
cannot drift.
_Avoid_: dependency tree, package

**Library**:
The browser for standard content — a dialog listing the shipped workbooks a site
has, with Duplicate as its one action. "Library" is the user-facing word and the
preferred one. The Python calls the same thing `gallery`
(`standard_content.gallery`, `api/standard_content.py`). Both names are live for
one thing.
_Avoid_: gallery in the UI and in frontend code, template gallery (the retired
import-a-copy channel), marketplace

**Slug**:
A dashboard's readable URL handle (`sales-performance`), assigned once and only
ever used from outside. The resolver accepts it beside the Standard ID and the
docname; nothing internal references it.
_Avoid_: route, permalink

### Sharing & governance

**Visibility**:
A chart's or dashboard's declared audience — who may view it, on any surface.
A strict ladder: `Private | Specific Roles | Everyone | Public`, declared as
fields on the content. View-only; editing is governed separately.
_Avoid_: sharing (person-level DocShare is the `Private` rung, not a separate axis)

**Rung**:
One step of the visibility ladder. The four rungs are `Private`,
`Specific Roles`, `Everyone` and `Public`, from the narrowest reach to the
widest. The ladder is strict, so a wider rung admits everyone a narrower one
admits. No rung grants write or share, and no rung reads the `Insights User`
role.
_Avoid_: level, tier

**Audience**:
The people a rung admits — who may read this chart or dashboard. The mechanism
is the **visibility ladder**, named for the `visibility` field it reads. "Ladder"
is the head noun, and "visibility ladder" is the one name for it. "Audience"
names the people, never the mechanism.
_Avoid_: audience ladder, sharing list

**Seat**:
The right to enter the builder at all, answered by `check_app_permission` for
the app rather than for a document. Viewing never consults it: a reader with no
Insights role reaches a dashboard through the ladder. Editing needs both a seat
and write rights on the document, and `can_edit` in `api/viewer.py` is the one
place that joins them.
_Avoid_: license, viewer role

**Door**:
One of the two API entrances to chart data. The viewer door
(`insights/api/viewer.py`) is guest-callable and answers with rows only. The
authoring door (`insights/api/authoring.py`) also answers with the derived
operations and the SQL that ran, so it needs a seat. The door a request came
through decides what the answer may carry.
_Avoid_: endpoint group, channel

**Gate**:
The checks a door makes before it answers. The authoring gate is a seat plus
read on the source query. A test can be a gate too: the vocabulary gate
(`insights/tests/test_vocabulary.py`) fails the build on a retired word.
_Avoid_: guard, barrier

**Data Authority**:
What a chart declares about whose permissions filter its rows: `Viewer`
(default — it names nobody, so the execution keeps the **permission user** it
already runs as) or `Author` (the owner, for whole numbers an audience is
curated for). Declared on the content, resolved to a permission user, enforced
by the engine.
_Avoid_: permission mode, run-as

**Permission User**:
Whose permissions filter the rows an execution returns, when the caller's own
cannot. A public link runs as Guest, a preview as Guest with a key, an alert as
Administrator — so each names a user, recorded on the content when it was
published or enabled. Empty means the viewer decides the rows. A chart's
**data authority** is one of the things that names one.
_Avoid_: permission mode, run-as, impersonation

**Team**:
A named group of users that grants access to resources (data sources, tables).

**Resource Permission**:
A grant tying a team to one specific resource.

**Alert**:
A scheduled check on a query's results that notifies recipients over a channel when its
condition is met.

**Channel**:
How an alert reaches its recipients: email, Telegram or a webhook. A webhook posts to a
URL the user supplies, which is why outbound requests carry an address policy — see
`docs/adr/outbound-http-to-user-chosen-urls.md`.
