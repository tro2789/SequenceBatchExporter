/* Sequence Batch Exporter - panel logic */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  function evalES(script) {
    return new Promise(function (resolve) {
      window.__adobe_cep__.evalScript(script, resolve);
    });
  }
  function esc(s) {
    return String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '\\"');
  }
  function baseName(p) {
    return String(p).split(/[\\\/]/).pop();
  }
  function log(msg, cls) {
    var el = document.createElement("div");
    if (cls) el.className = cls;
    el.textContent = msg;
    $("log").appendChild(el);
    $("log").scrollTop = $("log").scrollHeight;
  }

  /* ---------- state ---------- */

  var STORE_KEY = "sbe_state_v1";
  var state = { profiles: [], activeProfile: 0, outFolder: "", workArea: "0", autoStart: true };
  var sequences = [];

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) state = JSON.parse(raw);
    } catch (e) { /* fresh start */ }
    if (!state.profiles.length) {
      state.profiles = [{ name: "Podcast", outputs: [] }];
      state.activeProfile = 0;
    }
    if (!state.favorites) state.favorites = [];
  }
  function save() {
    state.outFolder = $("outFolder").value;
    state.workArea = $("workArea").value;
    state.autoStart = $("autoStart").checked;
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }

  /* ---------- sequences ---------- */

  function refreshSequences() {
    return evalES("SBE_getSequences()").then(function (res) {
      try { sequences = JSON.parse(res || "[]"); }
      catch (e) { sequences = []; }
      sequences.sort(function (a, b) {
        return String(a.name).localeCompare(String(b.name), undefined, { numeric: true, sensitivity: "base" });
      });
      var box = $("seqList");
      box.innerHTML = "";
      if (!sequences.length) {
        box.innerHTML = '<span class="muted">No sequences (is a project open?)</span>';
        return;
      }
      sequences.forEach(function (s) {
        var lab = document.createElement("label");
        var cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = s.id;
        lab.appendChild(cb);
        lab.appendChild(document.createTextNode(" " + s.name));
        box.appendChild(lab);
      });
    });
  }
  function setAll(checked) {
    $("seqList").querySelectorAll("input[type=checkbox]").forEach(function (cb) {
      cb.checked = checked;
    });
  }
  function selectedSequences() {
    var ids = [];
    $("seqList").querySelectorAll("input[type=checkbox]:checked").forEach(function (cb) {
      ids.push(cb.value);
    });
    return sequences.filter(function (s) { return ids.indexOf(s.id) >= 0; });
  }

  /* ---------- profiles ---------- */

  function activeProfile() { return state.profiles[state.activeProfile]; }

  function renderProfiles() {
    var sel = $("profileSelect");
    sel.innerHTML = "";
    state.profiles.forEach(function (p, i) {
      var opt = document.createElement("option");
      opt.value = i;
      opt.textContent = p.name;
      sel.appendChild(opt);
    });
    sel.value = state.activeProfile;
    renderOutputs();
  }

  function renderOutputs() {
    var box = $("outputs");
    box.innerHTML = "";
    var prof = activeProfile();
    if (!prof.outputs.length) {
      box.innerHTML = '<div class="muted" style="margin:4px 0">No outputs yet — add your .epr presets.</div>';
      return;
    }
    prof.outputs.forEach(function (o, i) {
      var row = document.createElement("div");
      row.className = "output-row";

      var name = document.createElement("span");
      name.className = "preset-name";
      name.title = o.preset;
      name.textContent = o.name || baseName(o.preset);

      var ext = document.createElement("input");
      ext.type = "text"; ext.className = "ext"; ext.value = o.ext;
      ext.title = "File extension";
      ext.onchange = function () { o.ext = ext.value.replace(/^\./, ""); save(); };

      var suffix = document.createElement("input");
      suffix.type = "text"; suffix.className = "suffix"; suffix.value = o.suffix || "";
      suffix.placeholder = "suffix";
      suffix.title = "Appended to sequence name as _suffix (underscore added automatically)";
      suffix.onchange = function () { o.suffix = suffix.value; save(); };

      var del = document.createElement("button");
      del.className = "small"; del.textContent = "✕";
      del.onclick = function () { prof.outputs.splice(i, 1); save(); renderOutputs(); };

      row.appendChild(name); row.appendChild(ext); row.appendChild(suffix); row.appendChild(del);
      box.appendChild(row);
    });
  }

  function guessExt(presetPath) {
    var n = baseName(presetPath).toLowerCase();
    if (n.indexOf("mp3") >= 0) return "mp3";
    if (n.indexOf("wav") >= 0) return "wav";
    if (n.indexOf("aac") >= 0 || n.indexOf("audio") >= 0) return "aac";
    if (n.indexOf("mov") >= 0 || n.indexOf("prores") >= 0) return "mov";
    if (n.indexOf("mxf") >= 0) return "mxf";
    if (n.indexOf("gif") >= 0) return "gif";
    return "mp4";
  }

  /* ---------- queueing ---------- */

  function sanitize(name) {
    return name.replace(/[<>:"\/\\|?*]/g, "_").trim();
  }

  async function queueAll() {
    var seqs = selectedSequences();
    var prof = activeProfile();
    var folder = $("outFolder").value.replace(/[\\\/]+$/, "");
    var workArea = $("workArea").value;

    if (!seqs.length) { log("Select at least one sequence.", "err"); return; }
    if (!prof.outputs.length) { log("Profile has no outputs.", "err"); return; }
    if (!folder) { log("Choose an output folder.", "err"); return; }
    save();

    $("btnQueue").disabled = true;
    log("Queueing " + (seqs.length * prof.outputs.length) + " job(s)…");

    var failures = 0;
    for (var i = 0; i < seqs.length; i++) {
      for (var j = 0; j < prof.outputs.length; j++) {
        var o = prof.outputs[j];
        var sfx = o.suffix ? (/^[_-]/.test(o.suffix) ? o.suffix : "_" + o.suffix) : "";
        var outPath = folder + "\\" + sanitize(seqs[i].name) + sfx + "." + o.ext;
        var call = "SBE_queueOne(\"" + esc(seqs[i].id) + "\",\"" + esc(outPath) +
                   "\",\"" + esc(o.preset) + "\",\"" + esc(workArea) + "\")";
        var res = await evalES(call);
        if (res && res.indexOf("ok:") === 0) {
          log("✓ " + baseName(outPath), "ok");
        } else {
          failures++;
          log("✗ " + baseName(outPath) + " — " + String(res).replace(/^err:/, ""), "err");
        }
      }
    }

    if (failures === 0 && $("autoStart").checked) {
      await evalES("SBE_startBatch()");
      log("Queue started in Media Encoder.", "ok");
    } else if (failures > 0) {
      log(failures + " job(s) failed — queue not auto-started.", "err");
    } else {
      log("Jobs queued. Press Start in Media Encoder when ready.");
    }
    $("btnQueue").disabled = false;
  }

  /* ---------- dialogs ---------- */

  function pickFolder() {
    var r = window.cep.fs.showOpenDialogEx(false, true, "Choose output folder",
              $("outFolder").value || null);
    if (r && r.data && r.data.length) {
      $("outFolder").value = r.data[0].replace(/\//g, "\\");
      save();
    }
  }
  function pickPresetFiles() {
    var r = window.cep.fs.showOpenDialogEx(true, false, "Choose export preset(s)",
              null, ["epr"]);
    if (r && r.data && r.data.length) {
      r.data.forEach(function (p) {
        p = p.replace(/\//g, "\\");
        activeProfile().outputs.push({ preset: p, ext: guessExt(p), suffix: "" });
      });
      save();
      renderOutputs();
    }
  }

  /* ---------- preset picker ---------- */

  var allPresets = [];

  function isFav(p) { return state.favorites.indexOf(p.path) >= 0; }
  function toggleFav(p) {
    var i = state.favorites.indexOf(p.path);
    if (i >= 0) state.favorites.splice(i, 1);
    else state.favorites.push(p.path);
    save();
    renderPicker($("pickerSearch").value);
  }
  function addPreset(p) {
    activeProfile().outputs.push({ preset: p.path, name: p.name, ext: p.ext, suffix: "" });
    save();
    renderOutputs();
    closePicker();
  }

  function pickRow(p) {
    var row = document.createElement("div");
    row.className = "pick-row";

    var star = document.createElement("span");
    star.className = "star" + (isFav(p) ? " fav" : "");
    star.textContent = isFav(p) ? "★" : "☆";
    star.title = "Favorite";
    star.onclick = function (e) { e.stopPropagation(); toggleFav(p); };

    var name = document.createElement("span");
    name.className = "pname";
    name.textContent = p.name;
    name.title = p.path;

    var badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = p.av;

    var cat = document.createElement("span");
    cat.className = "pcat";
    cat.textContent = (p.kind === "user" ? "User" : p.cat) || "";

    row.appendChild(star); row.appendChild(name); row.appendChild(badge); row.appendChild(cat);
    row.onclick = function () { addPreset(p); };
    return row;
  }

  function renderPicker(filter) {
    var list = $("pickerList");
    list.innerHTML = "";
    var q = (filter || "").toLowerCase().trim();
    var match = function (p) {
      return !q || (p.name + " " + p.cat).toLowerCase().indexOf(q) >= 0;
    };
    var favs = allPresets.filter(function (p) { return isFav(p) && match(p); });
    var rest = allPresets.filter(function (p) { return !isFav(p) && match(p); });

    function section(title, items) {
      if (!items.length) return;
      var h = document.createElement("div");
      h.className = "pick-head";
      h.textContent = title;
      list.appendChild(h);
      items.forEach(function (p) { list.appendChild(pickRow(p)); });
    }
    section("★ Favorites", favs);
    section(q ? "Matches" : "All presets", rest);
    if (!favs.length && !rest.length) {
      list.innerHTML = '<div class="muted" style="padding:8px">No presets match.</div>';
    }
    $("pickerCount").textContent = (favs.length + rest.length) + " shown / " + allPresets.length + " total";
  }

  function loadPresets(force) {
    var result = SBEPresets.get(force);
    if (result.error) log("Preset scan: " + result.error, "err");
    allPresets = result.presets || [];
  }

  function openPicker() {
    if (!allPresets.length) loadPresets(false);
    $("picker").className = "open";
    $("pickerSearch").value = "";
    renderPicker("");
    $("pickerSearch").focus();
  }
  function closePicker() { $("picker").className = ""; }

  /* ---------- wire up ---------- */

  $("btnRefresh").onclick = refreshSequences;
  $("btnAll").onclick = function () { setAll(true); };
  $("btnNone").onclick = function () { setAll(false); };
  $("btnBrowse").onclick = pickFolder;
  $("btnAddOutput").onclick = openPicker;
  $("btnQueue").onclick = queueAll;
  $("btnPickerClose").onclick = closePicker;
  $("btnPickerFile").onclick = function () { closePicker(); pickPresetFiles(); };
  $("btnPickerRescan").onclick = function () {
    loadPresets(true);
    renderPicker($("pickerSearch").value);
  };
  $("pickerSearch").oninput = function () { renderPicker(this.value); };
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closePicker();
  });

  $("profileSelect").onchange = function () {
    state.activeProfile = parseInt(this.value, 10);
    save();
    renderOutputs();
  };
  $("btnNewProfile").onclick = function () {
    var name = prompt("Profile name:", "New profile");
    if (!name) return;
    state.profiles.push({ name: name, outputs: [] });
    state.activeProfile = state.profiles.length - 1;
    save();
    renderProfiles();
  };
  $("btnDelProfile").onclick = function () {
    if (state.profiles.length <= 1) { log("Can't delete the last profile.", "err"); return; }
    if (!confirm('Delete profile "' + activeProfile().name + '"?')) return;
    state.profiles.splice(state.activeProfile, 1);
    state.activeProfile = 0;
    save();
    renderProfiles();
  };

  load();
  $("outFolder").value = state.outFolder || "";
  $("workArea").value = state.workArea || "0";
  $("autoStart").checked = state.autoStart !== false;
  $("outFolder").onchange = save;
  $("workArea").onchange = save;
  $("autoStart").onchange = save;
  renderProfiles();
  refreshSequences().then(function () {
    if (!$("outFolder").value) {
      evalES("SBE_getProjectDir()").then(function (dir) {
        if (dir) { $("outFolder").value = dir; save(); }
      });
    }
  });
})();
