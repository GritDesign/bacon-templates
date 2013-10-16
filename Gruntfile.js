"use strict";

module.exports = function (grunt) {

	// Project configuration.
	grunt.initConfig({
		pkg: grunt.file.readJSON("package.json"),
		"jasmine_node": {
			coverage: {},
			src: "lib/**/*.js",
			options: {
				forceExit: true,
				match: ".",
				matchall: false,
				extensions: "js",
				specNameMatcher: "spec",
				junitreport: {
					report: false,
					savePath: "./build/reports/jasmine/",
					useDotNotation: true,
					consolidate: true
				}
			}
		},
		jshint: {
			options: {},
			globals: {},
			code: {
				src: ["lib/**/*.js"],
				options: {
					jshintrc: ".jshintrc"
				}
			},

			spec: {
				src: ["lib/**/*.js"],
				options: {
					jshintrc: ".jshintrc"
				},
				globals: {
					describe: true,
					it: true,
					expect: true
				}
			},
			grunt: {
				src: ["Gruntfile.js"],
				options: {
					jshintrc: ".jshintrc"
				},
				globals: {
					task: true,
					config: true,
					file: true,
					log: true,
					template: true
				}
			}
		},
		jsbeautifier: {
			files: ["lib/**/*.js", "spec/**/*.js",
				"Gruntfile.js"
			],
			options: {
				js: {
					braceStyle: "collapse",
					breakChainedMethods: false,
					e4x: false,
					evalCode: false,
					indentChar: "\t",
					indentLevel: 0,
					indentSize: 1,
					indentWithTabs: true,
					jslintHappy: true,
					keepArrayIndentation: false,
					keepFunctionIndentation: false,
					maxPreserveNewlines: 10,
					preserveNewlines: true,
					spaceBeforeConditional: true,
					spaceInParen: false,
					unescapeStrings: false,
					wrapLineLength: 70
				}
			}
		}
	});

	grunt.loadNpmTasks("grunt-contrib-jshint");
	grunt.loadNpmTasks("grunt-jasmine-node-coverage");
	grunt.loadNpmTasks("grunt-jsbeautifier");

	grunt.registerTask("fmt", ["jsbeautifier"]);
	grunt.registerTask("test", ["lint", "jasmine_node"]);
	grunt.registerTask("lint", ["jshint:code", "jshint:spec",
		"jshint:grunt"
	]);
};
