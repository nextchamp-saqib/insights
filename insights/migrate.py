# Copyright (c) 2022, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt


from importlib.util import find_spec

import frappe


def check_frappe():
    """Refuse to install or migrate on a Frappe without desk islands, which
    Insights v4 draws desk dashboards with.

    The Frappe pin in `pyproject.toml` only warns: bench carries on, and Frappe
    Cloud compares the major version. A module is checked, not a field, because
    `before_migrate` runs before the schema sync.
    """
    if not find_spec("frappe.utils.island"):
        frappe.throw(
            frappe._("Insights v4 needs a newer Frappe. Update Frappe, then try again."),
            title=frappe._("Frappe too old"),
        )


def after_migrate():
    try:
        create_admin_team()
    except Exception:
        frappe.log_error(title="Error creating Admin Team")

    try:
        from insights.desk import install_custom_fields

        install_custom_fields()
    except Exception:
        frappe.log_error(title="Error installing desk custom fields")

    sync_standard_workbooks()


def after_app_install(app: str):
    from insights import standard

    standard.import_shipped([app])


def sync_standard_workbooks():
    """Import the workbooks the installed apps ship, delete the ones no app ships
    any more and the members kept for a desk document that no longer uses them,
    then name each desk document left linking what went.
    """
    from insights import standard
    from insights.desk import report_dangling_claims
    from insights.insights.doctype.insights_workbook.insights_workbook import (
        delete_unclaimed_kept_members,
    )

    standard.import_shipped()
    standard.delete_unshipped()

    try:
        delete_unclaimed_kept_members()
    except Exception:
        frappe.log_error(title="Error deleting Insights content kept for desk documents")

    try:
        report_dangling_claims()
    except Exception:
        frappe.log_error(title="Error reporting desk documents that link missing Insights content")


def create_admin_team():
    if not frappe.db.exists("Insights Team", "Admin"):
        frappe.get_doc(
            {
                "doctype": "Insights Team",
                "team_name": "Admin",
                "team_members": [{"user": "Administrator"}],
            }
        ).insert(ignore_permissions=True)
