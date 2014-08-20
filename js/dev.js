require(['core', 'plugins/open', 'utils/layout', 'plugins/stats'], function (core, open, layout, dev_plugin, $) {

	var dev_mode = false;
	core.loaded = function () {

		if (dev_mode) {
			open.load_sample('big_fish');

			core.switch_to(dev_plugin);

			layout.show_options();
			layout.open_content();
			layout.switch_to_plugin(dev_plugin.name);
		}

		layout.dev();
	}
});