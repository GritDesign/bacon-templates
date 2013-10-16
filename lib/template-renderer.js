"use strict";

var util = require("util");
var events = require("events");
var parse = require("./parse-js.js").parse;

var nextTick = global.setImmediate || process.nextTick;

function name(item) {
	if (typeof item[0] === "string") {
		return item[0];
	} else {
		return item[0].name;
	}
}

function saveToken(context, element) {
	if (typeof element[0] === "string") {
		return;
	}

	var frame = context.stack[context.stack.length - 1];
	if (frame) {
		frame.lastToken = element[0];
	}
}

function render(templateName, data, options, cb) {
	var savedStack = new Error().stack;

	var output = "";
	var context = {
		getTemplate: options.getTemplate,
		templateRoot: options.templateRoot || "",
		templateCache: options.templateCache || {},
		write: function (string) {
			output += string;
		},
		end: function () {
			cb(null, output);
		},
		error: function (message) {
			var frameMessages = [];

			var lastTemplate;

			context.stack.forEach(function (frame, index) {
				var templateName = frame.templateName ||
					lastTemplate || "(unknown)";

				var token = null;

				if (index === context.stack.length - 1) {
					token = frame.lastToken;
				} else {
					token = frame.lastTmplToken || frame.layoutToken;
					if (!token) {
						return;
					}
				}

				var hasToken = (token && token.start);
				var line = hasToken ? token.start.line + 1 : "?";
				var col = hasToken ? token.start.col + 1 : "?";
				frameMessages.push("    at " + templateName +
					" (" + context.templateRoot + "/" +
					templateName + ":" + line + ":" + col + ")");

				lastTemplate = frame.templateName || lastTemplate;
			});

			var stackMessage = frameMessages.reverse().join("\n");
			stackMessage += "\n" + savedStack.split("\n").slice(1).join(
				"\n");

			var stackString = message + "\n" + stackMessage;
			var err = new Error(message);

			err.stack = stackString;

			return err;
		},
		stack: [{
			templateName: templateName,
			data: data,
			vars: {}
		}],
		"getParsedTemplate": function (templateName, cb) {
			var template = context.templateCache[templateName];

			if (template) {
				cb(null, template);
				return;
			} else {
				context.getTemplate(templateName, function (err, str) {
					if (err) {
						cb(context.error("cannot load template " +
							templateName + ". " + err.message
						));
						return;
					}

					try {
						template = parse(str, false, true, true);
					} catch (err) {
						var frame = context.stack[context.stack.length -
							1];
						frame.lastToken = {
							start: {
								line: err.line - 1,
								col: err.col - 1,
								pos: err.pos - 1
							}
						};

						cb(context.error("template parse error: " +
							err.message));
						return;
					}

					context.templateCache[templateName] =
						template;
					cb(null, template);
				});
			}
		}
	};

	context.getParsedTemplate(templateName, function (err, template) {
		if (err) {
			cb(err);
			return;
		}

		renderTemplate(template, context, function (err) {
			if (err) {
				cb(err);
			} else {
				cb(null, output);
			}
		});
	});
}

function renderTemplate(template, context, cb) {
	if (name(template) !== "template") {
		throw new Error("invalid template");
	}

	var elements = template[1];
	if (typeof elements !== "object") {
		throw new Error("invalid template");
	}

	/* need to capture all writes in case 
       we need to apply a layout */

	var oldWrite = context.write;
	var body = "";
	context.write = function (str) {
		body += str;
	};

	var frame = context.stack[context.stack.length - 1];

	renderElements(elements, context, function (err) {
		if (err) {
			cb(err);
			return;
		}

		context.write = oldWrite;
		if (!frame.layout) {
			context.write(body);
			cb(err);
			return;
		}

		// need to render with layout
		var scope = {
			"data": frame.data,
			"templateName": frame.layout,
			"vars": {
				"$data": frame.data,
				"body": body
			}
		};

		context.stack.push(scope);

		context.getParsedTemplate(frame.layout, function (err,
			template) {
			if (err) {
				cb(err);
				return;
			}

			renderTemplate(template, context, function (err) {
				context.stack.pop();

				if (err) {
					cb(err);
				} else {
					cb(null);
				}
			});
		});
	});
}

