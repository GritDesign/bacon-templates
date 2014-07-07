"use strict";

/***********************************************************************

  A JavaScript tokenizer / parser / beautifier / compressor.

  This version is suitable for Node.js.  With minimal changes (the
  exports stuff) it should work on any JS platform.

  This file contains the tokenizer/parser.  It is a port to JavaScript
  of parse-js [1], a JavaScript parser library written in Common Lisp
  by Marijn Haverbeke.  Thank you Marijn!

  [1] http://marijn.haverbeke.nl/parse-js/

  Exported functions:

    - tokenizer(code) -- returns a function.  Call the returned
      function to fetch the next token.

    - parse(code) -- returns an AST of the given JavaScript code.

  -------------------------------- (C) ---------------------------------

                           Author: Mihai Bazon
                         <mihai.bazon@gmail.com>
                       http://mihai.bazon.net/blog

  Distributed under the BSD license:

    Copyright 2010 (c) Mihai Bazon <mihai.bazon@gmail.com>
    Based on parse-js (http://marijn.haverbeke.nl/parse-js/).

    Redistribution and use in source and binary forms, with or without
    modification, are permitted provided that the following conditions
    are met:

        * Redistributions of source code must retain the above
          copyright notice, this list of conditions and the following
          disclaimer.

        * Redistributions in binary form must reproduce the above
          copyright notice, this list of conditions and the following
          disclaimer in the documentation and/or other materials
          provided with the distribution.

    THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER “AS IS” AND ANY
    EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
    IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
    PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE
    LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
    OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
    PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
    PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
    THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
    TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
    THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
    SUCH DAMAGE.

 ***********************************************************************/

/* -----[ Tokenizer (constants) ]----- */

var KEYWORDS = arrayToHash([
	"break",
	"case",
	"catch",
	"const",
	"continue",
	"debugger",
	"default",
	"delete",
	"do",
	"else",
	"finally",
	"for",
	"function",
	"if",
	"in",
	"instanceof",
	"new",
	"return",
	"switch",
	"throw",
	"try",
	"typeof",
	"var",
	"void",
	"while",
	"with"
]);

var RESERVED_WORDS = arrayToHash([
	"abstract",
	"boolean",
	"byte",
	"char",
	"class",
	"double",
	"enum",
	"export",
	"extends",
	"final",
	"float",
	"goto",
	"implements",
	"import",
	"int",
	"interface",
	"long",
	"native",
	"package",
	"private",
	"protected",
	"public",
	"short",
	"static",
	"super",
	"synchronized",
	"throws",
	"transient",
	"volatile"
]);

var KEYWORDS_BEFORE_EXPRESSION = arrayToHash([
	"return",
	"new",
	"delete",
	"throw",
	"else",
	"case"
]);

var KEYWORDS_ATOM = arrayToHash([
	"false",
	"null",
	"true",
	"undefined"
]);

var OPERATOR_CHARS = arrayToHash(characters("+-*&%=<>!?|~^"));

var RE_HEX_NUMBER = /^0x[0-9a-f]+$/i;
var RE_OCT_NUMBER = /^0[0-7]+$/;
var RE_DEC_NUMBER = /^\d*\.?\d*(?:e[+-]?\d*(?:\d\.?|\.?\d)\d*)?$/i;

var OPERATORS = arrayToHash([
	"in",
	"instanceof",
	"typeof",
	"new",
	"void",
	"delete",
	"++",
	"--",
	"+",
	"-",
	"!",
	"~",
	"&",
	"|",
	"^",
	"*",
	"/",
	"%",
	">>",
	"<<",
	">>>",
	"<",
	">",
	"<=",
	">=",
	"==",
	"===",
	"!=",
	"!==",
	"?",
	"=",
	"+=",
	"-=",
	"/=",
	"*=",
	"%=",
	">>=",
	"<<=",
	">>>=",
	"|=",
	"^=",
	"&=",
	"&&",
	"||"
]);

var TEMPLATE_START_COMMANDS = arrayToHash([
	"each",
	"if",
	"else",
	"tmpl",
	"verbatim",
	"html",
	"layout",
	"var",
	"!"
]);

var TEMPLATE_END_COMMANDS = arrayToHash([
	"each",
	"if",
	"verbatim"
]);

var WHITESPACE_CHARS = arrayToHash(characters(
	[
		" \u00a0\n\r\t\f\u000b\u200b\u180e\u2000\u2001\u2002\u2003\u2004",
		"\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000"
	].join("")
));

var PUNC_BEFORE_EXPRESSION = arrayToHash(characters("[{(,.;:"));

var PUNC_CHARS = arrayToHash(characters("[]{}(),;:"));

/* -----[ Tokenizer ]----- */

