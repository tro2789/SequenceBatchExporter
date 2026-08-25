/* Preset scanner: finds built-in and user .epr presets on disk via CEP Node. */
var SBEPresets = (function () {
  "use strict";

  var CACHE_KEY = "sbe_presets_cache_v2";

  // ExporterFileType fourCC -> output extension (observed in PPro 2026 systempresets)
  var EXT_MAP = {
    "H264": "mp4", "MP4 ": "mp4", "HEVC": "mp4", "H26B": "m4v",
    "AAC ": "aac", "MP3 ": "mp3", "WAVE": "wav", "AIFF": "aif", "PCM ": "pcm",
    "MooV": "mov", "AVIV": "avi", "WMV ": "wmv", "flv ": "flv",
    "PNG ": "png", "JPEG": "jpg", "TIFF": "tif", "DPX ": "dpx",
    "TPIC": "tga", "DIBB": "bmp", "GIFf": "gif", "oEXR": "exr",
    "mpg2": "mpg", "dvd ": "m2v", "mbd ": "m2v", "hbd ": "m2t",
    "MX10": "mxf", "MX11": "mxf", "DMXF": "mxf", "JMXF": "mxf",
    "PMXF": "mxf", "MXF ": "mxf", "MXFX": "mxf", "DCP_": "mxf"
  };

  function node() { return window.cep_node || null; }

  function fourCC(n) {
    n = parseInt(n, 10);
    if (!n) return "";
    return String.fromCharCode((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
  }

  function readHead(fs, B, file, bytes) {
    var fd = fs.openSync(file, "r");
    try {
      var buf = B.alloc(bytes);
      var len = fs.readSync(fd, buf, 0, bytes, 0);
      return buf.toString("utf8", 0, len);
    } finally { fs.closeSync(fd); }
  }

  function parseEpr(fs, B, file) {
    var head = readHead(fs, B, file, 8192);
    if (head.indexOf("</PresetName>") < 0) head = fs.readFileSync(file, "utf8");

    var m = head.match(/<PresetName>([\s\S]*?)<\/PresetName>/);
    var name = m ? m[1].trim() : "";
    // System presets wrap the name: ($$$/AME/.../PresetName=Display Name)
    if (/^\(\$\$\$/.test(name)) name = name.replace(/^\(\$\$\$[^=]*=/, "").replace(/\)$/, "");
    if (!name) name = file.split(/[\\\/]/).pop().replace(/\.epr$/i, "");

    var cat = (head.match(/<FolderDisplayPath>([\s\S]*?)<\/FolderDisplayPath>/) || [])[1] || "";
    cat = cat.replace(/^System Presets\/?/, "").trim();

    var doV = /<DoVideo>true<\/DoVideo>/.test(head);
    var doA = /<DoAudio>true<\/DoAudio>/.test(head);
    var cc = fourCC((head.match(/<ExporterFileType>(\d+)<\/ExporterFileType>/) || [])[1]);

    return {
      name: name,
      path: file,
      cat: cat,
      av: doV ? (doA ? "AV" : "V") : (doA ? "A" : ""),
      ext: EXT_MAP[cc] || "mp4"
    };
  }

  function walk(fs, dir, out) {
    var entries;
    try { entries = fs.readdirSync(dir); } catch (e) { return; }
    entries.forEach(function (name) {
      if (name === "Ingest") return; // ingest presets, not export
      var full = dir + "\\" + name;
      var st;
      try { st = fs.statSync(full); } catch (e) { return; }
      if (st.isDirectory()) walk(fs, full, out);
      else if (/\.epr$/i.test(name)) out.push(full);
    });
  }

  function latestVersionDir(fs, base, re) {
    var best = null, bestNum = -1;
    try {
      fs.readdirSync(base).forEach(function (name) {
        var m = name.match(re);
        if (m && parseFloat(m[1]) > bestNum) { bestNum = parseFloat(m[1]); best = base + "\\" + name; }
      });
    } catch (e) { /* base missing */ }
    return best;
  }

  function findRoots(fs, env) {
    var roots = [];
    var pf = "C:\\Program Files\\Adobe";
    var app = latestVersionDir(fs, pf, /^Adobe Premiere Pro (\d{4})$/) ||
              latestVersionDir(fs, pf, /^Adobe Media Encoder (\d{4})$/);
    if (app && fs.existsSync(app + "\\MediaIO\\systempresets")) {
      roots.push({ dir: app + "\\MediaIO\\systempresets", kind: "system" });
    }
    var home = env.USERPROFILE || "";
    [home + "\\Documents", home + "\\OneDrive\\Documents"].forEach(function (docs) {
      var ver = latestVersionDir(fs, docs + "\\Adobe\\Adobe Media Encoder", /^(\d+(?:\.\d+)?)$/);
      if (ver && fs.existsSync(ver + "\\Presets")) {
        roots.push({ dir: ver + "\\Presets", kind: "user" });
      }
    });
    return roots;
  }

  function scan() {
    var nd = node();
    if (!nd) return { error: "Node.js unavailable in this CEP runtime", presets: [] };
    var fs = nd.require("fs");
    var presets = [];
    findRoots(fs, nd.process.env).forEach(function (root) {
      var files = [];
      walk(fs, root.dir, files);
      files.forEach(function (f) {
        try {
          var p = parseEpr(fs, nd.Buffer, f);
          p.kind = root.kind;
          presets.push(p);
        } catch (e) { /* unreadable preset — skip */ }
      });
    });
    presets.sort(function (a, b) {
      if (a.kind !== b.kind) return a.kind === "user" ? -1 : 1;
      if (a.cat !== b.cat) return a.cat < b.cat ? -1 : 1;
      return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
    });
    return { error: null, presets: presets };
  }

  function get(forceRescan) {
    if (!forceRescan) {
      try {
        var cached = JSON.parse(localStorage.getItem(CACHE_KEY));
        if (cached && cached.presets && cached.presets.length) return cached;
      } catch (e) { /* rescan */ }
    }
    var result = scan();
    if (!result.error) localStorage.setItem(CACHE_KEY, JSON.stringify(result));
    return result;
  }

  return { get: get };
})();
