// Sequence Batch Exporter - ExtendScript host
// All functions prefixed SBE_ to avoid collisions with other panels.

function SBE_escape(s) {
    return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function SBE_getSequences() {
    if (!app.project) return "[]";
    var out = [];
    var seqs = app.project.sequences;
    for (var i = 0; i < seqs.numSequences; i++) {
        out.push('{"id":"' + SBE_escape(seqs[i].sequenceID) +
                 '","name":"' + SBE_escape(seqs[i].name) + '"}');
    }
    return "[" + out.join(",") + "]";
}

// Sequence IDs of the sequences currently highlighted in the Project panel.
// getCurrentProjectViewSelection() reports the most recently focused Project
// view; it is empty when nothing there is selected.
function SBE_getSelectedSequenceIDs() {
    if (!app.project) return "[]";
    var sel = null;
    try { sel = app.getCurrentProjectViewSelection(); } catch (e) { sel = null; }
    if (!sel || !sel.length) return "[]";
    var nodeIds = {};
    for (var i = 0; i < sel.length; i++) {
        try { nodeIds[String(sel[i].nodeId)] = true; } catch (e2) {}
    }
    var out = [];
    var seqs = app.project.sequences;
    for (var j = 0; j < seqs.numSequences; j++) {
        var pi = null;
        try { pi = seqs[j].projectItem; } catch (e3) { pi = null; }
        if (pi && nodeIds[String(pi.nodeId)]) {
            out.push('"' + SBE_escape(seqs[j].sequenceID) + '"');
        }
    }
    return "[" + out.join(",") + "]";
}

function SBE_getProjectDir() {
    if (!app.project || !app.project.path) return "";
    var p = String(app.project.path);
    var cut = p.lastIndexOf("\\");
    if (cut < 0) cut = p.lastIndexOf("/");
    return cut > 0 ? p.substring(0, cut) : "";
}

// ---- import-on-complete ----
// AME fires onEncoderJobComplete into this panel's ExtendScript engine once a
// job finishes (panel must stay open). Only jobs queued with importFlag "1"
// are tracked; results are buffered in SBE_events for the panel to drain.
var SBE_pendingImports = {};   // jobId -> output path requested
var SBE_events = [];           // "ok:<file>" / "err:<file> - <reason>"
var SBE_bound = false;

function SBE_fileName(p) {
    p = String(p);
    var cut = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"));
    return cut >= 0 ? p.substring(cut + 1) : p;
}

function SBE_onJobComplete(jobID, outputFilePath) {
    var requested = SBE_pendingImports[jobID];
    if (!requested) return;
    delete SBE_pendingImports[jobID];
    // AME may rename on collision (e.g. _1), so trust its reported path.
    var path = outputFilePath ? String(outputFilePath) : requested;
    var name = SBE_fileName(path);
    try {
        if (!app.project) { SBE_events.push("err:" + name + " - no project open"); return; }
        var ok = app.project.importFiles([path], true, app.project.rootItem, false);
        SBE_events.push((ok ? "ok:" : "err:") + name + (ok ? "" : " - import rejected"));
    } catch (e) {
        SBE_events.push("err:" + name + " - " + e);
    }
}
function SBE_onJobError(jobID, errorMessage) {
    var requested = SBE_pendingImports[jobID];
    if (!requested) return;
    delete SBE_pendingImports[jobID];
    SBE_events.push("err:" + SBE_fileName(requested) + " - AME error: " + errorMessage);
}
function SBE_onJobCanceled(jobID) {
    var requested = SBE_pendingImports[jobID];
    if (!requested) return;
    delete SBE_pendingImports[jobID];
    SBE_events.push("err:" + SBE_fileName(requested) + " - canceled in AME");
}
function SBE_ensureBound() {
    if (SBE_bound) return;
    app.encoder.bind("onEncoderJobComplete", SBE_onJobComplete);
    app.encoder.bind("onEncoderJobError", SBE_onJobError);
    app.encoder.bind("onEncoderJobCanceled", SBE_onJobCanceled);
    SBE_bound = true;
}
// Returns {"pending":N,"events":[...]} and clears the event buffer.
function SBE_drainEvents() {
    var evs = SBE_events;
    SBE_events = [];
    var pending = 0;
    for (var k in SBE_pendingImports) if (SBE_pendingImports.hasOwnProperty(k)) pending++;
    var out = [];
    for (var i = 0; i < evs.length; i++) out.push('"' + SBE_escape(evs[i]) + '"');
    return '{"pending":' + pending + ',"events":[' + out.join(",") + "]}";
}

// workArea: 0 = entire sequence, 1 = in/out points, 2 = work area bar
// importFlag: "1" = import the finished file into the project root
function SBE_queueOne(seqId, outPath, presetPath, workArea, importFlag) {
    if (!app.project) return "err:no project open";
    var preset = new File(presetPath);
    if (!preset.exists) return "err:preset not found: " + presetPath;

    var seqs = app.project.sequences;
    var seq = null;
    for (var i = 0; i < seqs.numSequences; i++) {
        if (seqs[i].sequenceID === seqId) { seq = seqs[i]; break; }
    }
    if (!seq) return "err:sequence not found (refresh the list?)";

    var wantImport = String(importFlag) === "1";
    if (wantImport) SBE_ensureBound();
    app.encoder.launchEncoder();
    var jobId = app.encoder.encodeSequence(seq, outPath, presetPath, parseInt(workArea, 10), 0);
    if (!jobId) return "err:AME rejected the job";
    if (wantImport) SBE_pendingImports[jobId] = outPath;
    return "ok:" + jobId;
}

function SBE_startBatch() {
    app.encoder.startBatch();
    return "ok";
}