// regexps adapted from http://xregexp.com/plugins/#unicode
var UNICODE = {
	letter: new RegExp([
		"[\\u0041-\\u005A\\u0061-\\u007A\\u00AA\\u00B5\\u00BA\\u00C",
		"0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02C1\\u02C6-\\u02D1\\u0",
		"2E0-\\u02E4\\u02EC\\u02EE\\u0370-\\u0374\\u0376\\u0377\\u0",
		"37A-\\u037D\\u0386\\u0388-\\u038A\\u038C\\u038E-\\u03A1\\u",
		"03A3-\\u03F5\\u03F7-\\u0481\\u048A-\\u0523\\u0531-\\u0556",
		"\\u0559\\u0561-\\u0587\\u05D0-\\u05EA\\u05F0-\\u05F2\\u062",
		"1-\\u064A\\u066E\\u066F\\u0671-\\u06D3\\u06D5\\u06E5\\u06E",
		"6\\u06EE\\u06EF\\u06FA-\\u06FC\\u06FF\\u0710\\u0712-\\u072",
		"F\\u074D-\\u07A5\\u07B1\\u07CA-\\u07EA\\u07F4\\u07F5\\u07F",
		"A\\u0904-\\u0939\\u093D\\u0950\\u0958-\\u0961\\u0971\\u097",
		"2\\u097B-\\u097F\\u0985-\\u098C\\u098F\\u0990\\u0993-\\u09",
		"A8\\u09AA-\\u09B0\\u09B2\\u09B6-\\u09B9\\u09BD\\u09CE\\u09",
		"DC\\u09DD\\u09DF-\\u09E1\\u09F0\\u09F1\\u0A05-\\u0A0A\\u0A",
		"0F\\u0A10\\u0A13-\\u0A28\\u0A2A-\\u0A30\\u0A32\\u0A33\\u0A",
		"35\\u0A36\\u0A38\\u0A39\\u0A59-\\u0A5C\\u0A5E\\u0A72-\\u0A",
		"74\\u0A85-\\u0A8D\\u0A8F-\\u0A91\\u0A93-\\u0AA8\\u0AAA-\\u",
		"0AB0\\u0AB2\\u0AB3\\u0AB5-\\u0AB9\\u0ABD\\u0AD0\\u0AE0\\u0",
		"AE1\\u0B05-\\u0B0C\\u0B0F\\u0B10\\u0B13-\\u0B28\\u0B2A-\\u",
		"0B30\\u0B32\\u0B33\\u0B35-\\u0B39\\u0B3D\\u0B5C\\u0B5D\\u0",
		"B5F-\\u0B61\\u0B71\\u0B83\\u0B85-\\u0B8A\\u0B8E-\\u0B90\\u",
		"0B92-\\u0B95\\u0B99\\u0B9A\\u0B9C\\u0B9E\\u0B9F\\u0BA3\\u0",
		"BA4\\u0BA8-\\u0BAA\\u0BAE-\\u0BB9\\u0BD0\\u0C05-\\u0C0C\\u",
		"0C0E-\\u0C10\\u0C12-\\u0C28\\u0C2A-\\u0C33\\u0C35-\\u0C39",
		"\\u0C3D\\u0C58\\u0C59\\u0C60\\u0C61\\u0C85-\\u0C8C\\u0C8E-",
		"\\u0C90\\u0C92-\\u0CA8\\u0CAA-\\u0CB3\\u0CB5-\\u0CB9\\u0CB",
		"D\\u0CDE\\u0CE0\\u0CE1\\u0D05-\\u0D0C\\u0D0E-\\u0D10\\u0D1",
		"2-\\u0D28\\u0D2A-\\u0D39\\u0D3D\\u0D60\\u0D61\\u0D7A-\\u0D",
		"7F\\u0D85-\\u0D96\\u0D9A-\\u0DB1\\u0DB3-\\u0DBB\\u0DBD\\u0",
		"DC0-\\u0DC6\\u0E01-\\u0E30\\u0E32\\u0E33\\u0E40-\\u0E46\\u",
		"0E81\\u0E82\\u0E84\\u0E87\\u0E88\\u0E8A\\u0E8D\\u0E94-\\u0",
		"E97\\u0E99-\\u0E9F\\u0EA1-\\u0EA3\\u0EA5\\u0EA7\\u0EAA\\u0",
		"EAB\\u0EAD-\\u0EB0\\u0EB2\\u0EB3\\u0EBD\\u0EC0-\\u0EC4\\u0",
		"EC6\\u0EDC\\u0EDD\\u0F00\\u0F40-\\u0F47\\u0F49-\\u0F6C\\u0",
		"F88-\\u0F8B\\u1000-\\u102A\\u103F\\u1050-\\u1055\\u105A-\\",
		"u105D\\u1061\\u1065\\u1066\\u106E-\\u1070\\u1075-\\u1081\\",
		"u108E\\u10A0-\\u10C5\\u10D0-\\u10FA\\u10FC\\u1100-\\u1159",
		"\\u115F-\\u11A2\\u11A8-\\u11F9\\u1200-\\u1248\\u124A-\\u12",
		"4D\\u1250-\\u1256\\u1258\\u125A-\\u125D\\u1260-\\u1288\\u1",
		"28A-\\u128D\\u1290-\\u12B0\\u12B2-\\u12B5\\u12B8-\\u12BE\\",
		"u12C0\\u12C2-\\u12C5\\u12C8-\\u12D6\\u12D8-\\u1310\\u1312-",
		"\\u1315\\u1318-\\u135A\\u1380-\\u138F\\u13A0-\\u13F4\\u140",
		"1-\\u166C\\u166F-\\u1676\\u1681-\\u169A\\u16A0-\\u16EA\\u1",
		"700-\\u170C\\u170E-\\u1711\\u1720-\\u1731\\u1740-\\u1751\\",
		"u1760-\\u176C\\u176E-\\u1770\\u1780-\\u17B3\\u17D7\\u17DC",
		"\\u1820-\\u1877\\u1880-\\u18A8\\u18AA\\u1900-\\u191C\\u195",
		"0-\\u196D\\u1970-\\u1974\\u1980-\\u19A9\\u19C1-\\u19C7\\u1",
		"A00-\\u1A16\\u1B05-\\u1B33\\u1B45-\\u1B4B\\u1B83-\\u1BA0\\",
		"u1BAE\\u1BAF\\u1C00-\\u1C23\\u1C4D-\\u1C4F\\u1C5A-\\u1C7D",
		"\\u1D00-\\u1DBF\\u1E00-\\u1F15\\u1F18-\\u1F1D\\u1F20-\\u1F",
		"45\\u1F48-\\u1F4D\\u1F50-\\u1F57\\u1F59\\u1F5B\\u1F5D\\u1F",
		"5F-\\u1F7D\\u1F80-\\u1FB4\\u1FB6-\\u1FBC\\u1FBE\\u1FC2-\\u",
		"1FC4\\u1FC6-\\u1FCC\\u1FD0-\\u1FD3\\u1FD6-\\u1FDB\\u1FE0-",
		"\\u1FEC\\u1FF2-\\u1FF4\\u1FF6-\\u1FFC\\u2071\\u207F\\u2090",
		"-\\u2094\\u2102\\u2107\\u210A-\\u2113\\u2115\\u2119-\\u211",
		"D\\u2124\\u2126\\u2128\\u212A-\\u212D\\u212F-\\u2139\\u213",
		"C-\\u213F\\u2145-\\u2149\\u214E\\u2183\\u2184\\u2C00-\\u2C",
		"2E\\u2C30-\\u2C5E\\u2C60-\\u2C6F\\u2C71-\\u2C7D\\u2C80-\\u",
		"2CE4\\u2D00-\\u2D25\\u2D30-\\u2D65\\u2D6F\\u2D80-\\u2D96\\",
		"u2DA0-\\u2DA6\\u2DA8-\\u2DAE\\u2DB0-\\u2DB6\\u2DB8-\\u2DBE",
		"\\u2DC0-\\u2DC6\\u2DC8-\\u2DCE\\u2DD0-\\u2DD6\\u2DD8-\\u2D",
		"DE\\u2E2F\\u3005\\u3006\\u3031-\\u3035\\u303B\\u303C\\u304",
		"1-\\u3096\\u309D-\\u309F\\u30A1-\\u30FA\\u30FC-\\u30FF\\u3",
		"105-\\u312D\\u3131-\\u318E\\u31A0-\\u31B7\\u31F0-\\u31FF\\",
		"u3400\\u4DB5\\u4E00\\u9FC3\\uA000-\\uA48C\\uA500-\\uA60C\\",
		"uA610-\\uA61F\\uA62A\\uA62B\\uA640-\\uA65F\\uA662-\\uA66E",
		"\\uA67F-\\uA697\\uA717-\\uA71F\\uA722-\\uA788\\uA78B\\uA78",
		"C\\uA7FB-\\uA801\\uA803-\\uA805\\uA807-\\uA80A\\uA80C-\\uA",
		"822\\uA840-\\uA873\\uA882-\\uA8B3\\uA90A-\\uA925\\uA930-\\",
		"uA946\\uAA00-\\uAA28\\uAA40-\\uAA42\\uAA44-\\uAA4B\\uAC00",
		"\\uD7A3\\uF900-\\uFA2D\\uFA30-\\uFA6A\\uFA70-\\uFAD9\\uFB0",
		"0-\\uFB06\\uFB13-\\uFB17\\uFB1D\\uFB1F-\\uFB28\\uFB2A-\\uF",
		"B36\\uFB38-\\uFB3C\\uFB3E\\uFB40\\uFB41\\uFB43\\uFB44\\uFB",
		"46-\\uFBB1\\uFBD3-\\uFD3D\\uFD50-\\uFD8F\\uFD92-\\uFDC7\\u",
		"FDF0-\\uFDFB\\uFE70-\\uFE74\\uFE76-\\uFEFC\\uFF21-\\uFF3A",
		"\\uFF41-\\uFF5A\\uFF66-\\uFFBE\\uFFC2-\\uFFC7\\uFFCA-\\uFF",
		"CF\\uFFD2-\\uFFD7\\uFFDA-\\uFFDC]"
	].join("")),
	nonSpacingMark: new RegExp([
		"[\\u0300-\\u036F\\u0483-\\u0487\\u0591-\\u05BD\\u05BF\\u05",
		"C1\\u05C2\\u05C4\\u05C5\\u05C7\\u0610-\\u061A\\u064B-\\u06",
		"5E\\u0670\\u06D6-\\u06DC\\u06DF-\\u06E4\\u06E7\\u06E8\\u06",
		"EA-\\u06ED\\u0711\\u0730-\\u074A\\u07A6-\\u07B0\\u07EB-\\u",
		"07F3\\u0816-\\u0819\\u081B-\\u0823\\u0825-\\u0827\\u0829-",
		"\\u082D\\u0900-\\u0902\\u093C\\u0941-\\u0948\\u094D\\u0951",
		"-\\u0955\\u0962\\u0963\\u0981\\u09BC\\u09C1-\\u09C4\\u09CD",
		"\\u09E2\\u09E3\\u0A01\\u0A02\\u0A3C\\u0A41\\u0A42\\u0A47\\",
		"u0A48\\u0A4B-\\u0A4D\\u0A51\\u0A70\\u0A71\\u0A75\\u0A81\\u",
		"0A82\\u0ABC\\u0AC1-\\u0AC5\\u0AC7\\u0AC8\\u0ACD\\u0AE2\\u0",
		"AE3\\u0B01\\u0B3C\\u0B3F\\u0B41-\\u0B44\\u0B4D\\u0B56\\u0B",
		"62\\u0B63\\u0B82\\u0BC0\\u0BCD\\u0C3E-\\u0C40\\u0C46-\\u0C",
		"48\\u0C4A-\\u0C4D\\u0C55\\u0C56\\u0C62\\u0C63\\u0CBC\\u0CB",
		"F\\u0CC6\\u0CCC\\u0CCD\\u0CE2\\u0CE3\\u0D41-\\u0D44\\u0D4D",
		"\\u0D62\\u0D63\\u0DCA\\u0DD2-\\u0DD4\\u0DD6\\u0E31\\u0E34-",
		"\\u0E3A\\u0E47-\\u0E4E\\u0EB1\\u0EB4-\\u0EB9\\u0EBB\\u0EBC",
		"\\u0EC8-\\u0ECD\\u0F18\\u0F19\\u0F35\\u0F37\\u0F39\\u0F71-",
		"\\u0F7E\\u0F80-\\u0F84\\u0F86\\u0F87\\u0F90-\\u0F97\\u0F99",
		"-\\u0FBC\\u0FC6\\u102D-\\u1030\\u1032-\\u1037\\u1039\\u103",
		"A\\u103D\\u103E\\u1058\\u1059\\u105E-\\u1060\\u1071-\\u107",
		"4\\u1082\\u1085\\u1086\\u108D\\u109D\\u135F\\u1712-\\u1714",
		"\\u1732-\\u1734\\u1752\\u1753\\u1772\\u1773\\u17B7-\\u17BD",
		"\\u17C6\\u17C9-\\u17D3\\u17DD\\u180B-\\u180D\\u18A9\\u1920",
		"-\\u1922\\u1927\\u1928\\u1932\\u1939-\\u193B\\u1A17\\u1A18",
		"\\u1A56\\u1A58-\\u1A5E\\u1A60\\u1A62\\u1A65-\\u1A6C\\u1A73",
		"-\\u1A7C\\u1A7F\\u1B00-\\u1B03\\u1B34\\u1B36-\\u1B3A\\u1B3",
		"C\\u1B42\\u1B6B-\\u1B73\\u1B80\\u1B81\\u1BA2-\\u1BA5\\u1BA",
		"8\\u1BA9\\u1C2C-\\u1C33\\u1C36\\u1C37\\u1CD0-\\u1CD2\\u1CD",
		"4-\\u1CE0\\u1CE2-\\u1CE8\\u1CED\\u1DC0-\\u1DE6\\u1DFD-\\u1",
		"DFF\\u20D0-\\u20DC\\u20E1\\u20E5-\\u20F0\\u2CEF-\\u2CF1\\u",
		"2DE0-\\u2DFF\\u302A-\\u302F\\u3099\\u309A\\uA66F\\uA67C\\u",
		"A67D\\uA6F0\\uA6F1\\uA802\\uA806\\uA80B\\uA825\\uA826\\uA8",
		"C4\\uA8E0-\\uA8F1\\uA926-\\uA92D\\uA947-\\uA951\\uA980-\\u",
		"A982\\uA9B3\\uA9B6-\\uA9B9\\uA9BC\\uAA29-\\uAA2E\\uAA31\\u",
		"AA32\\uAA35\\uAA36\\uAA43\\uAA4C\\uAAB0\\uAAB2-\\uAAB4\\uA",
		"AB7\\uAAB8\\uAABE\\uAABF\\uAAC1\\uABE5\\uABE8\\uABED\\uFB1",
		"E\\uFE00-\\uFE0F\\uFE20-\\uFE26]"
	].join("")),
	spaceCombiningMark: new RegExp([
		"[\\u0903\\u093E-\\u0940\\u0949-\\u094C\\u094E\\u0982\\u098",
		"3\\u09BE-\\u09C0\\u09C7\\u09C8\\u09CB\\u09CC\\u09D7\\u0A03",
		"\\u0A3E-\\u0A40\\u0A83\\u0ABE-\\u0AC0\\u0AC9\\u0ACB\\u0ACC",
		"\\u0B02\\u0B03\\u0B3E\\u0B40\\u0B47\\u0B48\\u0B4B\\u0B4C\\",
		"u0B57\\u0BBE\\u0BBF\\u0BC1\\u0BC2\\u0BC6-\\u0BC8\\u0BCA-\\",
		"u0BCC\\u0BD7\\u0C01-\\u0C03\\u0C41-\\u0C44\\u0C82\\u0C83\\",
		"u0CBE\\u0CC0-\\u0CC4\\u0CC7\\u0CC8\\u0CCA\\u0CCB\\u0CD5\\u",
		"0CD6\\u0D02\\u0D03\\u0D3E-\\u0D40\\u0D46-\\u0D48\\u0D4A-\\",
		"u0D4C\\u0D57\\u0D82\\u0D83\\u0DCF-\\u0DD1\\u0DD8-\\u0DDF\\",
		"u0DF2\\u0DF3\\u0F3E\\u0F3F\\u0F7F\\u102B\\u102C\\u1031\\u1",
		"038\\u103B\\u103C\\u1056\\u1057\\u1062-\\u1064\\u1067-\\u1",
		"06D\\u1083\\u1084\\u1087-\\u108C\\u108F\\u109A-\\u109C\\u1",
		"7B6\\u17BE-\\u17C5\\u17C7\\u17C8\\u1923-\\u1926\\u1929-\\u",
		"192B\\u1930\\u1931\\u1933-\\u1938\\u19B0-\\u19C0\\u19C8\\u",
		"19C9\\u1A19-\\u1A1B\\u1A55\\u1A57\\u1A61\\u1A63\\u1A64\\u1",
		"A6D-\\u1A72\\u1B04\\u1B35\\u1B3B\\u1B3D-\\u1B41\\u1B43\\u1",
		"B44\\u1B82\\u1BA1\\u1BA6\\u1BA7\\u1BAA\\u1C24-\\u1C2B\\u1C",
		"34\\u1C35\\u1CE1\\u1CF2\\uA823\\uA824\\uA827\\uA880\\uA881",
		"\\uA8B4-\\uA8C3\\uA952\\uA953\\uA983\\uA9B4\\uA9B5\\uA9BA",
		"\\uA9BB\\uA9BD-\\uA9C0\\uAA2F\\uAA30\\uAA33\\uAA34\\uAA4D",
		"\\uAA7B\\uABE3\\uABE4\\uABE6\\uABE7\\uABE9\\uABEA\\uABEC]"
	].join("")),
	connectorPunctuation: new RegExp(
		"[\\u005F\\u203F\\u2040\\u2054\\uFE33\\uFE34\\uFE4D-\\uFE4F\\uFF3F]"
	)
};

