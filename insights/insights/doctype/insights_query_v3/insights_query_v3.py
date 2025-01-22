# Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class InsightsQueryv3(Document):
    # begin: auto-generated types
    # This code is auto-generated. Do not modify anything in this block.

    from typing import TYPE_CHECKING

    if TYPE_CHECKING:
        from frappe.types import DF

        is_builder_query: DF.Check
        is_native_query: DF.Check
        is_script_query: DF.Check
        name: DF.Int | None
        operations: DF.JSON | None
        title: DF.Data
        use_live_connection: DF.Check
        workbook: DF.Link | None
    # end: auto-generated types

    pass

    def before_save(self):
        if isinstance(self.operations, list):
            self.operations = frappe.as_json(self.operations)
