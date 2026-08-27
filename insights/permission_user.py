# Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Whose permissions filter the rows an execution returns.

The engine applies one user's permissions to the rows and columns it fetches.
Usually that is the caller. Two things make it somebody else.

Content declares it. `data_authority` on a chart says `Author` — the rows are the
author's, so a reader of the chart sees what the author would see — or `Viewer`,
which names nobody and leaves the execution filtering by whoever it already runs
as.

An unattended execution names it. The alert scheduler runs as Administrator and
has no caller at all, so the alert records who enabled it and runs as them.

The session user never changes, so `frappe.set_user` and what it does to
`form_dict` and `sid` stay out of the request.

This answers "whose rows", never "may this caller act". An authorization check
reads `frappe.session.user`, the same as it always did.
"""

from contextlib import contextmanager

import frappe

VIEWER = "Viewer"
AUTHOR = "Author"


def get_permission_user() -> str:
    """The user whose permissions the engine applies to the rows it fetches."""
    return getattr(frappe.local, "insights_permission_user", None) or frappe.session.user


@contextmanager
def permission_user(user: str):
    """Run the enclosed execution under `user`.

    An unattended execution has no viewer to fall back on, so refusing an empty
    user is the only safe reading of it. Content that predates the field is
    named by `insights.patches.backfill_permission_user`.
    """
    if not user:
        frappe.throw(
            frappe._("This content does not name a user to run as."),
            frappe.PermissionError,
        )

    previous = getattr(frappe.local, "insights_permission_user", None)
    frappe.local.insights_permission_user = user
    try:
        yield user
    finally:
        frappe.local.insights_permission_user = previous


def permission_user_for(doc) -> str:
    """The user the stored `doc` runs as.

    `Author` names the document owner. `Viewer` names nobody, so the execution
    keeps whoever it already runs as — the reader at the keyboard, or the user an
    alert already named. There is deliberately no third answer, and no way to
    pass an authority or a user in from the wire.

    Read from the row, never from the document in hand: `run_doc_method` builds
    that one out of the request payload, so a caller could otherwise hand us its
    own `data_authority` and `owner`.
    """
    declared = (
        frappe.db.get_value(doc.doctype, doc.name, ["data_authority", "owner"], as_dict=True)
        if doc.name
        else None
    )
    if declared and (declared.data_authority or VIEWER) == AUTHOR:
        return declared.owner

    # unsaved content included: the author is whoever is building it
    return get_permission_user()
