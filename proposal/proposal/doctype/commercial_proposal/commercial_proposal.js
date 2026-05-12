// Copyright (c) 2026, Belousov Dmitriy and contributors
// For license information, please see license.txt

frappe.ui.form.on("Commercial Proposal", {
	refresh(frm) {
		if (frm.doc.budget) {
			frm.add_custom_button(__("Edit Budget"), function () {
				open_budget_editor(frm);
			});
		}

		hide_budget_from_attachments(frm);
	},
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function is_excel_file(path) {
	const p = (path || "").toLowerCase();
	return p.endsWith(".xlsx") || p.endsWith(".xls");
}

function hide_budget_from_attachments(frm) {
	if (!frm.attachments) return;

	const orig_get = frm.attachments.get_attachments.bind(frm.attachments);
	frm.attachments.get_attachments = function () {
		const safe_name = (frm.docname || "").replace(/\//g, "-");
		return orig_get().filter((a) => {
			const fname = a.file_name || "";
			if (fname.startsWith("budget_" + safe_name)) return false;
			if (frm.doc.budget && a.file_url === frm.doc.budget) return false;
			return true;
		});
	};

	frm.attachments.refresh();
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
				<div style="
					display:inline-block;width:1rem;height:1rem;
					border:.2em solid #4563f5;border-right-color:transparent;
					border-radius:50%;animation:spin .75s linear infinite;
					margin-right:8px;vertical-align:middle;
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

// ─── Editor ──────────────────────────────────────────────────────────────────

function open_budget_editor(frm) {
	show_loader(__("Loading file…"));

	frappe.call({
		method: "proposal.proposal.doctype.commercial_proposal.commercial_proposal.get_budget_file_content",
		args: { docname: frm.doc.name },
		callback: function (res) {
			if (!res || !res.message || !res.message.content_b64) {
				hide_loader();
				return;
			}
			try {
				const binary = atob(res.message.content_b64);
				const bytes = new Uint8Array(binary.length);
				for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
				const workbook = XLSX.read(bytes, { type: "array" });
				render_editor(frm, workbook);
			} catch (err) {
				hide_loader();
				frappe.msgprint({
					title: __("Error"),
					message: __("Could not open the budget file: ") + err.message,
					indicator: "red",
				});
			}
		},
		error: function () {
			hide_loader();
		},
	});
}

function render_editor(frm, workbook) {
	const EDITOR_ID = "budget-spreadsheet-editor";
	$(`#${EDITOR_ID}`).remove();

	const toolbar_h = 50;
	const win_h = window.innerHeight;
	const win_w = window.innerWidth;

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
			<div id="bse-container" style="width:${win_w}px;height:${win_h - toolbar_h}px;overflow:hidden;"></div>
		</div>
	`);

	$("body").append($overlay);

	requestAnimationFrame(() => {
		hide_loader();
		try {
			const xs_data = workbook_to_xs(workbook);
			const xs = x_spreadsheet("#bse-container", {
				mode: "edit",
				showToolbar: true,
				showGrid: true,
				showContextmenu: true,
				row: { len: 2000, height: 25 },
				col: { len: 100, width: 100 },
				style: { bgcolor: "#fff", align: "left", color: "#333" },
			}).loadData(xs_data);

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
			frappe.msgprint({
				title: __("Editor Error"),
				message: err.message || String(err),
				indicator: "red",
			});
		}
	});
}

// ─── Conversion helpers ──────────────────────────────────────────────────────

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

// ─── Download & Save ─────────────────────────────────────────────────────────

function download_budget(xs, sheet_names, original_name) {
	const orig = original_name || "budget.xlsx";
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
		if (document.activeElement && document.activeElement !== document.body) {
			document.activeElement.blur();
		}
		await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

		const wb = xs_to_workbook(xs.getData(), sheet_names);
		const b64 = XLSX.write(wb, { bookType: "xlsx", type: "base64" });
		const file_name = is_excel_file(frm.doc.budget) ? frm.doc.budget : frm.doc.budget + ".xlsx";

		await frappe.call({
			method: "proposal.proposal.doctype.commercial_proposal.commercial_proposal.save_budget_file",
			args: { docname: frm.doc.name, file_content_b64: b64, file_name },
		});

		$("#budget-spreadsheet-editor").remove();
		await frm.reload_doc();
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