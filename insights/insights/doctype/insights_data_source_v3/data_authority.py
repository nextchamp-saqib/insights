# Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Whose permissions filter a chart's rows at execution.

The authority is declared on the content document (`data_authority` on
`Insights Chart v3`) and read here. A request names the chart, the chart names
the authority — there is deliberately no way to pass an authority or a user in
from the wire.

`Viewer` names nobody, so the engine keeps applying whoever it already runs as.
`Author` names the document owner, and applies that permission context without
ever switching the session user.

The running user itself is `insights.permission_user`. This module only decides
which user a content document declares.
"""

from contextlib import contextmanager

import frappe

from insights.permission_user import get_permission_user, permission_user

VIEWER = "Viewer"
AUTHOR = "Author"


def get_authority_user() -> str:
    """The user whose permissions the engine applies to the rows it is fetching."""
    return get_permission_user()


def get_declared_authority_user(doctype: str, name: str | None) -> str | None:
    """The user the stored `doctype`/`name` document names, or None if it names nobody.

    Read straight from the database, never from an in-memory document: `run_doc_method`
    builds the document out of the request payload, so a caller could otherwise hand us
    its own `data_authority` and `owner`.
    """
    declaration = (
        frappe.db.get_value(doctype, name, ["data_authority", "owner"], as_dict=True) if name else None
    )
    if not declaration:
        # unsaved content — the author is whoever is building it
        return None

    if (declaration.data_authority or VIEWER) == AUTHOR:
        return declaration.owner

    return None


def get_authority_user_for(doctype: str, name: str | None) -> str:
    """The user whose permissions filter the rows of the stored `doctype`/`name`."""
    return get_declared_authority_user(doctype, name) or get_permission_user()


@contextmanager
def data_authority_of(doc):
    """Run the enclosed execution under the authority `doc` declares.

    `Viewer` declares nobody, so it leaves an execution that already named a user
    — a public link, a preview, an alert — running as that user rather than
    dropping it back to the caller.
    """
    declared = get_declared_authority_user(doc.doctype, doc.name)
    if not declared:
        yield get_permission_user()
        return

    with permission_user(declared) as running_as:
        yield running_as