function renderElements(elements, context, cb) {
	if (!elements) {
		cb(null);
		return;
	}

	var didError = false;
	var i = 0;

	function next() {
		var element = elements[i];
		i++;

		if (!element) {
			cb(null);
			return;
		}

		var count = 0;

		renderElement(element, context, function (err) {
			count++;
			if (count !== 1) {
				throw new Error("render for " + name(element) +
					" had multiple callbacks");
			}

			if (didError) {
				return;
			}

			if (err) {
				didError = true;
				cb(err);
				return;
			}

			next();
		});
	}

	next();
}

function renderElement(element, context, cb) {
	saveToken(context, element);

	switch (name(element)) {
	case "html":
		context.write(element[1]);
		cb(null);
		break;
	case "tmpl-if":
		renderTmplIf(element, context, cb);
		break;
	case "tmpl-echo":
		renderTmplEcho(element, context, cb);
		break;
	case "tmpl":
		renderTmpl(element, context, cb);
		break;
	case "tmpl-each":
		renderTmplEach(element, context, cb);
		break;
	case "tmpl-html":
		renderTmplHtml(element, context, cb);
		break;
	case "tmpl-layout":
		captureLayout(element, context, cb);
		break;
	case "tmpl-var":
		storeTmplVar(element, context, cb);
		break;

	default:
		cb(new Error("unhandled element " + name(element)));
		break;
	}
}

function renderTmplIf(element, context, cb) {
	// ["tmpl-if", [expr, body], else_ifs, else_body]
	var expr = element[1][0];
	var elseIfs = element[2];

	evaluateExpression(expr, context, evaluatedExpr);

	function evaluatedExpr(err, val) {
		if (err) {
			cb(err);
			return;
		}
		// TODO: need else_ifs!
		if (val) {
			renderElements(element[1][1], context, cb);
		} else {
			nextElse(0);
		}

		function nextElse(i) {
			if (i === elseIfs.length) {
				doneElseIfs();
				return;
			}

			var condition = elseIfs[i][0];
			var body = elseIfs[i][1];

			evaluateExpression(condition, context, function (err,
				value) {
				if (err) {
					cb(err);
					return;
				}

				if (value) {
					renderElements(body, context, cb);
					return;
				}

				nextElse(i + 1);
			});
		}

		function doneElseIfs() {
			renderElements(element[3], context, cb);
		}
	}
}

function renderTmplEcho(element, context, cb) {
	// ["tmpl-echo", [expr]]
	evaluateExpression(element[1], context, function (err, value) {
		if (err) {
			cb(err);
			return;
		}

		if (typeof value !== "undefined") {
			context.write(html(value));
		}

		cb(null);
	});
}

function renderTmplHtml(element, context, cb) {
	// ["tmpl-html", [expr]]
	evaluateExpression(element[1], context, function (err, value) {
		if (err) {
			cb(err);
			return;
		}

		if (typeof value !== "undefined") {
			context.write(value);
		}

		cb(null);
	});
}

function captureLayout(element, context, cb) {
	// ["tmpl-layout", [expr]]
	evaluateExpression(element[1], context, function (err, value) {
		if (typeof value !== "string") {
			cb(context.error(
				"{{layout}} template must be a string"));
			return;
		}

		for (var i = context.stack.length - 1; i >= 0; i--) {
			if (context.stack[i].templateName) {
				context.stack[i].layout = value;
				context.stack[i].layoutToken = element[0];
				break;
			}
		}

		cb(null);
	});
}

function storeTmplVar(element, context, cb) {
	// ["tmpl-var", [[name, <expression>],..]

	var frame = context.stack[context.stack.length - 1];
	var items = element[1];

	function next(i) {
		if (i >= items.length) {
			cb(null);
			return;
		}

		evaluateExpression(items[i][1], context, function (err, value) {
			if (err) {
				cb(err);
				return;
			}

			frame.vars[items[i][0]] = value;
			next(i + 1);
		});
	}

	next(0);
}

