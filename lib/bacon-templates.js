"use strict";

var parse = require("./parse-js.js").parse;
var render = require("../lib/template-renderer.js").render;
var path = require("path");
var fs = require("fs");

function parseTemplate(str, keepTokens) {
	var ast;
	try {
		// parse(string, exigent_mode, keep_tokens, template_mode)
		ast = parse(str, false, keepTokens, true);
	} catch (e) {
		throw e;
	}
	return ast;
}

function express(templatePath, options, fn) {
	var viewsPath = options.settings.views;
	var relativePath = templatePath.substr(viewsPath.length + 1);

	var renderOptions = {
		getTemplate: function (templateName, cb) {
			var templatePath = path.join(viewsPath, templateName);
			fs.readFile(templatePath, function (err, buff) {
				if (err) {
					cb(err);
					return;
				}
				var str = buff.toString("utf8");

				if (err) {
					cb(new Error("could not find template " +
						templateName));
					return;
				}

				cb(null, str);
			});
		},
		templateRoot: viewsPath
	};

	render(relativePath, options, renderOptions, fn);
}

exports.render = render;
exports.parseTemplate = parseTemplate;
exports.express = express;
