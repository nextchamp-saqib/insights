import frappe

from insights.standard_content import WORKBOOK


def execute():
    """Flag the workbooks an app ships as standard content.

    The container workbook already carried its identity — `29a1e82f` moved that
    off a site global and onto the document — but not the flag that says what
    the identity means. Sync now reconciles the workbook like every other
    document it ships, and `is_standard` is what that pass reads to find the
    ones it owns: without the flag, a workbook shipped by an earlier release is
    invisible to the reconcile, which would create a second one beside it.

    The `standard_id` is the whole test. Only sync writes a `standard_id` on a
    workbook. A workbook that has one is shipped, and a workbook without one
    belongs to the site. A duplicate of shipped content is a user workbook, and
    it never carries one.

    Runs before the first sync on migrate, so the reconcile finds what is
    already there. A second run finds nothing left to flag.
    """
    shipped = frappe.get_all(
        WORKBOOK,
        filters={"standard_id": ("is", "set"), "is_standard": 0},
        pluck="name",
    )
    for name in shipped:
        frappe.db.set_value(WORKBOOK, name, "is_standard", 1, update_modified=False)

    if shipped:
        print(f"Insights: flagged {len(shipped)} shipped workbook(s) standard")
