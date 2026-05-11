# Copyright (c) 2026, Belousov Dmitriy and contributors
# For license information, please see license.txt

import base64

import frappe
from frappe.model.document import Document
from frappe.model.naming import make_autoname
from frappe.utils.file_manager import save_file


STATUS_NOTIFICATIONS = {
    "Budget Pending": {
        "role": "Sales Manager",
        "subject": "Подготовить бюджет к коммерческому предложению {name}",
    },
    "Budget Pending Approval": {
        "role": "Sales Master Manager",
        "subject": "Согласовать бюджет {name}",
    },
    "Budget Approved": {
        "role": "Sales Manager",
        "subject": "Подготовить коммерческое предложение {name}",
    },
    "Proposal Pending": {
        "role": "Sales Master Manager",
        "subject": "Согласовать коммерческое предложение {name}",
    },
    "Final Approval": {
        "role": "Sales Manager",
        "subject": "Финальное утверждение прошло {name}",
    },
}

UNREAD_NOTIFICATIONS_CHANGED_EVENT = "proposal_unread_notifications_changed"


class CommercialProposal(Document):
    def before_insert(self):
        if self.status == "Draft":
            self.status = "Budget Pending"

    def after_insert(self):
        self.attach_budget_template()
        self.notify_for_status()

    def attach_budget_template(self):
        """Attach a copy of the default budget template when a new document is created."""
        if self.budget:
            return
        try:
            import os
            template_path = get_budget_template_path()
            frappe.logger().info(f"[Budget] template_path={template_path}, exists={os.path.exists(template_path)}")
            if not template_path or not os.path.exists(template_path):
                frappe.log_error("Budget template file not found", "Budget Template")
                return
            safe_name = self.name.replace("/", "-")
            with open(template_path, "rb") as f:
                content = f.read()
            file_doc = save_file(
                fname=f"budget_{safe_name}.xlsx",
                content=content,
                dt="Commercial Proposal",
                dn=self.name,
                df="budget",
                is_private=0,
                decode=False,
            )
            frappe.db.set_value(
                "Commercial Proposal", self.name, "budget", file_doc.file_url, update_modified=False
            )
            frappe.logger().info(f"[Budget] template attached: {file_doc.file_url}")
        except Exception:
            frappe.log_error(frappe.get_traceback(), "Budget Template Attach Error")

    def on_update(self):
        if self.has_value_changed("status"):
            self.notify_for_status()

    def autoname(self):
        prefix = (self.prefix or "PREFIX").strip().upper()
        work_type = (self.work_type or "TYPE").strip().upper()

        self.name = make_autoname(
            f"{prefix}/{work_type}/.YYYY./.MM./.#####"
        )

    def validate(self):
        self.validate_budget_file()
        if self.budget and self.has_value_changed("budget"):
            self.sync_budget_cells_to_doc()
        self.calculate_totals()

    def validate_budget_file(self):
        if self.budget:
            file_path = self.budget.lower()
            if not (file_path.endswith(".xlsx") or file_path.endswith(".xls")):
                frappe.throw(
                    frappe._("Only Excel files (.xlsx, .xls) are allowed in the Budget field.")
                )

        # Prevent replacing the budget file with a manually uploaded one.
        # Allowed changes: null → file (initial attach) or same prefix (editor save).
        if self.has_value_changed("budget") and self.get_doc_before_save():
            old = (self.get_doc_before_save().budget or "").rsplit("/", 1)[-1]
            new = (self.budget or "").rsplit("/", 1)[-1]
            # Editor-saved files share the base name (budget_<safe_name>.xlsx or budget_<safe_name>-N.xlsx)
            base = f"budget_{self.name.replace('/', '-')}"
            if old and new and not new.startswith(base):
                frappe.throw(
                    frappe._("The Budget file cannot be replaced with a different file. Use the Edit Budget button to modify it.")
                )

    def sync_budget_cells_to_doc(self):
        """Read B2 → total_amount, C2 → currency from the attached budget file."""
        file_path = resolve_file_path(self.budget)
        if not file_path:
            return
        values = read_budget_cells(file_path)
        if "total_amount" in values:
            self.total_amount = values["total_amount"]
        if "currency" in values:
            self.currency = values["currency"]

    def calculate_totals(self):
        total = 0
        self.currency = self.currency or "UZS"

        for row in self.budget_lines:
            row.total_amount = (row.qty or 0) * (row.rate or 0)
            total += row.total_amount

        self.total_amount = total

    def notify_for_status(self):
        notification = STATUS_NOTIFICATIONS.get(self.status)
        if not notification:
            return

        users = get_users_with_role(notification["role"])
        if not users:
            return

        subject = notification["subject"].format(name=self.name)
        for user in users:
            create_notification_log(self, user, subject)


