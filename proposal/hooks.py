app_name = "proposal"
app_title = "Proposal"
app_publisher = "Belousov Dmitriy"
app_description = "Создание коммерческих предложений для Ecklet"
app_email = "d-belousov@hotmail.com"
app_license = "mit"


# your_app/hooks.py

node_socketio = "proposal/socketio/index.js"
# Apps
# ------------------

required_apps = ["erpnext"]

fixtures = [
    {
        "dt": "Workflow State",
        "filters": [["name", "in", [
            "Budget Pending",
            "Budget Pending Approval",
            "Budget Approved",
            "Proposal Pending",
            "Approval",
            "Final Approval",
            "Archived",
            "Rejected"
        ]]]
    },
    {
        "dt": "Workflow Action Master",
        "filters": [["name", "in", [
            "Submit Budget",
            "Approve Budget",
            "Reject Budget",
            "Submit Commercial",
            "Approve Commercial",
            "Reject Commercial",
            "Final Approve",
            "Archive",
            "Return From Archive"
        ]]]
    },
    # Custom Fields модуля Proposal
    {
        "dt": "Custom Field",
        "filters": [["module", "=", "Proposal"]]
    },
    # Property Setters модуля Proposal
    {
        "dt": "Property Setter",
        "filters": [["module", "=", "Proposal"]]
    },
    # Print Formats модуля Proposal
    {
        "dt": "Print Format",
        "filters": [["module", "=", "Proposal"]]
    },
    # Client Scripts модуля Proposal
    {
        "dt": "Client Script",
        "filters": [["module", "=", "Proposal"]]
    },
    # Server Scripts — фильтр по name (module не существует)
    {
        "dt": "Server Script",
        "filters": [["reference_doctype", "like", "%"]]
    },
    # Notifications модуля Proposal
    {
        "dt": "Notification",
        "filters": [["module", "=", "Proposal"]]
    },
    # Workflow — фильтр по document_type
    {
        "dt": "Workflow",
        "filters": [["is_active", "=", 1]]
    },
    # DocType модуля Proposal
    {
        "dt": "DocType",
        "filters": [["module", "=", "Proposal"]]
    },
]
# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "proposal",
# 		"logo": "/assets/proposal/logo.png",
# 		"title": "Proposal",
# 		"route": "/proposal",
# 		"has_permission": "proposal.api.permission.has_app_permission"
# 	}
#





# Includes in <head>
# ------------------

# include js, css files in header of desk.html
app_include_css = "/assets/proposal/css/notification_badge.css"
app_include_js = "/assets/proposal/js/notification_badge.js"


# include js, css files in header of web template
# web_include_css = "/assets/proposal/css/proposal.css"
# web_include_js = "/assets/proposal/js/proposal.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "proposal/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "proposal/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# automatically load and sync documents of this doctype from downstream apps
# importable_doctypes = [doctype_1]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "proposal.utils.jinja_methods",
# 	"filters": "proposal.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "proposal.install.before_install"
# after_install = "proposal.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "proposal.uninstall.before_uninstall"
# after_uninstall = "proposal.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "proposal.utils.before_app_install"
# after_app_install = "proposal.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "proposal.utils.before_app_uninstall"
# after_app_uninstall = "proposal.utils.after_app_uninstall"

# Build
# ------------------
# To hook into the build process

# after_build = "proposal.build.after_build"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "proposal.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
# 	}
# }

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"proposal.tasks.all"
# 	],
# 	"daily": [
# 		"proposal.tasks.daily"
# 	],
# 	"hourly": [
# 		"proposal.tasks.hourly"
# 	],
# 	"weekly": [
# 		"proposal.tasks.weekly"
# 	],
# 	"monthly": [
# 		"proposal.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "proposal.install.before_tests"

# Extend DocType Class
# ------------------------------
#
# Specify custom mixins to extend the standard doctype controller.
# extend_doctype_class = {
# 	"Task": "proposal.custom.task.CustomTaskMixin"
# }

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "proposal.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "proposal.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["proposal.utils.before_request"]
# after_request = ["proposal.utils.after_request"]

# Job Events
# ----------
# before_job = ["proposal.utils.before_job"]
# after_job = ["proposal.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"proposal.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []
