import frappe
from frappe.utils.caching import redis_cache

from insights.api.data_sources import fetch_column_values
from insights.decorators import validate_type


def is_shared(doctype: str, name: str):
    if doctype == "Insights Dashboard v3":
        return is_shared_dashboard(name)
    if doctype == "Insights Chart v3":
        return is_shared_chart(name)
    if doctype == "Insights Query v3":
        return is_shared_query(name)

    return False


@validate_type
def is_shared_dashboard(name: str):
    return frappe.db.exists(
        "Insights Dashboard v3",
        {
            "name": name,
            "is_public": 1,
        },
    )


def get_shared_charts():
    charts = frappe.get_all(
        "Insights Chart v3",
        filters={"is_public": 1},
        pluck="name",
    )

    linked_public_charts = frappe.get_all(
        "Insights Dashboard v3",
        filters={"is_public": 1},
        pluck="linked_charts",
    )
    linked_public_charts = [
        frappe.parse_json(charts) for charts in linked_public_charts
    ]
    linked_public_charts = [
        chart for charts in linked_public_charts for chart in charts
    ]
    charts.extend(linked_public_charts)

    return charts


@validate_type
def is_shared_chart(name: str):
    is_public = frappe.db.exists(
        "Insights Chart v3",
        {
            "name": name,
            "is_public": 1,
        },
    )
    if is_public:
        return True

    return name in get_shared_charts()


@validate_type
def is_shared_query(name: str):
    # find a shared chart that is linked with this query
    linked_charts = frappe.get_all(
        "Insights Chart v3",
        or_filters=[
            ["query", "=", name],
            ["data_query", "=", name],
        ],
        pluck="name",
    )
    shared_charts = get_shared_charts()
    if any(chart in shared_charts for chart in linked_charts):
        return True

    return False


@frappe.whitelist(allow_guest=True)
def get_public_chart(public_key):
    if not public_key or not isinstance(public_key, str):
        frappe.throw("Public Key is required")

    chart_name = frappe.db.exists(
        "Insights Chart", {"public_key": public_key, "is_public": 1}
    )
    if not chart_name:
        frappe.throw("Invalid Public Key")

    chart = frappe.get_cached_doc("Insights Chart", chart_name).as_dict(
        no_default_fields=True
    )
    chart_data = frappe.get_cached_doc("Insights Query", chart.query).fetch_results()
    chart["data"] = chart_data
    return chart


@frappe.whitelist(allow_guest=True)
def get_public_dashboard_chart_data(public_key, *args, **kwargs):
    if not public_key or not isinstance(public_key, str):
        frappe.throw("Public Key is required")

    dashboard_name = frappe.db.exists(
        "Insights Dashboard", {"public_key": public_key, "is_public": 1}
    )
    if not dashboard_name:
        frappe.throw("Invalid Public Key")

    kwargs.pop("cmd")
    return frappe.get_cached_doc("Insights Dashboard", dashboard_name).fetch_chart_data(
        *args, **kwargs
    )


@frappe.whitelist(allow_guest=True)
@redis_cache()
def fetch_column_values_public(public_key, item_id, search_text=None):
    if not public_key or not isinstance(public_key, str):
        frappe.throw("Public Key is required")

    dashboard_name = frappe.db.exists(
        "Insights Dashboard", {"public_key": public_key, "is_public": 1}
    )
    if not dashboard_name:
        frappe.throw("Invalid Public Key")

    doc = frappe.get_doc("Insights Dashboard", dashboard_name)
    row = next((row for row in doc.items if row.item_id == item_id), None)
    if not row:
        frappe.throw("Invalid Item ID")

    options = frappe.parse_json(row.options)
    column = options.get("column")
    if not column:
        frappe.throw("Column not found in Item Options")

    return fetch_column_values(
        data_source=column.get("data_source"),
        table=column.get("table"),
        column=column.get("column"),
        search_text=search_text,
    )