def get_users_with_role(role):
    users = frappe.get_all(
        "Has Role",
        filters={"role": role, "parenttype": "User"},
        pluck="parent",
    )
    if not users:
        return []

    return frappe.get_all(
        "User",
        filters={"name": ("in", users), "enabled": 1},
        pluck="name",
    )


def create_notification_log(doc, user, subject):
    if notification_exists(doc, user, subject):
        return

    notification = frappe.new_doc("Notification Log")
    notification.update(
        {
            "subject": subject,
            "for_user": user,
            "from_user": frappe.session.user,
            "type": "Alert",
            "document_type": doc.doctype,
            "document_name": doc.name,
            "email_content": subject,
        }
    )
    notification.insert(ignore_permissions=True)
    frappe.publish_realtime(
        UNREAD_NOTIFICATIONS_CHANGED_EVENT,
        user=user,
        after_commit=True,
    )
    frappe.publish_realtime(
        "proposal_notification",
        {
            "document_type": doc.doctype,
            "document_name": doc.name,
            "subject": subject,
        },
        user=user,
        after_commit=True,
    )


def notification_exists(doc, user, subject):
    return frappe.db.exists(
        "Notification Log",
        {
            "for_user": user,
            "subject": subject,
            "document_type": doc.doctype,
            "document_name": doc.name,
        },
    )


def get_budget_template_path():
    """Return absolute path to the budget template xlsx, creating it if it doesn't exist."""
    import os
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment

    # Use absolute path — frappe.get_site_path() can return a relative path
    template_dir = frappe.get_site_path("private", "files")
    template_dir = os.path.abspath(template_dir)
    os.makedirs(template_dir, exist_ok=True)
    template_path = os.path.join(template_dir, "budget_template.xlsx")

    if not os.path.exists(template_path):
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Budget"

        header_font = Font(bold=True)
        header_fill = PatternFill(start_color="D9E1F2", end_color="D9E1F2", fill_type="solid")

        headers = ["Description", "Total Amount", "Currency", "Notes"]
        for ci, h in enumerate(headers, start=1):
            cell = ws.cell(row=1, column=ci, value=h)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center")

        ws["A2"] = "Total"
        ws["B2"] = 0        # → total_amount
        ws["C2"] = "UZS"    # → currency

        ws.column_dimensions["A"].width = 20
        ws.column_dimensions["B"].width = 18
        ws.column_dimensions["C"].width = 12
        ws.column_dimensions["D"].width = 30

        wb.save(template_path)

    return template_path


def resolve_file_path(file_url):
    """Convert a Frappe file URL to an absolute path on disk."""
    import os

    if not file_url:
        return None
    site_path = frappe.get_site_path()
    if file_url.startswith("/private/"):
        path = os.path.join(site_path, file_url.lstrip("/"))
    elif file_url.startswith("/files/"):
        path = os.path.join(site_path, "public", file_url.lstrip("/"))
    else:
        return None
    return path if os.path.exists(path) else None


def read_budget_cells(file_path):
    """Return {total_amount, currency} read from B2 and C2 of the first sheet."""
    import openpyxl

    result = {}
    try:
        wb = openpyxl.load_workbook(file_path, data_only=True, read_only=True)
        ws = wb.active

        raw_total = ws["B2"].value
        raw_currency = ws["C2"].value

        if raw_total is not None:
            try:
                result["total_amount"] = float(raw_total)
            except (ValueError, TypeError):
                pass

        if raw_currency is not None:
            result["currency"] = str(raw_currency).strip()

        wb.close()
    except Exception:
        frappe.log_error(frappe.get_traceback(), "Budget cell sync error")

    return result


