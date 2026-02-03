app_name = "surgishop_workspaces"
app_title = "SurgiShop Workspaces"
app_publisher = "SurgiShop"
app_description = "Custom workspaces for SurgiShop ERPNext"
app_email = "gary@surgishop.com"
app_license = "mit"
required_apps = ["erpnext"]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/surgishop_workspaces/css/surgishop_workspaces.css"
# app_include_js = "/assets/surgishop_workspaces/js/surgishop_workspaces.js"

# include js, css files in header of web template
# web_include_css = "/assets/surgishop_workspaces/css/surgishop_workspaces.css"
# web_include_js = "/assets/surgishop_workspaces/js/surgishop_workspaces.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "surgishop_workspaces/public/scss/website"

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
# app_include_icons = "surgishop_workspaces/public/icons.svg"

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
# generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "surgishop_workspaces.utils.jinja_methods",
# 	"filters": "surgishop_workspaces.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "surgishop_workspaces.install.before_install"
# after_install = "surgishop_workspaces.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "surgishop_workspaces.uninstall.before_uninstall"
# after_uninstall = "surgishop_workspaces.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "surgishop_workspaces.utils.before_app_install"
# after_app_install = "surgishop_workspaces.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "surgishop_workspaces.utils.before_app_uninstall"
# after_app_uninstall = "surgishop_workspaces.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "surgishop_workspaces.notifications.get_notification_config"

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

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
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
# 		"surgishop_workspaces.tasks.all"
# 	],
# 	"daily": [
# 		"surgishop_workspaces.tasks.daily"
# 	],
# 	"hourly": [
# 		"surgishop_workspaces.tasks.hourly"
# 	],
# 	"weekly": [
# 		"surgishop_workspaces.tasks.weekly"
# 	],
# 	"monthly": [
# 		"surgishop_workspaces.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "surgishop_workspaces.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "surgishop_workspaces.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "surgishop_workspaces.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["surgishop_workspaces.utils.before_request"]
# after_request = ["surgishop_workspaces.utils.after_request"]

# Job Events
# ----------
# before_job = ["surgishop_workspaces.utils.before_job"]
# after_job = ["surgishop_workspaces.utils.after_job"]

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
# 	"surgishop_workspaces.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }
