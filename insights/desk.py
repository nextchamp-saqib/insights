# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""How Insights draws a desk `Dashboard` and a desk `Dashboard Chart`.

Framework offers the seam (`frappe.desk.island_renderer`): a renderer takes the
desk document and returns either `None` or the island that draws it. Framework
reads no field of ours, so what makes a desk document ours is this module's
choice, and it is one Custom Field per doctype holding a link to the Insights
content.

The field is a real `Link`, not a Standard ID in a `Data` field, because standard
content sync updates a shipped document in place and never re-keys it
(`standard_content._apply`), so a docname a site stores stays the right one. Sync
also deletes with `force=True`, so a link from desk can never block a re-sync.

A renderer decides who draws, never who may read. The desk document's own
permission already gated the load, and the island draws its own not-permitted
state for the Insights content behind it. So there is no permission check here:
one route must not behave like two different routes for two readers.
"""

from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from insights.resolver import CHART, DASHBOARD

# desk doctype -> the Custom Field that points it at Insights content, and the
# island that then draws it. One entry is the whole of a desk doctype's
# involvement, so a third one is a row here and a hook in `hooks.py`.
DESK_RENDERERS = {
    "Dashboard": {
        "fieldname": "insights_dashboard",
        "label": "Insights Dashboard",
        "options": DASHBOARD,
        "insert_after": "dashboard_name",
        "island": "insights.dashboard",
        "prop": "dashboard",
    },
    "Dashboard Chart": {
        "fieldname": "insights_chart",
        "label": "Insights Chart",
        "options": CHART,
        "insert_after": "chart_name",
        "island": "insights.chart",
        "prop": "chart",
    },
}


def render(doc) -> dict | None:
    """The island that draws `doc`, or None if Insights does not draw it.

    Both desk hooks name this one method. The doctype it was called for is on the
    document, so a per-doctype entry point would only be a second name for the
    same lookup.
    """
    field = DESK_RENDERERS.get(doc.doctype)
    if not field:
        return None

    reference = doc.get(field["fieldname"])
    if not reference:
        return None

    return {"island": field["island"], "props": {field["prop"]: reference}}


def install_custom_fields() -> None:
    """Add the fields a desk document claims Insights content with.

    Idempotent, and run on every migrate: the fields are ours on doctypes that
    are not, so nothing else puts them back if a site loses them.
    """
    create_custom_fields(
        {
            doctype: [
                {
                    "fieldname": field["fieldname"],
                    "label": field["label"],
                    "fieldtype": "Link",
                    "options": field["options"],
                    "insert_after": field["insert_after"],
                }
            ]
            for doctype, field in DESK_RENDERERS.items()
        }
    )
