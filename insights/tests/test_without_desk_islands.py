import importlib
import runpy
from unittest.mock import patch

import insights.desk
from insights.tests.base import InsightsIntegrationTestCase


class TestWithoutDeskIslands(InsightsIntegrationTestCase):
    # @feature desk.without-islands
    def test_insights_stays_out_of_desk_on_a_frappe_without_islands(self):
        self.addCleanup(importlib.reload, insights.desk)
        with patch("insights.find_spec", return_value=None):
            hooks = runpy.run_module("insights.hooks")
            importlib.reload(insights.desk)

        for doctype in ("Dashboard", "Dashboard Chart", "Number Card"):
            self.assertNotIn(doctype, hooks["doc_events"])
            self.assertNotIn(doctype, hooks["has_permission"])
        self.assertNotIn("doctype_js", hooks)
        self.assertNotIn("extend_bootinfo", hooks)

        self.assertEqual(insights.desk.DESK_ISLANDS, {})
        self.assertFalse(insights.desk.can_show_charts_in_desk())
        self.assertEqual(insights.desk.claims_on("Insights Chart v3", {}), [])
        self.assertEqual(insights.desk.dangling_claims(), [])
        with patch.object(insights.desk, "create_custom_fields") as create_custom_fields:
            insights.desk.install_custom_fields()
        create_custom_fields.assert_called_once_with({})
