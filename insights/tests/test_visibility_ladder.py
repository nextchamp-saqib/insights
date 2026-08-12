import frappe

from insights.permissions import (
    RUNGS,
    get_permission_query_conditions,
    has_doc_permission,
)
from insights.tests.base import InsightsIntegrationTestCase
from insights.tests.factories import (
    DT,
    create_test_chart,
    create_test_dashboard,
    create_test_query,
    create_test_workbook,
    create_user,
    delete_users,
    delete_workbooks,
)

LADDER_ROLE = "Insights Ladder Test Role"

OWNER = "ladder_owner@test.com"
# holds an Insights role, but is not in any audience of the owner's content
INSIGHTS_PEER = "ladder_peer@test.com"
# holds LADDER_ROLE and nothing else - the desk-report persona
ROLE_HOLDER = "ladder_role_holder@test.com"
# holds no role at all - proves the viewing path never asks for `Insights User`
DESK_USER = "ladder_desk_user@test.com"
GUEST = "Guest"

WORKBOOK_TITLE = "Ladder Test Workbook"


def create_ladder_users():
    if not frappe.db.exists("Role", LADDER_ROLE):
        frappe.get_doc({"doctype": "Role", "role_name": LADDER_ROLE}).insert(ignore_permissions=True)

    create_user(OWNER, first_name="Ladder", last_name="Owner", roles="Insights User")
    create_user(INSIGHTS_PEER, first_name="Ladder", last_name="Peer", roles="Insights User")
    create_user(ROLE_HOLDER, first_name="Ladder", last_name="Role Holder", roles=LADDER_ROLE)
    create_user(DESK_USER, first_name="Ladder", last_name="Desk User")


def cleanup_ladder_fixtures():
    delete_workbooks(owners=[OWNER])
    delete_users(OWNER, INSIGHTS_PEER, ROLE_HOLDER, DESK_USER)
    if frappe.db.exists("Role", LADDER_ROLE):
        frappe.delete_doc("Role", LADDER_ROLE, force=True)


