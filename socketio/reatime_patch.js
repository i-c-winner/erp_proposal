// your_app/socketio/realtime_patch.js

const path = require("path");

const frappe_utils = require(
	path.resolve(__dirname, "../../frappe/socketio/realtime/utils")
);

// Сохраняем оригинал
const original_get_url = frappe_utils.get_url;

// Подменяем на вашу логику
frappe_utils.get_url = function(socket, req_path) {
	if (!req_path) {
		req_path = "";
	}
	return "http://erp.ecklet.online:8080" + req_path;
};

module.exports = frappe_utils;
