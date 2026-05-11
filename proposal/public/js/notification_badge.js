(function () {
	if (typeof window === "undefined") return;
	if (typeof window.jQuery !== "function") return;
	if (!window.frappe) return;

	const $ = window.jQuery;

	const PATCH_FLAG = "__proposal_notification_badge_patch_v1";
	const SIDEBAR_PATCH_FLAG = "__proposal_sidebar_notification_badge_patch_v1";
	const VIEW_PATCH_FLAG = "__proposal_notification_badge_view_patch_v1";
	const REALTIME_FLAG = "__proposal_notification_badge_realtime_v1";
	const INITIAL_SYNC_FLAG = "__proposal_notification_badge_initial_sync_v1";
	const SETUP_FLAG = "__proposal_notification_badge_setup_v1";
	const OBSERVER_KEY = "__proposal_notification_badge_observer_v1";
	const REALTIME_TIMER_KEY = "__proposal_notification_realtime_timer_v1";
	const OBSERVER_TIMER_KEY = "__proposal_notification_observer_timer_v1";
	const UNREAD_CHANGED_EVENT = "proposal_unread_notifications_changed";
	const MAX_REALTIME_TRIES = 30;
	const MAX_OBSERVER_TRIES = 20;

	let unread_notification_count = 0;
	let unread_check_in_progress = false;
	let pending_unread_check = false;
	let enhance_scheduled = false;
	let realtime_tries = 0;
	let observer_tries = 0;

	function is_desk_user() {
		return Boolean(
			window.frappe &&
				frappe.boot &&
				frappe.session &&
				frappe.session.user &&
				frappe.session.user !== "Guest"
		);
	}

	function safe_cint(value) {
		const n = parseInt(value, 10);
		return isNaN(n) ? 0 : n;
	}

	function enhance_notification_button() {
		const $button = $(".sidebar-notification");
		if (!$button.length) return;

		$button.addClass("notifications-icon");

		const $icon = $button.find(".sidebar-item-icon");
		if ($icon.length && !$icon.find(".proposal-notification-badge").length) {
			$icon.append('<span class="proposal-notification-badge" aria-hidden="true"></span>');
		}

		apply_indicator_state();
	}

	function schedule_enhance() {
		if (enhance_scheduled) return;
		enhance_scheduled = true;
		const fn = () => {
			enhance_scheduled = false;
			try {
				enhance_notification_button();
			} catch (e) {
				console.error("proposal notification badge:", e);
			}
		};
		if (typeof window.requestAnimationFrame === "function") {
			window.requestAnimationFrame(fn);
		} else {
			setTimeout(fn, 16);
		}
	}

	function apply_indicator_state() {
		const has_unread = unread_notification_count > 0;
		$(".sidebar-notification").toggleClass("proposal-has-unread-notifications", has_unread);
	}

	function set_unread_notification_count(count) {
		unread_notification_count = safe_cint(count);
		apply_indicator_state();
	}

	function get_notifications_view() {
		return frappe.app && frappe.app.sidebar && frappe.app.sidebar.notifications
			? frappe.app.sidebar.notifications.tabs && frappe.app.sidebar.notifications.tabs.notifications
			: null;
	}

	function refresh_notifications_dropdown() {
		const view = get_notifications_view();
		if (!view || typeof view.render_notifications_dropdown !== "function") return;

		frappe
			.call({
				method:
					"proposal.proposal.doctype.commercial_proposal.commercial_proposal.get_notification_logs",
				args: { limit: view.max_length || 20 },
			})
			.then(
				(r) => {
					if (!r || !r.message) return;
					view.dropdown_items = r.message.notification_logs || [];
					if (r.message.user_info && typeof frappe.update_user_info === "function") {
						frappe.update_user_info(r.message.user_info);
					}
					patch_notifications_view(view);
					view.container.empty();
					view.render_notifications_dropdown();
				},
				() => {}
			);
	}

	function patch_notifications_view(view) {
		if (!view || view[VIEW_PATCH_FLAG]) return;

		const original_mark_as_read = view.mark_as_read;
		if (typeof original_mark_as_read === "function") {
			view.mark_as_read = function () {
				const result = original_mark_as_read.apply(this, arguments);
				sync_indicator_state();
				return result;
			};
		}

		view[VIEW_PATCH_FLAG] = true;
	}

	function patch_existing_notifications_view() {
		patch_notifications_view(get_notifications_view());
	}

	function sync_indicator_state(delay) {
		setTimeout(handle_unread_notifications_changed, typeof delay === "number" ? delay : 700);
	}

	function handle_unread_notifications_changed() {
		check_unread_notifications({ refresh_dropdown: is_notifications_dropdown_open() });
	}

	function is_notifications_dropdown_open() {
		const $dropdown = $(".standard-items-sections .dropdown-notifications").first();
		return Boolean($dropdown.length && !$dropdown.hasClass("hidden"));
	}

	function patch_notifications() {
		if (!frappe.ui || !frappe.ui.Notifications) return;
		const proto = frappe.ui.Notifications.prototype;
		if (proto[PATCH_FLAG]) return;

		const original_make = proto.make;
		const original_make_tab_view = proto.make_tab_view;
		const original_mark_all_as_read = proto.mark_all_as_read;

		proto.make = function () {
			const result = original_make.apply(this, arguments);
			schedule_enhance();
			return result;
		};

		proto.make_tab_view = function (item) {
			const result = original_make_tab_view.apply(this, arguments);
			if (item && item.id === "notifications") {
				patch_notifications_view(this.tabs[item.id]);
			}
			return result;
		};

		if (typeof original_mark_all_as_read === "function") {
			proto.mark_all_as_read = function () {
				const result = original_mark_all_as_read.apply(this, arguments);
				sync_indicator_state();
				return result;
			};
		}

		proto[PATCH_FLAG] = true;
	}

	function patch_sidebar() {
		if (!frappe.ui || !frappe.ui.Sidebar) return;
		const proto = frappe.ui.Sidebar.prototype;
		if (proto[SIDEBAR_PATCH_FLAG]) return;

		const original_add_standard_items = proto.add_standard_items;
		proto.add_standard_items = function () {
			const result = original_add_standard_items.apply(this, arguments);
			schedule_enhance();
			return result;
		};

		proto[SIDEBAR_PATCH_FLAG] = true;
	}

	function setup_realtime() {
		if (frappe[REALTIME_FLAG]) return;
		if (!frappe.realtime) {
			if (realtime_tries >= MAX_REALTIME_TRIES) return;
			realtime_tries += 1;
			frappe[REALTIME_TIMER_KEY] = setTimeout(setup_realtime, 500);
			return;
		}
		frappe.realtime.on(UNREAD_CHANGED_EVENT, handle_unread_notifications_changed);
		frappe[REALTIME_FLAG] = true;
	}

	function check_unread_notifications(options) {
		options = options || {};
		if (!is_desk_user()) return;
		if (unread_check_in_progress) {
			pending_unread_check = true;
			return;
		}

		unread_check_in_progress = true;
		const done = () => {
			unread_check_in_progress = false;
			if (pending_unread_check) {
				pending_unread_check = false;
				setTimeout(handle_unread_notifications_changed, 50);
			}
		};
		frappe
			.call(
				"proposal.proposal.doctype.commercial_proposal.commercial_proposal.get_unread_notification_count"
			)
			.then(
				(r) => {
					if (r) set_unread_notification_count(r.message);
					if (options.refresh_dropdown) refresh_notifications_dropdown();
					done();
				},
				() => done()
			);
	}

	function setup_initial_sync() {
		if (frappe[INITIAL_SYNC_FLAG]) return;
		frappe[INITIAL_SYNC_FLAG] = true;
		handle_unread_notifications_changed();
	}

	function bind_dropdown_open_listener() {
		if (frappe[SETUP_FLAG]) return;

		$(document).on(
			"click.proposal-notification-indicator",
			".sidebar-notification",
			function () {
				setTimeout(function () {
					const is_open = is_notifications_dropdown_open();
					if (is_open) refresh_notifications_dropdown();
					check_unread_notifications({ refresh_dropdown: is_open });
				}, 0);
			}
		);

		$(document).on(
			"click.proposal-notification-read-state",
			".mark-all-read, .mark-as-read, .recent-item.notification-item",
			function () {
				sync_indicator_state();
			}
		);

		frappe[SETUP_FLAG] = true;
	}

	function watch_sidebar() {
		if (frappe[OBSERVER_KEY]) return;
		const target =
			document.querySelector(".body-sidebar .standard-items-sections") ||
			document.querySelector(".body-sidebar");

		if (!target) {
			if (observer_tries >= MAX_OBSERVER_TRIES) return;
			observer_tries += 1;
			frappe[OBSERVER_TIMER_KEY] = setTimeout(watch_sidebar, 500);
			return;
		}

		if (typeof window.MutationObserver !== "function") return;
		const observer = new MutationObserver((mutations) => {
			for (const m of mutations) {
				for (const node of m.addedNodes) {
					if (
						node &&
						node.nodeType === 1 &&
						((node.matches && node.matches(".sidebar-notification")) ||
							(node.querySelector && node.querySelector(".sidebar-notification")))
					) {
						schedule_enhance();
						return;
					}
				}
			}
		});
		observer.observe(target, { childList: true, subtree: true });
		frappe[OBSERVER_KEY] = observer;
	}

	function safe_setup() {
		if (!is_desk_user()) return;
		try {
			patch_notifications();
			patch_sidebar();
			patch_existing_notifications_view();
			bind_dropdown_open_listener();
			setup_realtime();
			setup_initial_sync();
			schedule_enhance();
		} catch (e) {
			console.error("proposal notification badge setup:", e);
		}
	}

	function safe_watch_sidebar() {
		if (!is_desk_user()) return;
		try {
			watch_sidebar();
		} catch (e) {
			console.error("proposal notification badge watch:", e);
		}
	}

	window.proposal_notification_debug = function () {
		const $button = $(".sidebar-notification");
		const $dropdown = $(".standard-items-sections .dropdown-notifications");
		return frappe
			.call(
				"proposal.proposal.doctype.commercial_proposal.commercial_proposal.get_notification_debug"
			)
			.then((r) => ({
				user: frappe.session && frappe.session.user,
				server: r && r.message,
				has_button: Boolean($button.length),
				has_dropdown: Boolean($dropdown.length),
				badge_visible: $button.hasClass("proposal-has-unread-notifications"),
				unread_notification_count,
			}));
	};

	$(function () {
		safe_setup();
		safe_watch_sidebar();
	});
	$(document).on("startup sidebar_setup", safe_setup);
})();