function renderTmpl(element, context, cb) {
	// ["tmpl" [expr1,...] expr2]
	var objectValue;

	var frame = context.stack[context.stack.length - 1];
	if (typeof element[0] !== "string") {
		frame.lastTmplToken = element[0];
	} else {
		frame.lastTmplToken = {};
	}

	if (!element[1]) {
		gotObject(null, {});
	} else {
		evaluateExpression(element[1][0], context, gotObject);
	}

	function gotObject(err, obj) {
		if (err) {
			cb(err);
			return;
		}

		objectValue = obj;

		evaluateExpression(element[2], context, gotTemplateName);
	}

	function gotTemplateName(err, templateName) {
		if (err) {
			cb(err);
			return;
		}

		if (!objectValue) {
			throw new Error("no object value");
		}


		var scope = {
			"data": objectValue,
			"templateName": templateName,
			"vars": {
				"$data": objectValue
			}
		};

		context.stack.push(scope);
		context.getParsedTemplate(templateName, function (err,
			template) {
			if (err) {
				cb(err);
				return;
			}

			renderTemplate(template, context, function (err) {
				context.stack.pop();

				if (err) {
					cb(err);
				} else {
					cb(null);
				}
			});
		});
	}
}

function renderTmplEach(element, context, cb) {
	// ["tmpl-each", arguments, collection, template]

	var indexName;
	var valueName;
	var keyName;
	var elementArgs = element[1];

	var args;
	if (elementArgs) {
		args = [];
		for (var i = 0; i < elementArgs.length; i++) {
			var arg = elementArgs[i];
			if (name(arg) !== "name") {
				cb(context.error("parse error: " +
					"{{each}} arguments must be names"));
				return;
			} else {
				args[i] = arg[1];
			}
		}
	}

	indexName = args && args[0] || "$index";
	valueName = args && args[1] || "$value";
	keyName = args && args[2] || "$key";

	evaluateExpression(element[2], context, gotCollection);

	function gotCollection(err, collection) {
		if (err) {
			cb(err);
			return;
		}
		var typeString = Object.prototype.toString.call(collection);

		if (typeString === "[object Object]") {
			if (typeof collection.on === "function" &&
				typeof collection.pause === "function" &&
				typeof collection.resume === "function") {

				gotIterator(collection);
			} else if (typeof collection.iterator === "function") {
				gotIterator(collection.iterator());
			}
		} else if (typeString === "[object Array]") {
			gotIterator(new ArrayIterator(collection));
		} else {
			cb(context.error("Can't iterate over " + typeof collection));
		}
	}

	function gotIterator(iterator) {
		var index = 0;

		iterator.on("data", function (key, value) {
			if (arguments.length === 1) {
				value = key;
				key = index;
			}

			iterator.pause();
			var scope = {
				"data": value,
				"vars": {}
			};

			scope.vars[indexName] = index;
			scope.vars[valueName] = value;
			scope.vars[keyName] = key;

			context.stack.push(scope);

			renderElements(element[3], context, function (err) {
				if (err) {
					cb(err);
					return;
				}

				context.stack.pop();
				index++;

				iterator.resume();
			});
		});

		var endCalls = 0;
		iterator.on("end", function () {
			endCalls++;
			if (endCalls !== 1) {
				throw new Error("end called too many times!");
			}
			cb(null);
		});
	}
}

function evaluateExpression(expression, context, cb) {
	saveToken(context, expression);

	if (typeof expression === "string") {
		cb(null, expression);
		return;
	}

	switch (name(expression)) {
	case "dot":
		evaluateDotSubExpression(expression, context, cb);
		break;
	case "sub":
		evaluateDotSubExpression(expression, context, cb);
		break;
	case "name":
		evaluateNameExpression(expression, context, cb);
		break;
	case "call":
		evaluateCallExpression(expression, context, cb);
		break;
	case "binary":
		evaluateBinaryExpression(expression, context, cb);
		break;
	case "unary-prefix":
		evaluateUnaryPrefixExpression(expression, context, cb);
		break;
	case "array":
		evaluateArrayExpression(expression, context, cb);
		break;
	case "object":
		evaluateObjectExpression(expression, context, cb);
		break;
	case "conditional":
		evaluateConditionalExpression(expression, context, cb);
		break;
	case "string":
		cb(null, expression[1]);
		break;
	case "num":
		cb(null, expression[1]);
		break;
	case "function":
		cb(context.error("functions are not allowed within templates"));
		return;
	case "assign":
		cb(context.error("assignment is not allowed within templates"));
		return;
	default:
		cb(context.error("unhandled expression type " + name(
			expression)));
		break;
	}
}

