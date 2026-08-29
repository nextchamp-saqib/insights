import frappe
from frappe.desk.form.load import getdoc
from frappe.utils.island import get_ui_islands

from insights.desk import DESK_RENDERERS, install_custom_fields, render
from insights.tests.base import InsightsIntegrationTestCase
from insights.tests.factories import (
    create_test_chart,
    create_test_dashboard,
    create_test_query,
    create_test_workbook,
)

AUTHOR = "Administrator"
DESK_DASHBOARD = "Desk Renderer Test Dashboard"
DESK_CHART = "Desk Renderer Test Chart"


class TestDeskRenderer(InsightsIntegrationTestCase):
    SAVEPOINT = "test_desk_renderer"

    @classmethod
    def before_class(cls):
        install_custom_fields()

        workbook = create_test_workbook(AUTHOR, title="Desk Renderer Test Workbook")
        query = create_test_query(AUTHOR, workbook.name)
        cls.chart = create_test_chart(AUTHOR, workbook.name, query.name)
        cls.dashboard = create_test_dashboard(AUTHOR, workbook.name, chart=cls.chart.name)

    @classmethod
    def after_class(cls):
        for doctype in ("Dashboard", "Dashboard Chart"):
            for name in frappe.get_all(
                doctype, filters={"name": ["like", "Desk Renderer Test%"]}, pluck="name"
            ):
                frappe.delete_doc(doctype, name, force=True)

        frappe.delete_doc("Insights Workbook", cls.dashboard.workbook, force=True)

    def desk_dashboard(self, insights_dashboard=None):
        return frappe.get_doc(
            {
                "doctype": "Dashboard",
                "dashboard_name": DESK_DASHBOARD,
                "insights_dashboard": insights_dashboard,
            }
        ).insert()

    def desk_chart(self, insights_chart=None):
        return frappe.get_doc(
            {
                "doctype": "Dashboard Chart",
                "chart_name": DESK_CHART,
                "chart_type": "Count",
                "document_type": "ToDo",
                "based_on": "creation",
                "filters_json": "[]",
                "insights_chart": insights_chart,
            }
        ).insert()

    def onload_of(self, doctype, name):
        frappe.local.response = frappe._dict({"docs": []})
        getdoc(doctype, name)
        return frappe.response.docs[0].get("__onload") or {}

    def test_island_names_are_registered(self):
        islands = get_ui_islands()
        for field in DESK_RENDERERS.values():
            self.assertIn(field["island"], islands)

    def test_custom_fields_are_installed(self):
        for doctype, field in DESK_RENDERERS.items():
            custom_field = frappe.get_doc("Custom Field", {"dt": doctype, "fieldname": field["fieldname"]})
            self.assertEqual(custom_field.fieldtype, "Link")
            self.assertEqual(custom_field.options, field["options"])

    def test_dashboard_without_a_link_is_not_ours(self):
        self.assertIsNone(render(self.desk_dashboard()))

    def test_dashboard_with_a_link_is_drawn_by_the_dashboard_island(self):
        doc = self.desk_dashboard(self.dashboard.name)
        self.assertEqual(
            render(doc),
            {"island": "insights.dashboard", "props": {"dashboard": self.dashboard.name}},
        )

    def test_chart_with_a_link_is_drawn_by_the_chart_island(self):
        doc = self.desk_chart(self.chart.name)
        self.assertEqual(
            render(doc),
            {"island": "insights.chart", "props": {"chart": self.chart.name}},
        )

    def test_chart_without_a_link_is_not_ours(self):
        self.assertIsNone(render(self.desk_chart()))

    def test_the_answer_rides_onload_through_getdoc(self):
        name = self.desk_dashboard(self.dashboard.name).name
        self.assertEqual(
            self.onload_of("Dashboard", name)["island_renderer"],
            {"island": "insights.dashboard", "props": {"dashboard": self.dashboard.name}},
        )

    def test_a_dashboard_we_do_not_draw_carries_no_key(self):
        name = self.desk_dashboard().name
        # absence is the answer desk falls back on, so an empty renderer would
        # read as "an island draws this" and leave the page blank
        self.assertNotIn("island_renderer", self.onload_of("Dashboard", name))