class TestVisibilityLadder(InsightsIntegrationTestCase):
    SAVEPOINT = "test_visibility_ladder"

    @classmethod
    def before_class(cls):
        cls.original_enable_permissions = frappe.db.get_single_value(DT.SETTINGS, "enable_permissions")
        frappe.db.set_single_value(DT.SETTINGS, "enable_permissions", 0)
        cleanup_ladder_fixtures()
        create_ladder_users()

    @classmethod
    def after_class(cls):
        frappe.db.set_single_value(DT.SETTINGS, "enable_permissions", cls.original_enable_permissions)
        cleanup_ladder_fixtures()

    # fixtures

    def make_content(self, link_chart_to_dashboard=False):
        workbook = create_test_workbook(OWNER, title=WORKBOOK_TITLE)
        query = create_test_query(OWNER, workbook.name, title="Ladder Test Query")
        chart = create_test_chart(OWNER, workbook.name, query.name, title="Ladder Test Chart")
        dashboard = create_test_dashboard(
            OWNER,
            workbook.name,
            chart.name if link_chart_to_dashboard else None,
            title="Ladder Test Dashboard",
        )
        return chart, dashboard

    def declare(self, doc, visibility, roles=None):
        doc.visibility = visibility
        doc.set("visible_to_roles", [{"role": role} for role in roles or []])
        doc.save(ignore_permissions=True)
        return frappe.get_doc(doc.doctype, doc.name)

    # assertions
    #
    # The audience rungs are read through the controller, the same entry point
    # `frappe.has_permission` calls. A user with no Insights role does not clear
    # the doctype level role check, so the doctype must also grant `read` to
    # `All` and `Guest` for the ladder to answer on the desk surface.

    def assert_can_read(self, user, doc):
        self.assertTrue(
            bool(has_doc_permission(doc, "read", user)),
            f"{doc.doctype} {doc.name} ({doc.visibility}) should be readable by {user}",
        )
        self.assertTrue(
            self.is_listed(user, doc.doctype, doc.name),
            f"{doc.doctype} {doc.name} ({doc.visibility}) should be listed for {user}",
        )

    def assert_cannot_read(self, user, doc):
        self.assertFalse(
            bool(has_doc_permission(doc, "read", user)),
            f"{doc.doctype} {doc.name} ({doc.visibility}) should not be readable by {user}",
        )
        self.assertFalse(
            self.is_listed(user, doc.doctype, doc.name),
            f"{doc.doctype} {doc.name} ({doc.visibility}) should not be listed for {user}",
        )

    def is_listed(self, user, doctype, name):
        """Whether the list conditions alone admit this document for this user.

        `is_visible` in `factories` goes through `get_list`, which also applies
        the doctype role check. A desk user here holds no Insights role, so the
        conditions have to be read on their own.
        """
        condition = get_permission_query_conditions(user, doctype)
        self.assertTrue(condition, f"{doctype} list access should stay narrowed for {user}")
        return bool(
            frappe.db.sql(
                f"select name from `tab{doctype}` where name = %s and {condition}",  # nosemgrep
                name,
            )
        )

    # the ladder, rung by rung

    def test_private_rung_admits_the_owner_only(self):
        for doc in self.make_content():
            doc = self.declare(doc, "Private")
            self.assert_can_read(OWNER, doc)
            for user in (INSIGHTS_PEER, ROLE_HOLDER, DESK_USER, GUEST):
                self.assert_cannot_read(user, doc)

    def test_private_rung_still_admits_a_docshare(self):
        for doc in self.make_content():
            doc = self.declare(doc, "Private")
            self.assert_cannot_read(INSIGHTS_PEER, doc)

            frappe.share.add(doc.doctype, doc.name, user=INSIGHTS_PEER, read=1, notify=0)
            self.assert_can_read(INSIGHTS_PEER, doc)
            self.assert_cannot_read(DESK_USER, doc)

    def test_specific_roles_rung_admits_the_named_roles_only(self):
        for doc in self.make_content():
            doc = self.declare(doc, "Specific Roles", roles=[LADDER_ROLE])
            self.assert_can_read(ROLE_HOLDER, doc)
            for user in (INSIGHTS_PEER, DESK_USER, GUEST):
                self.assert_cannot_read(user, doc)

    def test_everyone_rung_admits_any_logged_in_user(self):
        for doc in self.make_content():
            doc = self.declare(doc, "Everyone")
            for user in (INSIGHTS_PEER, ROLE_HOLDER, DESK_USER):
                self.assert_can_read(user, doc)
            self.assert_cannot_read(GUEST, doc)

    def test_public_rung_admits_guests(self):
        for doc in self.make_content():
            doc = self.declare(doc, "Public")
            for user in (INSIGHTS_PEER, ROLE_HOLDER, DESK_USER, GUEST):
                self.assert_can_read(user, doc)

    def test_no_rung_consults_the_insights_user_role(self):
        # DESK_USER holds no role, so an `Everyone` read proves the viewing
        # path never asks for `Insights User`
        self.assertNotIn("Insights User", frappe.get_roles(DESK_USER))
        for doc in self.make_content():
            self.assert_can_read(DESK_USER, self.declare(doc, "Everyone"))

    # the ladder is view only

    def test_ladder_grants_read_and_nothing_else(self):
        for visibility in ("Specific Roles", "Everyone", "Public"):
            for doc in self.make_content():
                doc = self.declare(doc, visibility, roles=[LADDER_ROLE])
                for user in (ROLE_HOLDER, DESK_USER, GUEST):
                    for ptype in ("write", "share", "delete"):
                        self.assertFalse(
                            bool(has_doc_permission(doc, ptype, user)),
                            f"{visibility} should not grant {ptype} to {user}",
                        )

    # widening the audience

    def make_writable_by_peer(self, doc):
        """A peer who may edit the document but was never given `share`."""
        doc = self.declare(doc, "Private")
        frappe.share.add(doc.doctype, doc.name, user=INSIGHTS_PEER, read=1, write=1, notify=0)
        return doc

    def set_visibility(self, user, doc, visibility):
        with self.as_user(user):
            writable = frappe.get_doc(doc.doctype, doc.name)
            writable.visibility = visibility
            writable.save()

    def test_widening_an_audience_needs_share_access(self):
        """Write must not imply publish: `visibility` is an ordinary field."""
        for doc in self.make_content():
            doc = self.make_writable_by_peer(doc)
            self.assertTrue(has_doc_permission(doc, "write", INSIGHTS_PEER))

            with self.assertRaises(frappe.PermissionError):
                self.set_visibility(INSIGHTS_PEER, doc, "Public")

            self.assertEqual(frappe.db.get_value(doc.doctype, doc.name, "visibility"), "Private")

    def test_every_widening_step_needs_share_access(self):
        """The rule is the move up, not the top rung."""
        for doc in self.make_content():
            doc = self.make_writable_by_peer(doc)
            for visibility in ("Specific Roles", "Everyone", "Public"):
                with self.assertRaises(frappe.PermissionError):
                    self.set_visibility(INSIGHTS_PEER, doc, visibility)

    def test_narrowing_an_audience_is_a_plain_write(self):
        """Coming back down takes nothing away from anybody."""
        for doc in self.make_content():
            doc = self.declare(doc, "Public")
            frappe.share.add(doc.doctype, doc.name, user=INSIGHTS_PEER, read=1, write=1, notify=0)

            self.set_visibility(INSIGHTS_PEER, doc, "Private")
            self.assertEqual(frappe.db.get_value(doc.doctype, doc.name, "visibility"), "Private")

    def test_an_owner_publishes_their_own(self):
        """Ownership carries `share`, so the author is not stopped."""
        for doc in self.make_content():
            doc = self.declare(doc, "Private")
            self.set_visibility(OWNER, doc, "Public")
            self.assertEqual(frappe.db.get_value(doc.doctype, doc.name, "visibility"), "Public")

    # the cascade

    def test_chart_inherits_the_dashboard_audience_downward_only(self):
        chart, dashboard = self.make_content(link_chart_to_dashboard=True)
        chart = self.declare(chart, "Private")
        dashboard = self.declare(dashboard, "Everyone")

        self.assert_can_read(DESK_USER, dashboard)
        self.assert_can_read(DESK_USER, chart)

        # a chart's own audience never reaches up to the dashboard
        dashboard = self.declare(dashboard, "Private")
        chart = self.declare(chart, "Everyone")

        self.assert_can_read(DESK_USER, chart)
        self.assert_cannot_read(DESK_USER, dashboard)

    def test_a_public_dashboard_carries_its_charts_to_a_guest(self):
        chart, dashboard = self.make_content(link_chart_to_dashboard=True)
        self.declare(chart, "Private")
        dashboard = self.declare(dashboard, "Public")

        self.assert_can_read(GUEST, dashboard)
        self.assert_can_read(GUEST, frappe.get_doc(chart.doctype, chart.name))

        dashboard = self.declare(dashboard, "Everyone")
        self.assert_cannot_read(GUEST, dashboard)
        self.assert_cannot_read(GUEST, frappe.get_doc(chart.doctype, chart.name))

    # the seam

    def test_ladder_answers_through_frappe_has_permission(self):
        for doc in self.make_content():
            doc = self.declare(doc, "Private")
            with self.as_user(INSIGHTS_PEER):
                self.assertFalse(frappe.has_permission(doc.doctype, ptype="read", doc=doc.name))

            doc = self.declare(doc, "Everyone")
            with self.as_user(INSIGHTS_PEER):
                self.assertTrue(frappe.has_permission(doc.doctype, ptype="read", doc=doc.name))
                self.assertFalse(frappe.has_permission(doc.doctype, ptype="write", doc=doc.name))

    def test_declared_rungs_match_the_schema(self):
        for doctype in (DT.CHART, DT.DASHBOARD):
            options = frappe.get_meta(doctype).get_field("visibility").options.split("\n")
            self.assertEqual(options, RUNGS)
