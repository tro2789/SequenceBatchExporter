// Dry-run of js/presets.js outside CEP: stub the CEP globals, then scan.
global.window = { cep_node: { require: require, process: process, Buffer: Buffer } };
global.localStorage = { getItem: function () { return null; }, setItem: function () {} };

require("../js/presets.js");
var result = global.SBEPresets ? global.SBEPresets.get(true) : (function () {
  // presets.js assigns to a var, not window — re-eval in this scope
  var fs = require("fs");
  var src = fs.readFileSync(__dirname + "/../js/presets.js", "utf8");
  eval(src);
  return SBEPresets.get(true);
})();

if (result.error) { console.log("ERROR: " + result.error); process.exit(1); }
var p = result.presets;
console.log("total:", p.length);
console.log("user:", p.filter(function (x) { return x.kind === "user"; }).length);

["Match Source - Adaptive High Bitrate", "MP3 256 kbps High Quality"].forEach(function (want) {
  var hit = p.filter(function (x) { return x.name === want; })[0];
  console.log(want, "->", hit ? (hit.ext + " | " + hit.av + " | " + hit.cat + " | " + hit.path) : "NOT FOUND");
});

var exts = {};
p.forEach(function (x) { exts[x.ext] = (exts[x.ext] || 0) + 1; });
console.log("ext distribution:", JSON.stringify(exts));
var unnamed = p.filter(function (x) { return /\$\$\$|^\(/.test(x.name); });
console.log("badly parsed names:", unnamed.length, unnamed.slice(0, 5).map(function (x) { return x.name; }));
