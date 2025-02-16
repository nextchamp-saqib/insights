# Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class InsightsChartv3(Document):
    # begin: auto-generated types
    # This code is auto-generated. Do not modify anything in this block.

    from typing import TYPE_CHECKING

    if TYPE_CHECKING:
        from frappe.types import DF

        chart_type: DF.Data | None
        config: DF.JSON | None
        is_public: DF.Check
        name: DF.Int | None
        operations: DF.JSON | None
        query: DF.Link | None
        title: DF.Data | None
        use_live_connection: DF.Check
        workbook: DF.Link | None
    # end: auto-generated types

    def before_save(self):
        if isinstance(self.config, dict):
            self.config = frappe.as_json(self.config)
        if isinstance(self.operations, list):
            self.operations = frappe.as_json(self.operations)
