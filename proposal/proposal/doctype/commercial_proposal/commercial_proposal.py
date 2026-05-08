# Copyright (c) 2026, Belousov Dmitriy and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document
from frappe.model.document import Document
from frappe.model.naming import make_autoname

class CommercialProposal(Document):
    def autoname(self):
        prefix = (self.prefix or "PREFIX").strip().upper()
        work_type = (self.work_type or "TYPE").strip().upper()

        self.name = make_autoname(
            f"{prefix}/{work_type}/.YYYY./.MM./.#####"
        )
    def validate(self):
        self.calculate_totals()

    def calculate_totals(self):
        total = 0
        self.currency = self.currency or "UZS"

        for row in self.budget_lines:
            row.total_amount = (row.qty or 0) * (row.rate or 0)
            total += row.total_amount

        self.total_amount = total
