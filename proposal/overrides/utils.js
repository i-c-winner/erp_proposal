function get_url(socket, path) {
	if (!path) {
		path = "";
	}

	return "http://erp.ecklet.online:8085" + path;
}

module.exports = {
	get_url,
};
