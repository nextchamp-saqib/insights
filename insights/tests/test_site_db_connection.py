from unittest.mock import Mock, patch

import frappe

from insights.insights.doctype.insights_data_source_v3.connectors.frappe_db import (
    get_primary_data_source,
    get_replica_data_source,
    get_sitedb_connection,
)
from insights.tests.base import InsightsIntegrationTestCase


def sitedb_connect_kwargs():
    captured = {}

    def record(**kwargs):
        captured.update(kwargs)
        return Mock()

    with patch("ibis.mysql.connect", side_effect=record):
        get_sitedb_connection()
    return captured


class TestSiteDBConnection(InsightsIntegrationTestCase):
    # @feature data-source.connect-mariadb
    def test_the_site_database_is_read_as_the_user_the_framework_connected_as(self):
        with patch.object(frappe.local.db, "user", "site_reader"):
            site = get_primary_data_source()

        self.assertEqual(site.username, "site_reader")
        self.assertEqual(site.database_name, frappe.local.db.cur_db_name)

    # @feature data-source.connect-mariadb
    def test_a_site_reached_over_a_socket_is_read_over_it(self):
        with patch.object(frappe.local.db, "socket", "/run/mysqld/mysqld.sock"):
            kwargs = sitedb_connect_kwargs()

        self.assertEqual(kwargs["unix_socket"], "/run/mysqld/mysqld.sock")

    # @feature data-source.connect-mariadb
    def test_a_replica_is_not_read_over_the_primarys_socket(self):
        with (
            patch.object(frappe.local.db, "socket", "/run/mysqld/mysqld.sock"),
            patch.dict(frappe.local.conf, {"replica_host": "replica.internal"}),
        ):
            replica = get_replica_data_source()

        self.assertEqual(replica.host, "replica.internal")
        self.assertIsNone(replica.socket)
