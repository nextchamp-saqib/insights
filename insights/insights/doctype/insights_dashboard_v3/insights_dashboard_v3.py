# Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class InsightsDashboardv3(Document):
    # begin: auto-generated types
    # This code is auto-generated. Do not modify anything in this block.

    from typing import TYPE_CHECKING

    if TYPE_CHECKING:
        from frappe.types import DF

        is_public: DF.Check
        items: DF.JSON | None
        preview_image: DF.Data | None
        share_link: DF.Data | None
        title: DF.Data | None
        workbook: DF.Link | None
    # end: auto-generated types

    def before_save(self):
        if isinstance(self.items, list):
            self.items = frappe.as_json(self.items)
