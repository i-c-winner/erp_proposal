# Copyright (c) 2026, Belousov Dmitriy and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class BudgetProposal(Document):
    def validate(self):
        self.calculate_totals()

    def calculate_totals(self):
        total = 0

        for row in self.budget_lines:
            row.total_amount = (row.qty or 0) * (row.rate or 0)
            total += row.total_amount

        self.total_amount = total
