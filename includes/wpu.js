/*
 * Please make note that this is not the default `fs` package from `node.js`.
 * This is an external package which adds more functionality than the vanilla one, but also keeps
 * theoriginal methods.
 */
var fs = require('fs-extra');
var request = require('request');
var tar = require('tar-fs')
var gunzip = require('gunzip-maybe');
var msgs = require('./messages.json');
var notify = {
	log: require('cli').ok,
	error: require('cli').error,
	exit: require('cli').fatal,
	debug: require('cli').debug
};

module.exports = {

	/**
	 * @todo Find a reliable way to parse the `versions.php` file
	 *
	 * Check the version of the locally installed wordpress
	 *
	 * @method checkLocalVersion
	 *
	 * @param {string} wordpressPath Path to location of the wordpress installation, relative to the
	 * base folder. Defaults to './'.
	 * @param {function} exit Notification function to call in case of fatal error
	 * @param {function} debug Notification function to call in case the script was
	 * invoked using `-- debug`
	 *
	 * @return {string} The locally installed Wordpress's version
	 */
	_checkLocalVersion: function(wordpressPath) {

		wordpressPath = wordpressPath || './';
		var versionFile = wordpressPath + 'wp-includes/version.php';

		try {

			fs.accessSync(versionFile, fs.F_OK);
			return fs.readFileSync(versionFile, 'utf8').substr(94, 5);

		} catch (error) {

			notify.debug(error);
			notify.exit(msgs.versionNotFound);
			return false;

		}

	},

	/**
	 * Fetch the latest .tar.gz archive from the Github repository. This function will be used
	 * as a stream, so it will be .pipe() -ed
	 *
	 * @method _getLatestTarball
	 *
	 * @param {object} requestOptions Options to be passed to the ajax request (url/headers).
	 * User-Agent headers are required since Github won't allow us to make an API call without them.
	 * @param {string} version Latest version available in the repo (used for notification
	 * purposes)
	 * @param {function} ok Notification function to call in to inform the user
	 * @param {function} err Notification function to call in case of error
	 *
	 * @return {object} The request object
	 */
	_getLatestTarball: function(requestOptions, version) {

		requestOptions = requestOptions || {
			url: 'https://api.github.com/repos/#/tags',
			headers: {
				'User-Agent': 'app-name/0.0.0'
			}
		};
		version = version || '0.0.0';

		notify.log(msgs.gettingLatest + ' (' + version + ')');

		return request.get(requestOptions, function(error, response) {

			if (error || response.statusCode !== 200) {
				notify.error(msgs.apiError);
			}

		});
	},

	/**
	 * Extract all files / folders from a .tar.gz archive. This function will be used as a stream,
	 * so it will be .pipe() -ed
	 *
	 * @method _extractTarball
	 *
	 * @param {string} extractionPath The path were the archive is to be extracted
	 * @param {function} ok Notification function to call in to inform the user
	 *
	 * @return {function} The extractor function
	 */
	_extractTarball: function(extractionPath) {

		extractionPath = extractionPath || './';

		notify.log(msgs.extractingTo + ' ' + extractionPath);

		return tar.extract(extractionPath, {
			/*
			 * We are re-writing the root folder of the archive to nothing (''), since we don't
			 * need it.
			 */
			map: function(header) {
				var originalDirName = header.name.split('/')[0];
				header.name = header.name.replace(originalDirName, '');
				return header;
			}
		});
	},

	/**
	 * Add a trailing slash to the supplied path. If there is already one passed in, do nothing.
	 *
	 * @method formatPath
	 *
	 * @param {string} path The path to the wordpress installation (or any other path). Defaults
	 * to '/'.
	 *
	 * @return {string} The path with the trailing slash added / the original path
	 */
	formatPath: function(path) {
		path = path || '/';
		if (path.indexOf('/') !== path.length-1) {
			return path + '/';
		}
		return path;
	},

	/**
	 * Orchestrator method that handles the update procedure with calls to various helper functions
	 *
	 * @method update
	 *
	 * @param {object} configObject Configuration object passed in when calling the function (most
	 * values are taken from `package.json`)
	 * @param {object} notify Object which contains the native notification fuctions of the
	 * `cli` package
	 *
	 * @return {boolean} This method does not return anything, since it's a caller.
	 */
	update: function(configObject) {

		configObject = configObject || {
			name: 'app-name',
			version: '0.0.0',
			repo: '#',
			path: './'
		};

		var options = {
			url: 'https://api.github.com/repos/' + configObject.repo + '/tags',
			headers: {
				'User-Agent': configObject.name + '/' + configObject.version
			}
		};

		var wpu = this;
		var currentVersion = wpu._checkLocalVersion(configObject.path);

		notify.log(msgs.updateRequired + ' (current version ' +	currentVersion + ')');

		request(options, function (error, response, body) {

			if (!error && response.statusCode === 200) {

				var latestVersion = JSON.parse(body)[0].name;
				if (latestVersion !== currentVersion) {

					options.url = 'https://api.github.com/repos/' +
						configObject.repo +
						'/tarball/' +
						latestVersion;

					wpu._getLatestTarball(options, latestVersion)
						.on('end', function() {
							notify.log(msgs.updateComplete);
						})
						.pipe(gunzip())
						.pipe(wpu._extractTarball(configObject.path));

				} else {

					notify.log(msgs.latestVersion + ' (version ' + latestVersion + ')');

				}

			} else {
				notify.error(msgs.apiError);
			}

		});

		return false;

	}

};
