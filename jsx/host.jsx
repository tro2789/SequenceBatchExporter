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

function SBE_getProjectDir() {
    if (!app.project || !app.project.path) return "";
    var p = String(app.project.path);
    var cut = p.lastIndexOf("\\");
    if (cut < 0) cut = p.lastIndexOf("/");
    return cut > 0 ? p.substring(0, cut) : "";
}

// workArea: 0 = entire sequence, 1 = in/out points, 2 = work area bar
function SBE_queueOne(seqId, outPath, presetPath, workArea) {
    if (!app.project) return "err:no project open";
    var preset = new File(presetPath);
    if (!preset.exists) return "err:preset not found: " + presetPath;

    var seqs = app.project.sequences;
    var seq = null;
    for (var i = 0; i < seqs.numSequences; i++) {
        if (seqs[i].sequenceID === seqId) { seq = seqs[i]; break; }
    }
    if (!seq) return "err:sequence not found (refresh the list?)";

    app.encoder.launchEncoder();
    var jobId = app.encoder.encodeSequence(seq, outPath, presetPath, parseInt(workArea, 10), 0);
    return jobId ? "ok:" + jobId : "err:AME rejected the job";
}

function SBE_startBatch() {
    app.encoder.startBatch();
    return "ok";
}