function isLetter(ch) {
	return UNICODE.letter.test(ch);
}

function isDigit(ch) {
	ch = ch.charCodeAt(0);
	return ch >= 48 && ch <= 57;
}

function isAlphanumericChar(ch) {
	return isDigit(ch) || isLetter(ch);
}

function isUnicodeCombiningMark(ch) {
	return UNICODE.nonSpacingMark.test(ch) ||
		UNICODE.spaceCombiningMark.test(ch);
}

function isUnicodeConnectorPunctuation(ch) {
	return UNICODE.connectorPunctuation.test(ch);
}

function isIdentifierStart(ch) {
	return ch === "$" || ch === "_" || isLetter(ch);
}

function isIdentifierChar(ch) {
	return isIdentifierStart(ch) ||
		isUnicodeCombiningMark(ch) ||
		isDigit(ch) ||
		isUnicodeConnectorPunctuation(ch) ||
		ch === "\u200c" || /* zero-width non-joiner <ZWNJ> */
		ch === "\u200d"
	/* zero-width joiner <ZWJ>
            (in my ECMA-262 PDF, this is also 200c) */
	;
}

function parseJsNumber(num) {
	if (RE_HEX_NUMBER.test(num)) {
		return parseInt(num.substr(2), 16);
	} else if (RE_OCT_NUMBER.test(num)) {
		return parseInt(num.substr(1), 8);
	} else if (RE_DEC_NUMBER.test(num)) {
		return parseFloat(num);
	}
}