function evaluateDotSubExpression(expression, context, cb) {
	var objectValue;

	evaluateExpression(expression[1], context, gotObject);

	function gotObject(err, obj) {
		if (err) {
			cb(err);
			return;
		}

		if (typeof obj === "undefined") {
			cb(context.error("not an object "));
			return;
		}

		objectValue = obj;

		evaluateExpression(expression[2], context, gotPropertyName);
	}

	function gotPropertyName(err, propertyName) {
		if (err) {
			cb(err);
			return;
		}

		if (typeof objectValue.get === "function") {
			objectValue.get(propertyName, cb);
		} else {
			var value = objectValue[propertyName];
			if (typeof (value) === "function") {
				value = value.bind(objectValue);
			}
			cb(null, value);
		}
	}
}

function evaluateNameExpression(expression, context, cb) {
	var name = expression[1];
	var stackIndex = context.stack.length;

	if (name === "true") {
		cb(null, true);
		return;
	}

	if (name === "false") {
		cb(null, false);
		return;
	}

	if (name === "null") {
		cb(null, null);
		return;
	}

	function nextScope() {
		stackIndex--;
		if (stackIndex < 0) {
			cb(context.error("cannot resolve name '" + name + "'"));
			return;
		}

		var scope = context.stack[stackIndex];
		if (HOP(scope.vars, name)) {
			cb(null, scope.vars[name]);
		} else if (typeof scope.data.get === "function") {
			scope.data.get(name, function (err, value) {
				if (err) {
					cb(err);
					return;
				}

				if (typeof value === "undefined") {
					nextScope();
				} else {
					cb(null, value);
				}
			});
		} else if (HOP(scope.data, name)) {
			cb(null, scope.data[name]);
		} else {
			nextScope();
		}
	}

	nextScope();
}

function evaluateCallExpression(expression, context, cb) {
	// ["call", <function>, [arguments]

	evaluateExpression(expression[1], context, gotFunction);

	function gotFunction(err, fn) {
		if (err) {
			cb(err);
			return;
		}

		var args = expression[2];
		var index = 0;
		var evaluatedArgs = [];

		function next() {
			if (index >= args.length) {
				gotArgs();
				return;
			}

			var arg = args[index];

			evaluateExpression(arg, context, gotArg);

			function gotArg(err, value) {
				if (err) {
					cb(err);
					return;
				}

				evaluatedArgs[index] = value;
				index++;
				nextTick(next);
			}
		}

		next();

		function gotArgs() {
			if (typeof (fn) !== "function") {
				cb(context.error("not a function"));
			} else {
				cb(null, fn.apply(null, evaluatedArgs));
			}
		}
	}
}

function evaluateArrayExpression(expression, context, cb) {
	//["array",[<elements]]
	var elements = expression[1];
	var result = [];

	function next(i) {
		if (i >= elements.length) {
			cb(null, result);
			return;
		}

		evaluateExpression(elements[i], context, function (err, value) {
			if (err) {
				cb(err);
				return;
			}

			result[i] = value;
			next(i + 1);
		});
	}

	next(0);
}

function evaluateObjectExpression(expression, context, cb) {
	//["object",[[<key>,<value>],[<key>,<value>]]]

	var elements = expression[1];
	var result = {};

	function next(i) {
		if (i >= elements.length) {
			cb(null, result);
			return;
		}

		evaluateExpression(elements[i][1], context, function (err,
			value) {
			if (err) {
				cb(err);
				return;
			}

			var key = elements[i][0];

			result[key] = value;
			next(i + 1);
		});
	}

	next(0);
}

