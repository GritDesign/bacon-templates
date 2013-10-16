"use strict";

var parseTemplate = require("../lib/bacon-templates.js").parseTemplate;
var testCases = require("./test-cases.json");

describe("parser", function () {
	testCases.forEach(function (test) {
		it(test.description, function () {
			var ast = parseTemplate(test.template);
			expect(JSON.stringify(ast)).toEqual(JSON.stringify(test.ast));
		});
	});
});