function ParseError(message, line, col, pos) {
	this.message = message;
	this.line = line + 1;
	this.col = col + 1;
	this.pos = pos + 1;
	this.stack = new Error().stack;
}

ParseError.prototype.toString = function () {
	return this.message +
		" (line: " + this.line +
		", col: " + this.col +
		", pos: " + this.pos +
		")" + "\n\n" + this.stack;
};

function throwParseError(message, line, col, pos) {
	throw new ParseError(message, line, col, pos);
}

function isToken(token, type, val) {
	return token.type === type && (val === undefined ||
		token.value === val);
}

var EX_EOF = {};

var TMPL_MODE_NONE = 0,
	TMPL_MODE_HTML = 1,
	TMPL_MODE_COMMAND = 2,
	TMPL_MODE_VARIABLE = 3;

function tokenizer($TEXT, hasTemplateMode) {

	var S = {
		text: $TEXT.replace(/\r\n?|[\n\u2028\u2029]/g, "\n")
			.replace(/^\uFEFF/, ""),
		pos: 0,
		tokpos: 0,
		line: 0,
		tokline: 0,
		col: 0,
		tokcol: 0,
		newlineBefore: false,
		regexAllowed: false,
		curlyCount: 0,
		templateMode: hasTemplateMode ? TMPL_MODE_HTML : TMPL_MODE_NONE,
		commentsBefore: []
	};

	function peek() {
		return S.text.charAt(S.pos);
	}

	function next(signalEof, inString) {
		var ch = S.text.charAt(S.pos++);
		if (signalEof && !ch) {
			throw EX_EOF;
		}
		if (ch === "\n") {
			S.newlineBefore = S.newlineBefore || !inString;
			++S.line;
			S.col = 0;
		} else {
			++S.col;
		}
		return ch;
	}

	function find(what, signalEof) {
		var pos = S.text.indexOf(what, S.pos);
		if (signalEof && pos === -1) {
			throw EX_EOF;
		}
		return pos;
	}

	function startToken() {
		S.tokline = S.line;
		S.tokcol = S.col;
		S.tokpos = S.pos;
	}

	function token(type, value, isComment) {
		S.regexAllowed = ((type === "operator" && !HOP(UNARY_POSTFIX,
				value)) ||
			(type === "keyword" && HOP(KEYWORDS_BEFORE_EXPRESSION,
				value)) ||
			(type === "punc" && HOP(PUNC_BEFORE_EXPRESSION, value)));
		var ret = {
			type: type,
			value: value,
			line: S.tokline,
			col: S.tokcol,
			pos: S.tokpos,
			endpos: S.pos,
			nlb: S.newlineBefore
		};
		if (!isComment) {
			ret.commentsBefore = S.commentsBefore;
			S.commentsBefore = [];
		}
		S.newlineBefore = false;
		return ret;
	}

	function skipWhitespace() {
		while (HOP(WHITESPACE_CHARS, peek())) {
			next();
		}
	}

	function readWhile(pred) {
		var ret = "",
			ch = peek(),
			i = 0;
		while (ch && pred(ch, i++)) {
			ret += next();
			ch = peek();
		}
		return ret;
	}

	function parseError(err) {
		throwParseError(err, S.tokline, S.tokcol, S.tokpos);
	}

	function readNum(prefix) {
		var hasE = false,
			afterE = false,
			hasX = false,
			hasDot = prefix === ".";

		var num = readWhile(function (ch, i) {
			if (ch === "x" || ch === "X") {
				if (hasX) {
					return false;
				}
				hasX = true;
				return true;
			}
			if (!hasX && (ch === "E" || ch === "e")) {
				if (hasE) {
					return false;
				}
				hasE = true;
				afterE = true;
				return true;
			}
			if (ch === "-") {
				if (afterE || (i === 0 && !prefix)) {
					return true;
				}
				return false;
			}
			if (ch === "+") {
				return afterE;
			}
			afterE = false;
			if (ch === ".") {
				if (!hasDot && !hasX) {
					hasDot = true;
					return true;
				}
				return false;
			}
			return isAlphanumericChar(ch);
		});
		if (prefix) {
			num = prefix + num;
		}
		var valid = parseJsNumber(num);
		if (!isNaN(valid)) {
			return token("num", valid);
		} else {
			parseError("Invalid syntax: " + num);
		}
	}

	function readEscapedChar(inString) {
		var ch = next(true, inString);
		switch (ch) {
		case "n":
			return "\n";
		case "r":
			return "\r";
		case "t":
			return "\t";
		case "b":
			return "\b";
		case "v":
			return "\u000b";
		case "f":
			return "\f";
		case "0":
			return "\0";
		case "x":
			return String.fromCharCode(hexBytes(2));
		case "u":
			return String.fromCharCode(hexBytes(4));
		case "\n":
			return "";
		default:
			return ch;
		}
	}

	function hexBytes(n) {
		var num = 0;
		for (; n > 0; --n) {
			var digit = parseInt(next(true), 16);
			if (isNaN(digit)) {
				parseError("Invalid hex-character pattern in string");
			}
			num = (num * 16) + digit;
		}
		return num;
	}

	function readString() {
		return withEofError("Unterminated string constant", function () {
			var quote = next(),
				ret = "",
				octalLen,
				first,
				ch;

			function whileOctal(ch) {
				if (ch >= "0" && ch <= "7") {
					if (!first) {
						first = ch;
						return ++octalLen;
					} else if (first <= "3" && octalLen <= 2) {
						return ++octalLen;
					} else if (first >= "4" && octalLen <= 1) {
						return ++octalLen;
					}
				}
				return false;
			}

			for (;;) {
				ch = next(true);
				if (ch === "\\") {
					// read OctalEscapeSequence 
					// (XXX: deprecated if "strict mode")
					// https://github.com/mishoo/UglifyJS/issues/178
					octalLen = 0;
					first = null;
					ch = readWhile(whileOctal);
					if (octalLen > 0) {
						ch = String.fromCharCode(parseInt(ch, 8));
					} else {
						ch = readEscapedChar(true);
					}
				} else if (ch === quote) {
					break;
				}
				ret += ch;
			}
			return token("string", ret);
		});
	}

	function readLineComment() {
		next();
		var i = find("\n"),
			ret;
		if (i === -1) {
			ret = S.text.substr(S.pos);
			S.pos = S.text.length;
		} else {
			ret = S.text.substring(S.pos, i);
			S.pos = i;
		}
		return token("comment1", ret, true);
	}

	function readMultilineComment() {
		next();
		return withEofError("Unterminated multiline comment",
			function () {
				var i = find("*/", true),
					text = S.text.substring(S.pos, i);
				S.pos = i + 2;
				S.line += text.split("\n").length - 1;
				S.newlineBefore = text.indexOf("\n") >= 0;

				return token("comment2", text, true);
			});
	}

	function readMultilineTemplateComment() {
		next();
		return withEofError("Unterminated multiline comment",
			function () {
				var i = find("}}", true),
					text = S.text.substring(S.pos, i);
				S.pos = i + 2;
				S.line += text.split("\n").length - 1;
				S.newlineBefore = text.indexOf("\n") >= 0;

				return token("comment2", text, true);
			});
	}

	function readName() {
		var backslash = false,
			name = "",
			ch, escaped = false,
			hex;
		while ((ch = peek()) !== null) {
			if (!backslash) {
				if (ch === "\\") {
					escaped = true;
					backslash = true;
					next();
				} else if (isIdentifierChar(ch)) {
					name += next();
				} else {
					break;
				}
			} else {
				if (ch !== "u") {
					parseError(
						"Expecting UnicodeEscapeSequence -- uXXXX");
				}
				ch = readEscapedChar();
				if (!isIdentifierChar(ch)) {
					parseError("Unicode char: " +
						ch.charCodeAt(0) +
						" is not valid in identifier");
				}
				name += ch;
				backslash = false;
			}
		}
		if (HOP(KEYWORDS, name) && escaped) {
			hex = name.charCodeAt(0).toString(16).toUpperCase();
			name = "\\u" + "0000".substr(hex.length) + hex + name.slice(
				1);
		}
		return name;
	}

	function readRegexp(regexp) {
		return withEofError("Unterminated regular expression",
			function () {
				var prevBackslash = false,
					ch, inClass = false;
				while ((ch = next(true))) {
					if (prevBackslash) {
						regexp += "\\" + ch;
						prevBackslash = false;
					} else if (ch === "[") {
						inClass = true;
						regexp += ch;
					} else if (ch === "]" && inClass) {
						inClass = false;
						regexp += ch;
					} else if (ch === "/" && !inClass) {
						break;
					} else if (ch === "\\") {
						prevBackslash = true;
					} else {
						regexp += ch;
					}
				}

				var mods = readName();
				return token("regexp", [regexp, mods]);
			});
	}

	function readOperator(prefix) {
		function grow(op) {
			if (!peek()) {
				return op;
			}
			var bigger = op + peek();
			if (HOP(OPERATORS, bigger)) {
				next();
				return grow(bigger);
			} else {
				return op;
			}
		}
		return token("operator", grow(prefix || next()));
	}


	//       #################################################################
	//       #################################################################
	//       #################################################################
	//       #################################################################
	//       #################################################################
	//       #################################################################
	//       #################################################################
	//       #################################################################
	//       #################################################################
	//       #################################################################

	var commandRegex = /^{{(\/)?([a-z!]+)([ }\(])/;

	function peekTemplateCommand() {
		var end = S.pos + 20;
		if (end > S.text.length) {
			end = S.text.length;
		}
		var lookahead = S.text.substring(S.pos, end);
		var matches = commandRegex.exec(lookahead);
		if (matches) {
			var isEnd = matches[1] || "";
			var command = matches[2];
			var validCommands =
				isEnd ? TEMPLATE_END_COMMANDS :
				TEMPLATE_START_COMMANDS;
			if (HOP(validCommands, command)) {
				return [isEnd, command];
			}
		}
		return null;
	}

	function peekTemplateVariable() {
		return S.text.charAt(S.pos) === "$" && S.text.charAt(S.pos +
			1) === "{";
	}

	function readTpunc() {
		var ch = peek();
		if (ch === "$") {
			next();
			next();
			S.templateMode = TMPL_MODE_VARIABLE;
			S.curlyCount = 0;
			return token("tpunc", "${");
		} else if (ch === "{") {
			var templateCommand = peekTemplateCommand();
			var isEndTag = templateCommand[0];
			if (templateCommand) {
				if (!isEndTag && templateCommand[1] === "verbatim") {
					return readVerbatim();
				} else if (!isEndTag && templateCommand[1] === "!") {
					S.commentsBefore.push(
						readMultilineTemplateComment());
					return nextToken();
				} else {
					S.templateMode = TMPL_MODE_COMMAND;
					S.curlyCount = 0;

					next();
					next();
					if (isEndTag) { // also eat up "/" for end commands
						next();
						return token("tpunc", "{{/");
					} else {
						return token("tpunc", "{{");
					}
				}

			}
		}

		parseError("Error parsing template");
	}

	function readVerbatim() {
		next();
		return withEofError("Unterminated {{verbatim}}", function () {
			var i = find("{{/verbatim}}", true),
				text = S.text.substring(S.pos + 11, i);
			S.pos = i + 13;
			S.line += text.split("\n").length - 1;
			S.newlineBefore = text.indexOf("\n") >= 0;

			return token("html", text);
		});
	}

	function readTemplate() {
		var ret = "";

		for (;;) {
			var p = peek();
			if (p === "$" && peekTemplateVariable() ||
				p === "{" && peekTemplateCommand()) {
				if (ret === "") {
					return readTpunc();
				} else {
					break;
				}
			}

			var ch = next();
			if (!ch) {
				break;
			}
			ret += ch;
		}

		return token("html", ret);
	}


	//       ##################################################################
	//       ##################################################################
	//       ##################################################################
	//       ##################################################################
	//       ##################################################################
	//       ##################################################################
	//       ##################################################################
	//       ##################################################################
	//       ##################################################################
	//       ##################################################################


	function handleSlash() {
		next();
		var regexAllowed = S.regexAllowed;
		switch (peek()) {
		case "/":
			S.commentsBefore.push(readLineComment());
			S.regexAllowed = regexAllowed;
			return nextToken();
		case "*":
			S.commentsBefore.push(readMultilineComment());
			S.regexAllowed = regexAllowed;
			return nextToken();
		}
		return S.regexAllowed ? readRegexp("") : readOperator("/");
	}

	function handleDot() {
		next();
		return isDigit(peek()) ? readNum(".") : token("punc", ".");
	}

	function readWord() {
		var word = readName();
		return !HOP(KEYWORDS, word) ? token("name", word) :
			HOP(OPERATORS, word) ? token("operator", word) :
			HOP(KEYWORDS_ATOM, word) ? token("atom", word) :
			token("keyword", word);
	}

	function withEofError(eofError, cont) {
		try {
			return cont();
		} catch (ex) {
			if (ex === EX_EOF) {
				parseError(eofError);
			} else {
				throw ex;
			}
		}
	}

	function nextToken(forceRegexp) {
		if (forceRegexp !== undefined) {
			return readRegexp(forceRegexp);
		}

		if (S.templateMode !== TMPL_MODE_HTML) {
			skipWhitespace();
		}

		startToken();
		var ch = peek();
		if (!ch) {
			return token("eof");
		}

		// template mode
		if (S.templateMode === TMPL_MODE_COMMAND ||
			S.templateMode === TMPL_MODE_VARIABLE) {
			if (ch === "{") {
				S.curlyCount++;
			} else if (ch === "}") {
				if (S.curlyCount === 0) {
					if (S.templateMode === TMPL_MODE_COMMAND) {
						if (peek() !== "}") {
							parseError(
								"Expected closing '}}' here got '}" +
								ch + "'");
						}
						next();
						next();
						S.templateMode = TMPL_MODE_HTML;
						return token("tpunc", "}}");
					} else {
						next();
						S.templateMode = TMPL_MODE_HTML;
						return token("tpunc", "}");
					}
				}
				S.curlyCount--;
			}
		}
		// end template mode

		if (S.templateMode === TMPL_MODE_HTML) {
			return readTemplate();
		}
		if (isDigit(ch)) {
			return readNum();
		}
		if (ch === "\"" || ch === "'") {
			return readString();
		}
		if (HOP(PUNC_CHARS, ch)) {
			return token("punc", next());
		}
		if (ch === ".") {
			return handleDot();
		}
		if (ch === "/") {
			return handleSlash();
		}
		if (HOP(OPERATOR_CHARS, ch)) {
			return readOperator();
		}
		if (ch === "\\" || isIdentifierStart(ch)) {
			return readWord();
		}

		parseError("Unexpected character '" + ch + "'");
	}

	nextToken.context = function (nc) {
		if (nc) {
			S = nc;
		}
		return S;
	};

	return nextToken;
}

/* -----[ Parser (constants) ]----- */

var UNARY_PREFIX = arrayToHash([
	"typeof",
	"void",
	"delete",
	"--",
	"++",
	"!",
	"~",
	"-",
	"+"
]);

var UNARY_POSTFIX = arrayToHash(["--", "++"]);

var ASSIGNMENT = (function (a, ret, i) {
	while (i < a.length) {
		ret[a[i]] = a[i].substr(0, a[i].length - 1);
		i++;
	}
	return ret;
})(
	["+=", "-=", "/=", "*=", "%=", ">>=", "<<=", ">>>=", "|=", "^=",
		"&="
	], {
		"=": true
	},
	0
);

var PRECEDENCE = (function (a, ret) {
	for (var i = 0, n = 1; i < a.length; ++i, ++n) {
		var b = a[i];
		for (var j = 0; j < b.length; ++j) {
			ret[b[j]] = n;
		}
	}
	return ret;
})(
	[
		["||"],
		["&&"],
		["|"],
		["^"],
		["&"],
		["==", "===", "!=", "!=="],
		["<", ">", "<=", ">=", "in", "instanceof"],
		[">>", "<<", ">>>"],
		["+", "-"],
		["*", "/", "%"]
	], {}
);

var STATEMENTS_WITH_LABELS = arrayToHash(["for", "do", "while",
	"switch"
]);

var ATOMIC_START_TOKEN = arrayToHash(
	["atom", "num", "string", "regexp", "name"]);

/* -----[ Parser ]----- */

function NodeWithToken(str, start, end) {
	this.name = str;
	this.start = start;
	this.end = end;
}

NodeWithToken.prototype.toString = function () {
	return this.name;
};

function parse($TEXT, exigentMode, embedTokens, hasTemplateMode) {

	var S = {
		input: typeof $TEXT === "string" ? tokenizer($TEXT,
			hasTemplateMode) : $TEXT,
		token: null,
		prev: null,
		peeked: null,
		inFunction: 0,
		inLoop: 0,
		labels: []
	};

	S.token = next();

	function is(type, value) {
		return isToken(S.token, type, value);
	}

	function peek() {
		return S.peeked || (S.peeked = S.input());
	}

	function next() {
		S.prev = S.token;
		if (S.peeked) {
			S.token = S.peeked;
			S.peeked = null;
		} else {
			S.token = S.input();
		}
		return S.token;
	}

	function prev() {
		return S.prev;
	}

	function croak(msg, line, col, pos) {
		var ctx = S.input.context();
		throwParseError(msg,
			line !== null ? line : ctx.tokline,
			col !== null ? col : ctx.tokcol,
			pos !== null ? pos : ctx.tokpos);
	}

	function tokenError(token, msg) {
		croak(msg, token.line, token.col);
	}

	function unexpected(token) {
		if (token === undefined) {
			token = S.token;
		}
		tokenError(token, "Unexpected token: " + token.type +
			" (" + token.value + ")");
	}

	function expectToken(type, val) {
		if (is(type, val)) {
			return next();
		}
		tokenError(S.token, "Unexpected token " + S.token.type +
			", expected " + type);
	}

	function expect(punc) {
		return expectToken("punc", punc);
	}

	function canInsertSemicolon() {
		return !exigentMode && (
			S.token.nlb || is("eof") || is("punc", "}")
		);
	}

	function semicolon() {
		if (is("punc", ";")) {
			next();
		} else if (!canInsertSemicolon()) {
			unexpected();
		}
	}

	function as() {
		return slice(arguments);
	}

	function parenthesised() {
		expect("(");
		var ex = expression();
		expect(")");
		return ex;
	}

	function addTokens(str, start, end) {
		return str instanceof NodeWithToken ? str :
			new NodeWithToken(str, start, end);
	}

	function maybeEmbedTokens(parser) {
		if (embedTokens) {
			return function () {
				var start = S.token;
				var ast = parser.apply(this, arguments);
				ast[0] = addTokens(ast[0], start, prev());
				return ast;
			};
		} else {
			return parser;
		}
	}

	var statement = maybeEmbedTokens(function () {
		if (is("operator", "/") || is("operator", "/=")) {
			S.peeked = null;
			S.token = S.input(S.token.value.substr(1)); // force regexp
		}
		switch (S.token.type) {
		case "num":
		case "string":
		case "regexp":
		case "operator":
		case "atom":
			return simpleStatement();

		case "name":
			return isToken(peek(), "punc", ":") ?
				labeledStatement(prog1(S.token.value, next, next)) :
				simpleStatement();

		case "punc":
			switch (S.token.value) {
			case "{":
				return as("block", block$());
			case "[":
			case "(":
				return simpleStatement();
			case ";":
				next();
				return as("block");
			default:
				unexpected();
			}
			break;
		case "keyword":
			switch (prog1(S.token.value, next)) {
			case "break":
				return breakCont("break");

			case "continue":
				return breakCont("continue");

			case "debugger":
				semicolon();
				return as("debugger");

			case "do":
				return (function (body) {
					expectToken("keyword", "while");
					return as("do", prog1(parenthesised,
							semicolon),
						body);
				})(inLoop(statement));

			case "for":
				return for$();

			case "function":
				return function$(true);

			case "if":
				return if$();

			case "return":
				if (S.inFunction === 0) {
					croak("'return' outside of function");
				}
				return as("return",
					is("punc", ";") ? (next(), null) :
					canInsertSemicolon() ? null :
					prog1(expression, semicolon));

			case "switch":
				return as("switch", parenthesised(), switchBlock$());

			case "throw":
				if (S.token.nlb) {
					croak("Illegal newline after 'throw'");
				}
				return as("throw", prog1(expression, semicolon));

			case "try":
				return try$();

			case "var":
				return prog1(var$, semicolon);

			case "const":
				return prog1(const$, semicolon);

			case "while":
				return as("while", parenthesised(), inLoop(
					statement));

			case "with":
				return as("with", parenthesised(), statement());

			default:
				unexpected();
			}
		}
	});

	function labeledStatement(label) {
		S.labels.push(label);
		var start = S.token,
			stat = statement();
		if (exigentMode && !HOP(STATEMENTS_WITH_LABELS, stat[0])) {
			unexpected(start);
		}
		S.labels.pop();
		return as("label", label, stat);
	}

	function simpleStatement() {
		return as("stat", prog1(expression, semicolon));
	}

	function breakCont(type) {
		var name;
		if (!canInsertSemicolon()) {
			name = is("name") ? S.token.value : null;
		}
		if (name !== null) {
			next();
			if (!member(name, S.labels)) {
				croak("Label " + name +
					" without matching loop or statement");
			}
		} else if (S.inLoop === 0) {
			croak(type + " not inside a loop or switch");
		}
		semicolon();
		return as(type, name);
	}

	function for$() {
		expect("(");
		var init = null;
		if (!is("punc", ";")) {
			init = is("keyword", "var") ? (next(), var$(true)) :
				expression(true, true);
			if (is("operator", "in")) {
				if (init[0] === "var" && init[1].length > 1) {
					croak("Only one variable declaration allowed " +
						"in for..in loop");
				}
				return forIn(init);
			}
		}
		return regularFor(init);
	}

	function regularFor(init) {
		expect(";");
		var test = is("punc", ";") ? null : expression();
		expect(";");
		var step = is("punc", ")") ? null : expression();
		expect(")");
		return as("for", init, test, step, inLoop(statement));
	}

	function forIn(init) {
		var lhs = init[0] === "var" ? as("name", init[1][0]) : init;
		next();
		var obj = expression();
		expect(")");
		return as("for-in", init, lhs, obj, inLoop(statement));
	}

	var function$ = function (inStatement) {
		var name = is("name") ? prog1(S.token.value, next) : null;
		if (inStatement && !name) {
			unexpected();
		}
		expect("(");
		return as(inStatement ? "defun" : "function",
			name,
			// arguments
			(function (first, a) {
				while (!is("punc", ")")) {
					if (first) {
						first = false;
					} else {
						expect(",");
					}
					if (!is("name")) {
						unexpected();
					}
					a.push(S.token.value);
					next();
				}
				next();
				return a;
			})(true, []),
			// body
			(function () {
				++S.inFunction;
				var loop = S.inLoop;
				S.inLoop = 0;
				var a = block$();
				--S.inFunction;
				S.inLoop = loop;
				return a;
			})());
	};

	function if$() {
		var cond = parenthesised(),
			body = statement(),
			belse;
		if (is("keyword", "else")) {
			next();
			belse = statement();
		}
		return as("if", cond, body, belse);
	}

	function block$() {
		expect("{");
		var a = [];
		while (!is("punc", "}")) {
			if (is("eof")) {
				unexpected();
			}
			a.push(statement());
		}
		next();
		return a;
	}

	var switchBlock$ = curry(inLoop, function () {
		expect("{");
		var a = [],
			cur = null;
		while (!is("punc", "}")) {
			if (is("eof")) {
				unexpected();
			}
			if (is("keyword", "case")) {
				next();
				cur = [];
				a.push([expression(), cur]);
				expect(":");
			} else if (is("keyword", "default")) {
				next();
				expect(":");
				cur = [];
				a.push([null, cur]);
			} else {
				if (!cur) {
					unexpected();
				}
				cur.push(statement());
			}
		}
		next();
		return a;
	});

	function try$() {
		var body = block$(),
			bcatch, bfinally;
		if (is("keyword", "catch")) {
			next();
			expect("(");
			if (!is("name")) {
				croak("Name expected");
			}
			var name = S.token.value;
			next();
			expect(")");
			bcatch = [name, block$()];
		}
		if (is("keyword", "finally")) {
			next();
			bfinally = block$();
		}
		if (!bcatch && !bfinally) {
			croak("Missing catch/finally blocks");
		}
		return as("try", body, bcatch, bfinally);
	}

	function vardefs(noIn) {
		var a = [];
		for (;;) {
			if (!is("name")) {
				unexpected();
			}
			var name = S.token.value;
			next();
			if (is("operator", "=")) {
				next();
				a.push([name, expression(false, noIn)]);
			} else {
				a.push([name]);
			}
			if (!is("punc", ",")) {
				break;
			}
			next();
		}
		return a;
	}

	function var$(noIn) {
		return as("var", vardefs(noIn));
	}

	function const$() {
		return as("const", vardefs());
	}

	function new$() {
		var newexp = exprAtom(false),
			args;
		if (is("punc", "(")) {
			next();
			args = exprList(")");
		} else {
			args = [];
		}
		return subscripts(as("new", newexp, args), true);
	}

	var exprAtom = maybeEmbedTokens(function (allowCalls) {
		if (is("operator", "new")) {
			next();
			return new$();
		}
		if (is("punc")) {
			switch (S.token.value) {
			case "(":
				next();
				return subscripts(prog1(expression,
					curry(expect, ")")), allowCalls);
			case "[":
				next();
				return subscripts(array$(), allowCalls);
			case "{":
				next();
				return subscripts(object$(), allowCalls);
			}
			unexpected();
		}
		if (is("keyword", "function")) {
			next();
			return subscripts(function$(false), allowCalls);
		}
		if (HOP(ATOMIC_START_TOKEN, S.token.type)) {
			var atom = S.token.type === "regexp" ?
				as("regexp", S.token.value[0], S.token.value[1]) :
				as(S.token.type, S.token.value);
			return subscripts(prog1(atom, next), allowCalls);
		}
		unexpected();
	});

	function exprList(closing, allowTrailingComma, allowEmpty) {
		var first = true,
			a = [];
		while (!is("punc", closing)) {
			if (first) {
				first = false;
			} else {
				expect(",");
			}
			if (allowTrailingComma && is("punc", closing)) {
				break;
			}
			if (is("punc", ",") && allowEmpty) {
				a.push(["atom", "undefined"]);
			} else {
				a.push(expression(false));
			}
		}
		next();
		return a;
	}

	function array$() {
		return as("array", exprList("]", !exigentMode, true));
	}

	function object$() {
		var first = true,
			a = [];
		while (!is("punc", "}")) {
			if (first) {
				first = false;
			} else {
				expect(",");
			}
			if (!exigentMode && is("punc", "}")) {
				// allow trailing comma
				break;
			}
			var type = S.token.type;
			var name = asPropertyName();
			if (type === "name" && (name === "get" || name === "set") && !
				is(
					"punc", ":")) {
				a.push([asName(), function$(false), name]);
			} else {
				expect(":");
				a.push([name, expression(false)]);
			}
		}
		next();
		return as("object", a);
	}

	function asPropertyName() {
		switch (S.token.type) {
		case "num":
		case "string":
			return prog1(S.token.value, next);
		}
		return asName();
	}

	function asName() {
		switch (S.token.type) {
		case "name":
		case "operator":
		case "keyword":
		case "atom":
			return prog1(S.token.value, next);
		default:
			unexpected();
		}
	}

	function subscripts(expr, allowCalls) {
		if (is("punc", ".")) {
			next();
			return subscripts(as("dot", expr, asName()), allowCalls);
		}
		if (is("punc", "[")) {
			next();
			return subscripts(as("sub", expr,
					prog1(expression, curry(expect, "]"))),
				allowCalls);
		}
		if (allowCalls && is("punc", "(")) {
			next();
			return subscripts(as("call", expr, exprList(")")), true);
		}
		return expr;
	}

	function maybeUnary(allowCalls) {
		if (is("operator") && HOP(UNARY_PREFIX, S.token.value)) {
			return makeUnary("unary-prefix",
				prog1(S.token.value, next),
				maybeUnary(allowCalls));
		}
		var val = exprAtom(allowCalls);
		while (is("operator") && HOP(UNARY_POSTFIX, S.token.value) && !
			S.token.nlb) {
			val = makeUnary("unary-postfix", S.token.value, val);
			next();
		}
		return val;
	}

	function makeUnary(tag, op, expr) {
		if ((op === "++" || op === "--") && !isAssignable(expr)) {
			croak("Invalid use of " + op + " operator");
		}
		return as(tag, op, expr);
	}

	function exprOp(left, minPrec, noIn) {
		var op = is("operator") ? S.token.value : null;
		if (op && op === "in" && noIn) {
			op = null;
		}
		var prec = op !== null ? PRECEDENCE[op] : null;
		if (prec !== null && prec > minPrec) {
			next();
			var right = exprOp(maybeUnary(true), prec, noIn);
			return exprOp(as("binary", op, left, right), minPrec,
				noIn);
		}
		return left;
	}

	function exprOps(noIn) {
		return exprOp(maybeUnary(true), 0, noIn);
	}

	function maybeConditional(noIn) {
		var expr = exprOps(noIn);
		if (is("operator", "?")) {
			next();
			var yes = expression(false);
			expect(":");
			return as("conditional", expr, yes, expression(false,
				noIn));
		}
		return expr;
	}

	function isAssignable(expr) {
		if (!exigentMode) {
			return true;
		}
		switch (expr[0] + "") {
		case "dot":
		case "sub":
		case "new":
		case "call":
			return true;
		case "name":
			return expr[1] !== "this";
		}
	}

	function maybeAssign(noIn) {
		var left = maybeConditional(noIn),
			val = S.token.value;
		if (is("operator") && HOP(ASSIGNMENT, val)) {
			if (isAssignable(left)) {
				next();
				return as("assign", ASSIGNMENT[val], left,
					maybeAssign(noIn));
			}
			croak("Invalid assignment");
		}
		return left;
	}

	var expression = maybeEmbedTokens(function (commas, noIn) {
		if (arguments.length === 0) {
			commas = true;
		}
		var expr = maybeAssign(noIn);
		if (commas && is("punc", ",")) {
			next();
			return as("seq", expr, expression(true, noIn));
		}
		return expr;
	});

	function inLoop(cont) {
		try {
			++S.inLoop;
			return cont();
		} finally {
			--S.inLoop;
		}
	}

	// *********************************************************
	// *********************************************************
	// *********************************************************
	// *********************************************************
	// *********************************************************
	// *********************************************************
	// *********************************************************
	// *********************************************************
	// *********************************************************
	// *********************************************************
	// *********************************************************

	var chunk = maybeEmbedTokens(function () {
		var expr;

		if (is("html")) {
			var html = S.token.value;
			next();
			return as("html", html);
		}
		if (is("tpunc", "${")) {
			next();
			expr = expression(false);
			expectToken("tpunc", "}");
			return as("tmpl-echo", expr);
		}
		if (is("tpunc", "{{")) {
			next();

			var expr1 = null;
			var expr2 = null;
			if (is("name", "each")) {
				next();

				if (is("punc", "(")) {
					next();
					expr1 = exprList(")", false, false);
				}

				// collection expression had parenthesis?
				if (is("tpunc", "}}")) {
					if (expr1 && expr1.length === 1) {
						expr2 = expr1[0];
						expr1 = null;
						next();
					} else {
						croak(
							"parse error, collection value expected"
						);
					}
				} else {
					expr2 = expression(false);
					expectToken("tpunc", "}}");
				}


				var a = [];
				while (!is("tpunc", "{{/")) {
					if (is("eof")) {
						unexpected();
					}
					a.push(chunk());
				}
				next();
				if (!is("name", "each")) {
					croak("Unmatched template tags. " +
						"expected closing {{/each}} here");
				}
				next();
				expectToken("tpunc", "}}");

				return as("tmpl-each", expr1, expr2, a);
			}

			if (is("name", "tmpl")) {
				next();
				expr1 = null;
				if (is("punc", "(")) {
					next();
					expr1 = exprList(")", false, false);
				}

				expr2 = expression();
				expectToken("tpunc", "}}");

				return as("tmpl", expr1, expr2);
			}

			if (is("keyword", "var")) {
				next();
				var var$defs = vardefs(true);
				expectToken("tpunc", "}}");
				return as("tmpl-var", var$defs);
			}

			if (is("keyword", "if")) {
				// ["if", <main>, <else ifs>, <else>] =>
				// ["if", [<expr>, <body>], [[<expr2>, [body2],...], elseBody]

				next();
				expr = expression(false);
				expectToken("tpunc", "}}");

				var body = [];

				var current = body;
				var elseIfs = [];
				var elseBody = null;

				while (!is("tpunc", "{{/")) {
					if (is("eof")) {
						unexpected();
					}

					if (is("tpunc", "{{")) {
						if (isToken(peek(), "keyword", "else")) {
							next();
							if (isToken(peek(), "tpunc", "}}")) {
								if (elseBody) {
									croak(
										"too many default {{else}} blocks"
									);
								}
								next();
								next();
								current = elseBody = [];
							} else {

								next();
								if (elseBody) {
									croak(
										"can't have {{else (...)}} with " +
										"condition after default {{else}}"
									);
								}
								var elseIfExpr = expression(false);

								var elseIfBody = [];
								var elseIf = [elseIfExpr,
									elseIfBody
								];
								current = elseIfBody;
								elseIfs.push(elseIf);
								expectToken("tpunc", "}}");
							}
						}
					}

					current.push(chunk());
				}
				next();

				if (!is("keyword", "if")) {
					croak("Unmatched template tags. " +
						"expected closing {{/if}} here");
				}
				next();
				expectToken("tpunc", "}}");

				return as("tmpl-if", [expr, body], elseIfs,
					elseBody);
			}

			if (is("name", "html")) {
				next();
				expr = expression(false);
				expectToken("tpunc", "}}");
				return as("tmpl-html", expr);
			}

			if (is("name", "layout")) {
				next();
				expr = expression(false);
				expectToken("tpunc", "}}");
				return as("tmpl-layout", expr);
			}
		}

		unexpected();

	});

	if (hasTemplateMode) {
		return as("template", (function (a) {
			while (!is("eof")) {
				a.push(chunk());
			}

			return a;
		})([]));

	} else {
		return as("toplevel", (function (a) {
			while (!is("eof")) {
				a.push(statement());
			}
			return a;
		})([]));
	}

}

/* -----[ Utilities ]----- */

function curry(f) {
	var args = slice(arguments, 1);
	return function () {
		return f.apply(this, args.concat(slice(arguments)));
	};
}

function prog1(ret) {
	if (ret instanceof Function) {
		ret = ret();
	}
	for (var i = 1, n = arguments.length; --n > 0; ++i) {
		arguments[i]();
	}
	return ret;
}

function arrayToHash(a) {
	var ret = {};
	for (var i = 0; i < a.length; ++i) {
		ret[a[i]] = true;
	}
	return ret;
}

function slice(a, start) {
	return Array.prototype.slice.call(a, start || 0);
}

function characters(str) {
	return str.split("");
}

function member(name, array) {
	for (var i = array.length; --i >= 0;) {
		if (array[i] === name) {
			return true;
		}
	}

	return false;
}

function HOP(obj, prop) {
	return Object.prototype.hasOwnProperty.call(obj, prop);
}

/* -----[ Exports ]----- */

exports.tokenizer = tokenizer;
exports.parse = parse;
exports.slice = slice;
exports.curry = curry;
exports.member = member;
exports.arrayToHash = arrayToHash;
exports.PRECEDENCE = PRECEDENCE;
exports.KEYWORDS_ATOM = KEYWORDS_ATOM;
exports.RESERVED_WORDS = RESERVED_WORDS;
exports.KEYWORDS = KEYWORDS;
exports.ATOMIC_START_TOKEN = ATOMIC_START_TOKEN;
exports.OPERATORS = OPERATORS;
exports.isAlphanumericChar = isAlphanumericChar;