function evaluateBinaryExpression(expression, context, cb) {
	var operator = expression[1];
	var leftValue;

	evaluateExpression(expression[2], context, gotLeftValue);

	function gotLeftValue(err, value) {
		if (err) {
			cb(err);
			return;
		}

		leftValue = value;

		evaluateExpression(expression[3], context, gotRightValue);
	}

	function gotRightValue(err, rightValue) {
		if (err) {
			cb(err);
			return;
		}

		switch (operator) {
		case "==":
			cb(null, leftValue === rightValue);
			break;
		case "+":
			cb(null, leftValue + rightValue);
			break;
		case "-":
			cb(null, leftValue - rightValue);
			break;
		case "&":
			cb(context.error(
				"bitwise operator '&' not allowed in templates"));
			break;
		case "|":
			cb(context.error(
				"bitwise operator '|' not allowed in templates"));
			break;
		case "*":
			cb(null, leftValue * rightValue);
			break;
		case "/":
			cb(null, leftValue / rightValue);
			break;
		case "%":
			cb(null, leftValue % rightValue);
			break;
		case ">>":
			cb(context.error("bit shift operator '>>' " +
				"not allowed in templates"));
			break;
		case "<<":
			cb(context.error("bit shift operator '<<' " +
				"not allowed in templates"));
			break;
		case ">>>":
			cb(context.error("bit shift operator '>>>' " +
				"not allowed in templates"));
			break;
		case "<":
			cb(null, leftValue < rightValue);
			break;
		case ">":
			cb(null, leftValue > rightValue);
			break;
		case "<=":
			cb(null, leftValue <= rightValue);
			break;
		case ">=":
			cb(null, leftValue >= rightValue);
			break;
		case "===":
			cb(context.error(
				"'===' operator not allowed in templates. " +
				"Note that '==' is 'strictly equals' (non-casting)."
			));
			break;
		case "!=":
			cb(null, leftValue !== rightValue);
			break;
		case "!==":
			cb(context.error(
				"'!==' operator not allowed in templates. " +
				"Note that '!=' is 'strictly not equal' (non-casting)."
			));
			break;
		case "&&":
			cb(null, leftValue && rightValue);
			break;
		case "||":
			cb(null, leftValue || rightValue);
			break;
		default:
			cb(context.error("unhandled binary operator " + operator));
			break;
		}
	}
}

function evaluateConditionalExpression(expression, context, cb) {
	// ["conditional", <test>, <case true>, <case false>]

	evaluateExpression(expression[1], context, gotTest);

	function gotTest(err, value) {
		if (err) {
			cb(err);
			return;
		}

		if (value) {
			evaluateExpression(expression[2], context, cb);
		} else {
			evaluateExpression(expression[3], context, cb);
		}
	}
}

function evaluateUnaryPrefixExpression(expression, context, cb) {
	var operator = expression[1];
	evaluateExpression(expression[2], context, gotValue);

	function gotValue(err, value) {
		if (err) {
			cb(err);
			return;
		}

		switch (operator) {
		case "!":
			cb(null, !value);
			break;
		case "-":
			cb(null, -value);
			break;
		case "+":
			cb(null, +value);
			break;
		default:
			cb(context.error("unhandled unary-prefix operator " +
				operator));
			break;
		}
	}
}

function HOP(obj, prop) {
	if (!obj) {
		return false;
	} else {
		return Object.prototype.hasOwnProperty.call(obj, prop);
	}
}

function html(str) {
	return ("" + str).replace(/&|"|'|<|>/g, function (c) {
		switch (c) {
		case "&":
			return "&amp;";
		case "\"":
			return "&quot;";
		case "'":
			return "&#39;";
		case "<":
			return "&lt;";
		case ">":
			return "&gt;";
		}
	});
}

/** helper classes */

function ArrayIterator(array) {
	var self = this;

	self._array = array;
	self._index = 0;
	self._paused = 0;
	self._done = false;

	nextTick(function () {
		self._next();
	});
}

util.inherits(ArrayIterator, events.EventEmitter);

ArrayIterator.prototype._next = function () {
	var self = this;
	if (self._done) {
		return;
	}

	if (!self._paused) {
		if (self._index >= self._array.length) {
			self._done = true;
			nextTick(function () {
				self.emit("end");
			});
			return;
		}

		var data = self._array[self._index];
		self._index++;
		nextTick(function () {
			self.emit("data", data);
			self._next();
		});
	}
};

ArrayIterator.prototype.resume = function () {
	this._paused--;
	this._next();
};

ArrayIterator.prototype.pause = function () {
	this._paused++;
};

exports.render = render;
