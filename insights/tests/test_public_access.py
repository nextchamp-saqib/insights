"""A link names what its author can read.

A chart's `query` and a dashboard's `linked_charts` are grants: the permission
queries in `insights.permissions` read a link as access. So a link is checked
where it is written, not where it is followed.
"""

import frappe

from insights.tests.base import InsightsIntegrationTestCase
from insights.tests.factories import (
    DT,
    create_test_chart,
    create_test_query,
    create_test_workbook,
    delete_users,
)
from insights.tests.permissions_utils import USER_1, USER_2, create_test_users

OWNER = USER_1
OTHER = USER_2


class TestLinkRequiresReadAccess(InsightsIntegrationTestCase):
    """A chart's query and a dashboard's charts are grants, so both are checked."""

    @classmethod
    def before_class(cls):
        create_test_users()
        cls.owner_workbook = create_test_workbook(OWNER, title="Owner Workbook").name
        cls.owner_query = create_test_query(OWNER, cls.owner_workbook, title="Owner Query").name
        cls.owner_chart = create_test_chart(
            OWNER, cls.owner_workbook, query=cls.owner_query, title="Owner Chart"
        ).name
        cls.other_workbook = create_test_workbook(OTHER, title="Other Workbook").name

    @classmethod
    def after_class(cls):
        for doctype, name in (
            (DT.WORKBOOK, cls.owner_workbook),
            (DT.WORKBOOK, cls.other_workbook),
        ):
            frappe.delete_doc(doctype, name, force=True, ignore_permissions=True)
        delete_users(OWNER, OTHER)

    def test_a_query_in_another_workbook_is_not_readable(self):
        """The baseline the rules below are measured against."""
        with self.as_user(OTHER):
            self.assertFalse(frappe.has_permission(DT.QUERY, ptype="read", doc=self.owner_query))

    def test_a_chart_cannot_link_an_unreadable_query(self):
        """A chart the caller owns makes its query readable, so the check cannot
        wait for the chart to be published."""
        with self.as_user(OTHER), self.assertRaises(frappe.PermissionError):
            frappe.get_doc(
                {
                    "doctype": DT.CHART,
                    "title": "Chart In Other Workbook",
                    "workbook": self.other_workbook,
                    "query": self.owner_query,
                    "chart_type": "Bar",
                    "config": {},
                }
            ).insert()

    def test_a_public_chart_cannot_link_an_unreadable_query(self):
        """Public in a single insert, so the check runs before the rung lands."""
        with self.as_user(OTHER), self.assertRaises(frappe.PermissionError):
            frappe.get_doc(
                {
                    "doctype": DT.CHART,
                    "title": "Public Chart In Other Workbook",
                    "workbook": self.other_workbook,
                    "query": self.owner_query,
                    "chart_type": "Bar",
                    "visibility": "Public",
                    "config": {},
                }
            ).insert()

    def test_an_existing_chart_cannot_be_repointed(self):
        """A link written on update is checked the same as one written on insert."""
        with self.as_user(OTHER):
            chart = frappe.get_doc(
                {
                    "doctype": DT.CHART,
                    "title": "Repointed Chart",
                    "workbook": self.other_workbook,
                    "chart_type": "Bar",
                    "config": {},
                }
            ).insert()
            chart.query = self.owner_query
            with self.assertRaises(frappe.PermissionError):
                chart.save()

    def test_a_dashboard_cannot_hold_an_unreadable_chart(self):
        """A chart on a dashboard the caller can read is readable, so naming one
        here is the same grant one level up.

        Written through `items`, which is what the client sends. `linked_charts`
        is derived from it, so a check that reads the stored rows would see the
        state before this save.
        """
        with self.as_user(OTHER), self.assertRaises(frappe.PermissionError):
            frappe.get_doc(
                {
                    "doctype": DT.DASHBOARD,
                    "title": "Dashboard In Other Workbook",
                    "workbook": self.other_workbook,
                    "items": [{"id": "chart-1", "type": "chart", "chart": self.owner_chart}],
                }
            ).insert()

    def test_a_dashboard_cannot_take_on_an_unreadable_chart(self):
        """The same on update: an existing dashboard gains an item."""
        with self.as_user(OTHER):
            dashboard = frappe.get_doc(
                {
                    "doctype": DT.DASHBOARD,
                    "title": "Growing Dashboard",
                    "workbook": self.other_workbook,
                    "items": [],
                }
            ).insert()
            dashboard.items = [{"id": "chart-1", "type": "chart", "chart": self.owner_chart}]
            with self.assertRaises(frappe.PermissionError):
                dashboard.save()

    def test_publishing_your_own_chart_still_works(self):
        """The query is readable, so the check the rules above make does not fire."""
        with self.as_user(OWNER):
            chart = frappe.get_doc(DT.CHART, self.owner_chart)
            chart.visibility = "Public"
            chart.save()

        self.assertEqual(frappe.db.get_value(DT.CHART, self.owner_chart, "visibility"), "Public")

    def test_publishing_your_own_dashboard_still_works(self):
        with self.as_user(OWNER):
            dashboard = frappe.get_doc(
                {
                    "doctype": DT.DASHBOARD,
                    "title": "Legitimate Dashboard",
                    "workbook": self.owner_workbook,
                    "items": [{"id": "chart-1", "type": "chart", "chart": self.owner_chart}],
                }
            ).insert()
            self.assertEqual([row.chart for row in dashboard.linked_charts], [self.owner_chart])
            dashboard.update_access(
                {"is_public": 1, "is_shared_with_organization": 0, "people_with_access": []}
            )
            self.assertTrue(frappe.db.get_value(DT.DASHBOARD, dashboard.name, "is_public"))
