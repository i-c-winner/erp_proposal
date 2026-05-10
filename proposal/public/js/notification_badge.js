(function () {
	const PATCH_FLAG = "__proposal_notification_badge_patch_v1";
	const SIDEBAR_PATCH_FLAG = "__proposal_sidebar_notification_badge_patch_v1";
	const VIEW_PATCH_FLAG = "__proposal_notification_badge_view_patch_v1";
	const REALTIME_FLAG = "__proposal_notification_badge_realtime_v1";
	const INITIAL_SYNC_FLAG = "__proposal_notification_badge_initial_sync_v1";
	const UNREAD_CHANGED_EVENT = "proposal_unread_notifications_changed";
	let unread_notification_count = 0;
	let unread_check_in_progress = false;
	let pending_unread_check = false;

	function enhance_notification_button(root) {
		const $root = root ? $(root) : $(document);
		const $button = $root
			.find(".sidebar-notification")
			.add($root.filter(".sidebar-notification"));

		if (!$button.length) return;

		$button.addClass("notifications-icon");

		const $icon = $button.find(".sidebar-item-icon");
		if (!$icon.find(".proposal-notification-badge").length) {
			$icon.append(`<span class="proposal-notification-badge"></span>`);
		}

		apply_indicator_state();
	}

	function ensure_notification_button() {
		const $section = $(".standard-items-sections").first();
		if (!$section.length || $(".sidebar-notification").length) return;

		const bell = frappe.utils?.icon
			? frappe.utils.icon("bell", "sm", "", "", "text-ink-gray-7 current-color", true)
			: "";
		const $button = $(`
			<div class="standard-sidebar-item sidebar-notification notifications-icon">
				<a class="item-anchor">
					<span class="sidebar-item-icon text-ink-gray-7">${bell}</span>
					<span class="sidebar-item-label">${__("Notification")}</span>
				</a>
			</div>
		`);

		$section.append($button);
		enhance_notification_button($section);
		bind_notification_button($section);
	}

	function ensure_notifications_instance() {
		const $section = $(".standard-items-sections").first();
		if (!$section.length || frappe.session?.user === "Guest") return;
		if (!frappe.boot?.desk_settings?.notifications || !frappe.ui?.Notifications) return;
		if (frappe.app?.sidebar?.notifications?.tabs?.notifications) return;

		frappe.app = frappe.app || {};
		frappe.app.sidebar = frappe.app.sidebar || {};
		frappe.app.sidebar.notifications = new frappe.ui.Notifications({
			full_height: true,
			wrapper: $section,
		});
		enhance_notification_button($section);
	}

	function bind_notification_button(root) {
		const $root = root ? $(root) : $(document);
		$root
			.off("click.proposal-notification-indicator", ".sidebar-notification")
			.on("click.proposal-notification-indicator", ".sidebar-notification", () => {
				const $dropdown = $(".standard-items-sections .dropdown-notifications").first();
				if ($dropdown.length) {
					$dropdown.toggleClass("hidden");
				}

				const $section = $(".standard-items-sections").first();
				setTimeout(() => {
					const is_open = !$section.find(".dropdown-notifications").hasClass("hidden");
					if (is_open) {
						refresh_notifications_dropdown();
					}
					check_unread_notifications({ refresh_dropdown: is_open });
				});
			});
	}

	function apply_indicator_state() {
		const has_unread_notifications = unread_notification_count > 0;
		const $button = $(".sidebar-notification");

		$button.toggleClass("proposal-has-unread-notifications", has_unread_notifications);
		$button.find(".proposal-notification-badge").toggle(has_unread_notifications);
		$button.find(".notifications-seen, .notifications-unseen").hide();
		$button.find(".sidebar-item-icon").removeClass("indicator orange");
	}

	function set_unread_notification_count(count) {
		unread_notification_count = cint(count);
		enhance_notification_button();
		apply_indicator_state();
	}

	function get_notifications_view() {
		return frappe.app?.sidebar?.notifications?.tabs?.notifications;
	}

	function refresh_notifications_dropdown() {
		const notifications_view = get_notifications_view();
		if (!notifications_view?.render_notifications_dropdown) return;

		frappe.call({
			method: "proposal.proposal.doctype.commercial_proposal.commercial_proposal.get_notification_logs",
			args: { limit: notifications_view.max_length || 20 },
		}).then((r) => {
			if (!r.message) return;

			notifications_view.dropdown_items = r.message.notification_logs || [];
			frappe.update_user_info(r.message.user_info || {});
			patch_notifications_view(notifications_view);
			notifications_view.container.empty();
			notifications_view.render_notifications_dropdown();
		});
	}

	function sync_indicator_state(delay = 700) {
		setTimeout(() => {
			handle_unread_notifications_changed();
		}, delay);
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

	function handle_unread_notifications_changed() {
		check_unread_notifications({
			refresh_dropdown: is_notifications_dropdown_open(),
		});
	}

	function is_notifications_dropdown_open() {
		const $dropdown = $(".standard-items-sections .dropdown-notifications").first();
		return Boolean($dropdown.length && !$dropdown.hasClass("hidden"));
	}

	function patch_notifications() {
		if (!frappe.ui?.Notifications || frappe.ui.Notifications.prototype[PATCH_FLAG]) {
			return;
		}

		const proto = frappe.ui.Notifications.prototype;
		const original_make_tab_view = proto.make_tab_view;
		const original_make = proto.make;
		const original_mark_all_as_read = proto.mark_all_as_read;

		proto.make = function () {
			enhance_notification_button(this.wrapper);
			const result = original_make.apply(this, arguments);
			enhance_notification_button(this.wrapper);
			return result;
		};

		proto.make_tab_view = function (item) {
			if (item.id !== "notifications") {
				return original_make_tab_view.apply(this, arguments);
			}

			let tabView = new item.view(item.el, this.wrapper, this.notification_settings);
			patch_notifications_view(tabView);
			this.tabs[item.id] = tabView;
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
		if (!frappe.ui?.Sidebar || frappe.ui.Sidebar.prototype[SIDEBAR_PATCH_FLAG]) {
			return;
		}

		const proto = frappe.ui.Sidebar.prototype;
		const original_setup_notifications = proto.setup_notifications;
		const original_add_standard_items = proto.add_standard_items;

		proto.setup_notifications = function () {
			if (frappe.boot.desk_settings.notifications && frappe.session.user !== "Guest") {
				this.notifications = new frappe.ui.Notifications({
					full_height: true,
					wrapper: this.$standard_items_sections,
				});
				enhance_notification_button(this.$standard_items_sections);
				return;
			}

			return original_setup_notifications.apply(this, arguments);
		};

		proto.add_standard_items = function () {
			const result = original_add_standard_items.apply(this, arguments);
			enhance_notification_button(this.$standard_items_sections);

			this.$standard_items_sections
				.off("click.proposal-notification-indicator", ".sidebar-notification")
				.on("click.proposal-notification-indicator", ".sidebar-notification", () => {
					setTimeout(() => {
						const is_open = !this.wrapper.find(".dropdown-notifications").hasClass("hidden");
						if (is_open) {
							refresh_notifications_dropdown();
						}
						check_unread_notifications({ refresh_dropdown: is_open });
					});
				});

			return result;
		};

		proto[SIDEBAR_PATCH_FLAG] = true;
	}

	function setup_realtime() {
		if (frappe[REALTIME_FLAG]) return;
		if (!frappe.realtime) {
			setTimeout(setup_realtime, 300);
			return;
		}

		frappe.realtime.on(UNREAD_CHANGED_EVENT, handle_unread_notifications_changed);
		frappe.realtime.on("proposal_notification", handle_unread_notifications_changed);
		frappe.realtime.on("notification", handle_unread_notifications_changed);
		frappe.realtime.on("indicator_hide", handle_unread_notifications_changed);
		frappe[REALTIME_FLAG] = true;
	}

	function check_unread_notifications(options = {}) {
		if (frappe.session?.user === "Guest") return;
		if (unread_check_in_progress) {
			pending_unread_check = true;
			return;
		}

		unread_check_in_progress = true;
		frappe
			.call(
				"proposal.proposal.doctype.commercial_proposal.commercial_proposal.get_unread_notification_count"
			)
			.then((r) => {
				set_unread_notification_count(r.message);
				if (options.refresh_dropdown) {
					refresh_notifications_dropdown();
				}
			})
			.finally(() => {
				unread_check_in_progress = false;
				if (pending_unread_check) {
					pending_unread_check = false;
					setTimeout(handle_unread_notifications_changed, 50);
				}
			});
	}

	function setup_initial_sync() {
		if (frappe[INITIAL_SYNC_FLAG]) return;

		frappe[INITIAL_SYNC_FLAG] = true;
		handle_unread_notifications_changed();
	}

	function setup_read_state_handlers() {
		$(document)
			.off("click.proposal-notification-read-state")
			.on(
				"click.proposal-notification-read-state",
				".mark-all-read, .mark-as-read, .recent-item.notification-item",
				() => {
					sync_indicator_state();
				}
			);
	}

	function setup() {
		if (!window.frappe) return;

		patch_notifications();
		patch_sidebar();
		ensure_notification_button();
		ensure_notifications_instance();
		patch_existing_notifications_view();
		setup_realtime();
		setup_initial_sync();
		setup_read_state_handlers();
		enhance_notification_button();
		bind_notification_button();
	}

	window.proposal_notification_debug = function () {
		const $button = $(".sidebar-notification");
		const $dropdown = $(".standard-items-sections .dropdown-notifications");
		return frappe
			.call(
				"proposal.proposal.doctype.commercial_proposal.commercial_proposal.get_notification_debug"
			)
			.then((r) => ({
				user: frappe.session?.user,
				server: r.message,
				has_button: Boolean($button.length),
				has_dropdown: Boolean($dropdown.length),
				badge_visible: $(".sidebar-notification .proposal-notification-badge").is(":visible"),
				unread_notification_count,
				has_unread_notifications: unread_notification_count > 0,
			}));
	};

	function watch_sidebar() {
		if (!document.body || document.body.__proposal_notification_observer) return;

		const observer = new MutationObserver(() => {
			enhance_notification_button();
			apply_indicator_state();
		});
		observer.observe(document.body, { childList: true, subtree: true });
		document.body.__proposal_notification_observer = observer;
	}

	setup();
	watch_sidebar();
	$(document).on("startup sidebar_setup", setup);
})();
