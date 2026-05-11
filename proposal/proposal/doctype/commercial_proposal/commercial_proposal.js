// Copyright (c) 2026, Belousov Dmitriy and contributors
// For license information, please see license.txt

frappe.ui.form.on("Commercial Proposal", {
	refresh(frm) {
		if (frm.doc.budget) {
			frm.add_custom_button(__("View Budget"), function () {
				open_budget_viewer(frm);
			});

			frm.add_custom_button(__("Edit Budget"), function () {
				open_budget_editor(frm);
			});
		}

		hide_budget_from_attachments(frm);
	},

	budget(frm) {
		if (!frm.doc.budget) return;

		if (!is_excel_file(frm.doc.budget)) {
			frappe.msgprint({
				title: __("Invalid File Type"),
				message: __("Only Excel files (.xlsx, .xls) are allowed in the Budget field."),
				indicator: "red",
			});
			frm.set_value("budget", "");
			return;
		}

		frm.refresh();
	},
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function is_excel_file(path) {
	const p = (path || "").toLowerCase();
	return p.endsWith(".xlsx") || p.endsWith(".xls");
}

function hide_budget_from_attachments(frm) {
	if (!frm.attachments) return;

	// Always re-patch (docname changes between documents)
	const orig_get = frm.attachments.get_attachments.bind(frm.attachments);
	frm.attachments.get_attachments = function () {
		const safe_name = (frm.docname || "").replace(/\//g, "-");
		return orig_get().filter((a) => {
			const fname = a.file_name || "";
			// Budget files are always named budget_<docname>.xlsx (with slashes replaced by -)
			if (fname.startsWith("budget_" + safe_name)) return false;
			// Fallback for users with permlevel 1: match by URL
			if (frm.doc.budget && a.file_url === frm.doc.budget) return false;
			return true;
		});
	};

	frm.attachments.refresh();
}

function setup_budget_file_restriction(frm) {
	const field = frm.fields_dict.budget;
	if (!field || !field.$wrapper) return;

	// Hide native Attach / Change / Remove controls — editing only via Edit Budget button
	const $w = field.$wrapper;
	$w.find(".btn-attach, .btn-attach-doc").hide();
	// Also hide remove (×) on already-attached file
	const hide_remove = () => $w.find(".close, .remove-btn, [data-action='remove']").hide();
	hide_remove();
	// Re-apply after Frappe re-renders the field
	const observer = new MutationObserver(hide_remove);
	observer.observe($w[0], { childList: true, subtree: true });
}

// ─── Library loader ─────────────────────────────────────────────────────────

function load_script(src) {
	return new Promise((resolve, reject) => {
		if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
		const s = document.createElement("script");
		s.src = src;
		s.onload = resolve;
		s.onerror = () => reject(new Error("Failed to load: " + src));
		document.head.appendChild(s);
	});
}

function load_style(href) {
	return new Promise((resolve) => {
		if (document.querySelector(`link[href="${href}"]`)) { resolve(); return; }
		const l = document.createElement("link");
		l.rel = "stylesheet";
		l.href = href;
		l.onload = resolve;
		document.head.appendChild(l);
	});
}

// ─── Main entry points ──────────────────────────────────────────────────────

async function open_budget_viewer(frm) {
	show_loader(__("Loading file…"));

	try {
		await load_style("/assets/proposal/css/libs/xspreadsheet.css");
		await load_script("/assets/proposal/js/libs/xlsx.full.min.js");
		await load_script("/assets/proposal/js/libs/xspreadsheet.js");

		const res = await frappe.call({
			method: "proposal.proposal.doctype.commercial_proposal.commercial_proposal.get_budget_file_content",
			args: { docname: frm.doc.name },
		});
		if (!res || !res.message) throw new Error("Empty response from server");

		const binary = atob(res.message.content_b64);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		const workbook = XLSX.read(bytes, { type: "array" });

		render_viewer(frm, workbook);
	} catch (err) {
		hide_loader();
		frappe.msgprint({
			title: __("Error"),
			message: __("Could not open the budget file: ") + err.message,
			indicator: "red",
		});
	}
}

function render_viewer(frm, workbook) {
	const VIEWER_ID = "budget-spreadsheet-viewer";
	$(`#${VIEWER_ID}`).remove();

	const toolbar_h = 50;
	const win_h = window.innerHeight;
	const win_w = window.innerWidth;

	const $overlay = $(`
		<div id="${VIEWER_ID}" style="
			position:fixed;top:0;left:0;
			width:${win_w}px;height:${win_h}px;
			background:#fff;z-index:100000;
		">
			<div style="
				display:flex;align-items:center;justify-content:space-between;
				padding:10px 16px;height:${toolbar_h}px;box-sizing:border-box;
				border-bottom:1px solid #d1d8dd;background:#f8f9fa;gap:8px;
			">
				<span style="font-weight:600;font-size:14px;">
					${__("Budget")} — ${frappe.utils.escape_html(frm.doc.name)}
					<span style="
						font-size:11px;font-weight:400;color:#6c757d;
						margin-left:8px;padding:2px 8px;
						background:#e9ecef;border-radius:10px;
					">${__("Read only")}</span>
				</span>
				<div style="display:flex;gap:8px;">
					<button id="bsv-download" class="btn btn-default btn-sm">${__("Download")}</button>
					<button id="bsv-close" class="btn btn-default btn-sm">${__("Close")}</button>
				</div>
			</div>
			<div id="bsv-container" style="width:${win_w}px;height:${win_h - toolbar_h}px;overflow:hidden;"></div>
		</div>
	`);

	$("body").append($overlay);

	requestAnimationFrame(() => {
		hide_loader();
		try {
			const xs_data = workbook_to_xs(workbook);
			x_spreadsheet("#bsv-container", {
				mode: "read",
				showToolbar: false,
				showGrid: true,
				showContextmenu: false,
				row: { len: 2000, height: 25 },
				col: { len: 100, width: 100 },
			}).loadData(xs_data);

			document.getElementById("bsv-download").addEventListener("click", () => {
				const a = document.createElement("a");
				a.href = frm.doc.budget;
				a.download = frm.doc.budget.split("/").pop();
				a.click();
			});

			document.getElementById("bsv-close").addEventListener("click", () =>
				$(`#${VIEWER_ID}`).remove()
			);
		} catch (err) {
			$(`#${VIEWER_ID}`).remove();
			frappe.msgprint({ title: __("Error"), message: err.message, indicator: "red" });
		}
	});
}

function show_loader(msg) {
	$("#bse-loader").remove();
	$("body").append(`
		<div id="bse-loader" style="
			position:fixed;top:0;left:0;right:0;bottom:0;
			background:rgba(0,0,0,0.45);z-index:99999;
			display:flex;align-items:center;justify-content:center;
		">
			<div style="
				background:#fff;border-radius:6px;padding:24px 32px;
				font-size:14px;color:#333;min-width:220px;text-align:center;
				box-shadow:0 4px 20px rgba(0,0,0,0.2);
			">
				<div class="spinner-border spinner-border-sm mr-2" style="
					display:inline-block;width:1rem;height:1rem;
					border:.2em solid #4563f5;border-right-color:transparent;
					border-radius:50%;animation:spin .75s linear infinite;
				"></div>
				${frappe.utils.escape_html(msg)}
			</div>
		</div>
		<style>@keyframes spin{to{transform:rotate(360deg)}}</style>
	`);
}

function hide_loader() {
	$("#bse-loader").remove();
}

async function open_budget_editor(frm) {
	show_loader(__("Loading editor…"));

	try {
		console.log("[BudgetEditor] Loading CSS…");
		await load_style("/assets/proposal/css/libs/xspreadsheet.css");

		console.log("[BudgetEditor] Loading xlsx.js…");
		await load_script("/assets/proposal/js/libs/xlsx.full.min.js");

		console.log("[BudgetEditor] Loading xspreadsheet.js…");
		await load_script("/assets/proposal/js/libs/xspreadsheet.js");

		show_loader(__("Loading file…"));
		console.log("[BudgetEditor] Fetching file from server…");

		const TIMEOUT_MS = 30000;
		const timeout_p = new Promise((_, reject) =>
			setTimeout(() => reject(new Error("Server request timed out (30s)")), TIMEOUT_MS)
		);
		const call_p = frappe.call({
			method: "proposal.proposal.doctype.commercial_proposal.commercial_proposal.get_budget_file_content",
			args: { docname: frm.doc.name },
		});

		const res = await Promise.race([call_p, timeout_p]);
		if (!res || !res.message) throw new Error("Empty response from server");

		console.log("[BudgetEditor] File received, parsing…");
		const binary = atob(res.message.content_b64);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

		const workbook = XLSX.read(bytes, { type: "array" });
		console.log("[BudgetEditor] Done. Sheets:", workbook.SheetNames);

		render_editor(frm, workbook);
	} catch (err) {
		hide_loader();
		console.error("[BudgetEditor] Error:", err);
		frappe.msgprint({
			title: __("Error"),
			message: __("Could not open the budget file: ") + err.message,
			indicator: "red",
		});
	}
}

// ─── Editor UI ──────────────────────────────────────────────────────────────

function render_editor(frm, workbook) {
	const EDITOR_ID = "budget-spreadsheet-editor";
	$(`#${EDITOR_ID}`).remove();

	const toolbar_h = 50;
	const win_h = window.innerHeight;
	const win_w = window.innerWidth;
	const sheet_h = win_h - toolbar_h;

	const $overlay = $(`
		<div id="${EDITOR_ID}" style="
			position:fixed;top:0;left:0;
			width:${win_w}px;height:${win_h}px;
			background:#fff;z-index:100000;
		">
			<div style="
				display:flex;align-items:center;justify-content:space-between;
				padding:10px 16px;height:${toolbar_h}px;box-sizing:border-box;
				border-bottom:1px solid #d1d8dd;background:#f8f9fa;gap:8px;
			">
				<span style="font-weight:600;font-size:14px;">
					${__("Budget Editor")} — ${frappe.utils.escape_html(frm.doc.name)}
				</span>
				<div style="display:flex;gap:8px;">
					<button id="bse-download" class="btn btn-default btn-sm">${__("Download")}</button>
					<button id="bse-save" class="btn btn-primary btn-sm">${__("Save")}</button>
					<button id="bse-close" class="btn btn-default btn-sm">${__("Close")}</button>
				</div>
			</div>
			<div id="bse-container" style="width:${win_w}px;height:${sheet_h}px;overflow:hidden;"></div>
		</div>
	`);

	$("body").append($overlay);

	// defer until DOM is painted so container has real pixel dimensions
	requestAnimationFrame(() => {
		hide_loader();
		try {
			console.log("[BudgetEditor] Initialising x_spreadsheet…");
			const xs_data = workbook_to_xs(workbook);
			console.log("[BudgetEditor] xs_data sheets:", xs_data.length);

			const xs = x_spreadsheet("#bse-container", {
				mode: "edit",
				showToolbar: true,
				showGrid: true,
				showContextmenu: true,
				row: { len: 2000, height: 25 },
				col: { len: 100, width: 100 },
				style: { bgcolor: "#fff", align: "left", color: "#333" },
			}).loadData(xs_data);

			console.log("[BudgetEditor] Editor ready");

			document.getElementById("bse-download").addEventListener("click", () =>
				download_budget(xs, workbook.SheetNames, frm.doc.budget)
			);
			document.getElementById("bse-save").addEventListener("click", () =>
				save_budget(frm, xs, workbook.SheetNames)
			);
			document.getElementById("bse-close").addEventListener("click", () =>
				$(`#${EDITOR_ID}`).remove()
			);
		} catch (err) {
			$(`#${EDITOR_ID}`).remove();
			console.error("[BudgetEditor] render error:", err);
			frappe.msgprint({
				title: __("Editor Error"),
				message: err.message || String(err),
				indicator: "red",
			});
		}
	});
}

// ─── Conversion helpers ─────────────────────────────────────────────────────

function workbook_to_xs(wb) {
	return wb.SheetNames.map((name) => {
		const ws = wb.Sheets[name];
		const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
		const rows = {};

		aoa.forEach((row_arr, ri) => {
			const cells = {};
			row_arr.forEach((val, ci) => {
				if (val !== "" && val != null) {
					cells[ci] = { text: String(val) };
				}
			});
			if (Object.keys(cells).length) rows[ri] = { cells };
		});

		const cols = {};
		if (ws["!cols"]) {
			ws["!cols"].forEach((c, ci) => {
				if (c && c.wpx) cols[ci] = { width: c.wpx };
			});
		}

		return { name, rows, cols };
	});
}

function xs_to_workbook(xs_data, sheet_names) {
	const wb = XLSX.utils.book_new();

	xs_data.forEach((sheet, idx) => {
		const name = sheet.name || sheet_names[idx] || `Sheet${idx + 1}`;
		const rows = sheet.rows || {};

		const row_nums = Object.keys(rows)
			.map(Number)
			.filter((n) => !isNaN(n));

		if (!row_nums.length) {
			XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), name);
			return;
		}

		const max_row = Math.max(...row_nums);
		const max_col = Math.max(
			0,
			...row_nums.map((ri) => {
				const cs = Object.keys(rows[ri].cells || {})
					.map(Number)
					.filter((n) => !isNaN(n));
				return cs.length ? Math.max(...cs) : 0;
			})
		);

		const aoa = [];
		for (let ri = 0; ri <= max_row; ri++) {
			const cells = (rows[ri] || {}).cells || {};
			const arr = [];
			for (let ci = 0; ci <= max_col; ci++) {
				arr.push(cells[ci] ? cells[ci].text ?? "" : "");
			}
			aoa.push(arr);
		}

		XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
	});

	return wb;
}

// ─── Save ───────────────────────────────────────────────────────────────────

function download_budget(xs, sheet_names, original_url) {
	const orig = (original_url || "budget").split("/").pop();
	const file_name = is_excel_file(orig) ? orig : orig + ".xlsx";

	const wb = xs_to_workbook(xs.getData(), sheet_names);
	const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
	const blob = new Blob([wbout], {
		type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	});

	const link = document.createElement("a");
	link.href = URL.createObjectURL(blob);
	link.download = file_name;
	link.click();
	URL.revokeObjectURL(link.href);
}

async function save_budget(frm, xs, sheet_names) {
	const btn = document.getElementById("bse-save");
	btn.disabled = true;
	btn.textContent = __("Saving…");

	try {
		// Commit any in-progress cell edit by blurring the active element
		if (document.activeElement && document.activeElement !== document.body) {
			document.activeElement.blur();
		}
		// Wait two frames so x-spreadsheet can write the edit to its data model
		await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

		const xs_data = xs.getData();
		console.log("[BudgetEditor] getData rows sample:", JSON.stringify(xs_data[0]?.rows).slice(0, 300));

		const wb = xs_to_workbook(xs_data, sheet_names);

		// Log first rows as sanity check
		const sample = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
			header: 1, defval: "",
		}).slice(0, 3);
		console.log("[BudgetEditor] xlsx sample to be saved:", JSON.stringify(sample));

		const b64 = XLSX.write(wb, { bookType: "xlsx", type: "base64" });
		const orig = frm.doc.budget.split("/").pop();
		const file_name = is_excel_file(orig) ? orig : orig + ".xlsx";

		const res = await frappe.call({
			method:
				"proposal.proposal.doctype.commercial_proposal.commercial_proposal.save_budget_file",
			args: { docname: frm.doc.name, file_content_b64: b64, file_name },
		});

		const new_url = res && res.message;
		console.log("[BudgetEditor] saved file URL:", new_url);

		// Force the form field to the new URL immediately, before any reload
		if (new_url) {
			frm.doc.budget = new_url;
		}

		$("#budget-spreadsheet-editor").remove();

		console.log("[BudgetEditor] budget BEFORE reload:", frm.doc.budget);
		await frm.reload_doc();
		console.log("[BudgetEditor] budget AFTER reload:", frm.doc.budget);

		frappe.show_alert({ message: __("Budget saved"), indicator: "green" });
	} catch (err) {
		frappe.msgprint({
			title: __("Save Error"),
			message: err.message || String(err),
			indicator: "red",
		});
		btn.disabled = false;
		btn.textContent = __("Save");
	}
}