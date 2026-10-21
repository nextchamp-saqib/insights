from unittest.mock import patch

import frappe

from insights.migrate import check_frappe
from insights.tests.base import InsightsIntegrationTestCase


class TestMigrate(InsightsIntegrationTestCase):
    # @feature upgrade.newer-frappe-required
    def test_install_and_migrate_stop_on_a_frappe_without_desk_islands(self):
        hooks = frappe.get_hooks()
        self.assertIn("insights.migrate.check_frappe", hooks.before_install)
        self.assertIn("insights.migrate.check_frappe", hooks.before_migrate)

        check_frappe()
        with patch("insights.migrate.find_spec", return_value=None):
            self.assertRaises(frappe.ValidationError, check_frappe)