@frappe.whitelist()
def get_budget_file_content(docname):
    """Return base64-encoded content of the attached budget file."""
    import os

    doc = frappe.get_doc("Commercial Proposal", docname)
    frappe.has_permission("Commercial Proposal", "read", doc=doc, throw=True)

    if not doc.budget:
        frappe.throw(frappe._("No budget file attached."))

    file_url = doc.budget
    site_path = frappe.get_site_path()

    if file_url.startswith("/private/"):
        file_path = os.path.join(site_path, file_url.lstrip("/"))
    elif file_url.startswith("/files/"):
        file_path = os.path.join(site_path, "public", file_url.lstrip("/"))
    else:
        frappe.throw(frappe._("Unexpected file URL format: {0}").format(file_url))

    if not os.path.exists(file_path):
        frappe.throw(frappe._("File not found on disk: {0}").format(file_path))

    with open(file_path, "rb") as f:
        content_b64 = base64.b64encode(f.read()).decode("ascii")

    file_name = os.path.basename(file_path)
    return {"content_b64": content_b64, "file_name": file_name}


@frappe.whitelist()
def save_budget_file(docname, file_content_b64, file_name):
    """Receive base64-encoded Excel content from the in-app editor and persist it."""
    doc = frappe.get_doc("Commercial Proposal", docname)
    frappe.has_permission("Commercial Proposal", "write", doc=doc, throw=True)

    file_name = frappe.utils.sanitize_html(file_name or "budget.xlsx")
    if not (file_name.lower().endswith(".xlsx") or file_name.lower().endswith(".xls")):
        frappe.throw(frappe._("Only Excel files (.xlsx, .xls) are allowed."))

    file_data = base64.b64decode(file_content_b64)

    file_doc = save_file(
        fname=file_name,
        content=file_data,
        dt="Commercial Proposal",
        dn=docname,
        df="budget",
        is_private=0,
        decode=False,
    )

    # Guarantee the budget field is updated
    frappe.db.set_value(
        "Commercial Proposal", docname, "budget", file_doc.file_url, update_modified=False
    )

    # Sync B2 → total_amount, C2 → currency
    file_path = resolve_file_path(file_doc.file_url)
    if file_path:
        values = read_budget_cells(file_path)
        if values:
            frappe.db.set_value("Commercial Proposal", docname, values, update_modified=False)

    return file_doc.file_url


@frappe.whitelist()
def get_unread_notification_count():
    if frappe.session.user == "Guest":
        return 0

    return frappe.db.count(
        "Notification Log",
        filters={"for_user": frappe.session.user, "read": 0},
    )


@frappe.whitelist()
def get_notification_logs(limit=20):
    if frappe.session.user == "Guest":
        return {"notification_logs": [], "user_info": {}}

    notification_logs = frappe.get_all(
        "Notification Log",
        filters={"for_user": frappe.session.user},
        fields=["*"],
        order_by="creation desc",
        limit=int(limit or 20),
        ignore_permissions=True,
    )

    user_info = frappe._dict()
    for user in {log.from_user for log in notification_logs if log.from_user}:
        frappe.utils.add_user_info(user, user_info)

    return {"notification_logs": notification_logs, "user_info": user_info}


@frappe.whitelist()
def get_notification_debug():
    if frappe.session.user == "Guest":
        return {"user": "Guest", "unread_count": 0, "recent": []}

    return {
        "user": frappe.session.user,
        "unread_count": get_unread_notification_count(),
        "recent": frappe.get_all(
            "Notification Log",
            filters={"for_user": frappe.session.user},
            fields=["name", "for_user", "read", "subject", "creation"],
            order_by="creation desc",
            limit=5,
            ignore_permissions=True,
        ),
    }
