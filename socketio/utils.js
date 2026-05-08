function get_url(socket, path) {
	if (!path) {
		path = "";
	}
	return (process.env.FRAPPE_REALTIME_URL || "http://localhost:8000") + path;
}

module.exports = {
	get_url,
};
