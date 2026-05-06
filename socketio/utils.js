function get_url(socket, path) {
	if (!path) {
		path = "";
	}
	return "http://erp.ecklet.online:8080" + path;
}

module.exports = {
	get_url,
};
