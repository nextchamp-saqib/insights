import frappe

from insights.permission_user import may_run_as
from insights.permissions import workbook_of
from insights.upgrade import add_item

ALERT = "Insights Alert"
WORKBOOK = "Insights Workbook"


def execute():
    """Run an alert as its workbook's owner where its enabler may not.

    Insights 3 sent an alert as whoever turned it on. Insights 4 also needs that
    user to edit the alert's workbook, and stops the alert at its next run
    otherwise. After the shares above, an enabler who made something in the
    workbook can. One who cannot would stop a running alert, so it runs as the
    workbook's owner, and an admin is told whose rows it reads now. Where the
    owner cannot run it either, it is reported before it stops.
    """
    for alert in frappe.get_all(
        ALERT, filters={"disabled": 0}, fields=["name", "title", "query", "permission_user"]
    ):
        enabler = alert.permission_user
        if enabler and may_run_as(ALERT, alert.name, enabler):
            continue

        workbook = workbook_of(frappe._dict(alert, doctype=ALERT))
        owner = workbook and frappe.db.get_value(WORKBOOK, workbook, "owner")
        if owner and may_run_as(ALERT, alert.name, owner):
            frappe.db.set_value(ALERT, alert.name, "permission_user", owner, update_modified=False)
            message = (
                f'Alert "{alert.title}" now runs as {owner}, who owns its workbook, and checks the rows {owner} '
                f"can see. It ran as {enabler or 'nobody'}, who turned it on but cannot edit the workbook, and "
                "Insights 4 stops an alert whose user cannot."
            )
        else:
            message = (
                f'Alert "{alert.title}" will stop at its next run: {enabler or "nobody"}, who turned it on, '
                "cannot edit its workbook, and neither can the workbook's owner. Share the workbook with an "
                "editor and turn the alert off and on again as them."
            )
        add_item("P19", message, reference=(ALERT, alert.name))
