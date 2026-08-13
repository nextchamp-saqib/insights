"""Does a chart's config derive the query the chart is meant to draw?

Every chart type has a case here, and a type with no case is a failure — this
is the only place that says what a config turns into, so a new chart type is
undrawable until it lands in `chart_derivation_fixtures`.

The cases used to be diffed against the queries the browser derived and the
shipped workbooks carried. That check did its job: the port matched, chart for
chart, so the browser's output was written into the fixtures and the caches it
came from are gone.

Read `insights/insights/doctype/insights_chart_v3/chart_query.py` for what is
being derived.
"""

import json
import unittest

from insights.insights.doctype.insights_chart_v3.chart_query import config_errors, derive_operations
from insights.tests.factories import chart_derivation_fixtures, derivation_case

CHART_TYPES = {
    "Bar",
    "Line",
    "Row",
    "Number",
    "Donut",
    "Funnel",
    "Table",
    "Map",
    "Bubble",
    "Sankey",
    "Heatmap",
}


def comparable(operations):
    """The operations, minus what says nothing about the query that runs.

    A fixture names its source query by name and leaves the workbook beside it
    at zero, the placeholder a query that is not on a site yet carries. The name
    is what resolves the reference, so the placeholder is all the comparison can
    ask for.
    """
    operations = json.loads(json.dumps(operations))
    for operation in operations:
        table = operation.get("table") or {}
        if "workbook" in table:
            table["workbook"] = 0
    return operations


class TestChartDerivation(unittest.TestCase):
    def test_every_chart_type_derives_the_operations_it_should(self):
        for case in chart_derivation_fixtures():
            with self.subTest(chart=case["title"]):
                self.assertEqual(
                    config_errors(case["chart_type"], case["query"], case["config"]),
                    [],
                    f"{case['title']} must be drawable",
                )
                derived = derive_operations(case["chart_type"], case["query"], case["config"])
                self.assertEqual(comparable(derived), comparable(case["operations"]))

    def test_every_chart_type_is_covered(self):
        """A derivation is only checked where a case exists, so count the types."""
        covered = {case["chart_type"] for case in chart_derivation_fixtures()}
        self.assertEqual(covered, CHART_TYPES)

    def test_a_config_that_names_no_columns_cannot_be_drawn(self):
        for chart_type in (
            "Bar",
            "Number",
            "Donut",
            "Funnel",
            "Table",
            "Map",
            "Bubble",
            "Sankey",
            "Heatmap",
        ):
            with self.subTest(chart_type=chart_type):
                self.assertTrue(config_errors(chart_type, "some-query", {}))

        self.assertTrue(config_errors("Bar", "", {}), "a chart with no source query")
        self.assertTrue(config_errors("Treemap", "some-query", {}), "an unknown chart type")

    def test_a_sankey_needs_a_source_a_target_and_a_value(self):
        case = derivation_case("Sankey")

        for slot in ("source_column", "target_column", "value_column"):
            with self.subTest(slot=slot):
                config = {**case["config"], slot: {}}
                self.assertTrue(config_errors("Sankey", case["query"], config))

    def test_a_heatmap_needs_two_dimensions_and_a_value(self):
        case = derivation_case("Heatmap")

        for slot in ("x_column", "y_column", "value_column"):
            with self.subTest(slot=slot):
                config = {**case["config"], slot: {}}
                self.assertTrue(config_errors("Heatmap", case["query"], config))

    def test_a_heatmap_cannot_cut_the_grid_by_one_column_twice(self):
        """Both cuts on one column collapses the grid to a diagonal line."""
        case = derivation_case("Heatmap")
        config = {**case["config"], "y_column": case["config"]["x_column"]}
        self.assertTrue(config_errors("Heatmap", case["query"], config))

    def test_a_heatmap_sorts_both_of_its_cuts(self):
        """The renderer draws each axis in the order rows name its categories, so
        the grid's order is the row order and the chart has to ask for it."""
        case = derivation_case("Heatmap")
        operations = derive_operations("Heatmap", case["query"], case["config"])
        sorts = [
            (op["column"]["column_name"], op["direction"]) for op in operations if op["type"] == "order_by"
        ]
        self.assertEqual(sorts, [("posting_date", "asc"), ("territory", "asc")])

    def test_a_heatmap_lets_the_config_turn_a_cut_around(self):
        """The chart's own sort is a default, not a rule: a config sorting the
        same column the other way moves that sort rather than adding a second."""
        case = derivation_case("Heatmap")
        config = {
            **case["config"],
            "order_by": [{"column": {"type": "column", "column_name": "posting_date"}, "direction": "desc"}],
        }
        operations = derive_operations("Heatmap", case["query"], config)
        sorts = [
            (op["column"]["column_name"], op["direction"]) for op in operations if op["type"] == "order_by"
        ]
        self.assertEqual(sorts, [("posting_date", "desc"), ("territory", "asc")])

    def test_a_config_whose_slots_hold_the_wrong_thing_is_reported_not_raised(self):
        """A slot names a column or a measure. One holding a bare string names nothing.

        Unconfigured means the config cannot derive, and a slot of the wrong kind
        is a config that cannot derive — so it comes back as an error the caller
        can show, the same as an empty slot, never as an exception out of the
        deriver.
        """
        drawable = {
            "x_axis": {"dimension": {"column_name": "status", "data_type": "String"}},
            "y_axis": {"series": []},
        }
        self.assertEqual(config_errors("Bar", "some-query", drawable), [])

        for slot, value in [
            ("x_axis", "status"),
            ("x_axis", {"dimension": "status"}),
            ("y_axis", ["count"]),
            ("y_axis", {"series": [{"measure": "count"}]}),
            ("filters", "status = 'Open'"),
            ("order_by", [{"column": "status", "direction": "asc"}]),
            ("rows", ["status"]),
        ]:
            with self.subTest(slot=slot, value=value):
                self.assertTrue(config_errors("Bar", "some-query", {**drawable, slot: value}))

        self.assertTrue(config_errors("Bar", "some-query", "status"), "a config that is not an object")
