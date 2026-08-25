# Sequence Batch Exporter — developer notes

CEP panel for Premiere Pro (Windows) that queues N sequences × M export presets
to Adobe Media Encoder. README.md covers usage and distribution; this file is
the working knowledge for development.

## Architecture

Two runtimes, one bridge:

- **Panel (Chromium/CEP)** — `index.html` + `js/main.js`. All UI state
  (delivery profiles, favorites, output folder, options) lives in
  `localStorage` under key `sbe_state_v1`; preset scan cache under
  `sbe_presets_cache_v2`. Bump the key suffix when changing a stored shape —
  there is no migration code.
- **ExtendScript host** — `jsx/host.jsx`, loaded via `ScriptPath` in the
  manifest. All functions are prefixed `SBE_` (other panels share the
  ExtendScript engine). Called via `window.__adobe_cep__.evalScript` (promise
  wrapper `evalES` in main.js). Arguments cross as escaped strings — see
  `esc()`; returns are strings ("ok:jobId" / "err:reason" or hand-built JSON,
  ExtendScript has no JSON object).
- **Node (in-panel)** — enabled by `--enable-nodejs --mixed-context` in the
  manifest `CEFCommandLine`. Used only by `js/presets.js` (filesystem scan via
  `window.cep_node.require`). If `cep_node` is missing the picker degrades to
  the "From .epr file…" dialog.

Queue path: `SBE_queueOne` → `app.encoder.launchEncoder()` →
`app.encoder.encodeSequence(seq, outPath, presetPath, workAreaInt, 0)`;
sequences are matched by `sequenceID` (GUID). Jobs are fired sequentially
(await each) to avoid racing AME startup, then `SBE_startBatch()` if enabled.

## Preset scanning (js/presets.js) — hard-won facts

- System presets: `C:\Program Files\Adobe\Adobe Premiere Pro <year>\MediaIO\systempresets`
  (~537 .epr; picks highest year installed, falls back to AME's copy). The
  `Ingest` subfolder is deliberately skipped (ingest ≠ export presets).
- User presets: `Documents\Adobe\Adobe Media Encoder\<highest ver>\Presets`.
  Documents is OneDrive-redirected on this machine — the scanner checks both
  `%USERPROFILE%\Documents` and `%USERPROFILE%\OneDrive\Documents`.
- **Display names come from `<PresetName>` in the XML, never from filenames.**
  Adobe renames presets without renaming files: "Match Source - Adaptive High
  Bitrate" lives in `01 - Match Source - High bitrate.epr`. System presets wrap
  the name as `($$$/AME/.../PresetName=Actual Name)`; user presets store it
  bare.
- Output extension is derived from `<ExporterFileType>` (a fourCC int) via
  `EXT_MAP`; unknown codes default to `mp4` and the field is user-editable in
  the UI. Map was built empirically from the 2026 systempresets folder names
  (`<ClassID>_<FileTypeHex>`).
- Scanner reads the first 8KB of each .epr and falls back to a full read if
  `</PresetName>` isn't in it. Full scan of ~554 presets takes ~1s.
- Test outside Premiere: `node test/scan-test.js` (stubs the CEP globals).
  Run it after any presets.js change — it checks totals, the two podcast
  presets by exact name, ext distribution, and name-parse failures.

## Environment gotchas

- **PowerShell scripts must stay ASCII-only.** Windows PowerShell 5.1 reads
  BOM-less files as ANSI; an em-dash once broke install.ps1 mid-string.
- Premiere on this machine: 26.x, CEP 12; `PlayerDebugMode=1` already set for
  CSXS.11 and .12 (HKCU). Dev copy loads from
  `%APPDATA%\Adobe\CEP\extensions\com.tohare.seqbatchexport`.
- The manifest targets PPRO 22.0–99.9, CSXS runtime 9.0 — don't tighten
  without reason.
- AME picks the container from the preset; the extension only names the file.

## Release checklist

1. Bump `ExtensionBundleVersion` **and** the `<Extension Version>` in
   `CSXS/manifest.xml`.
2. `.\build.ps1` — stages runtime files only (CSXS/js/jsx/index.html), signs
   with `cert\cert.p12` as "Trevor O'Hare Productions", timestamps
   (digicert), verifies. Output: `dist\SequenceBatchExporter-v<ver>.zxp`.
   First run bootstraps ZXPSignCmd 4.1.3 into `tools/` and generates the cert.
   **`cert/` is gitignored — keep it backed up; reuse the same cert forever.**
   Sign Windows builds on Windows (Adobe's Nov 2024 cross-platform signing
   bug; symlinks in the package are the other trigger — we have none).
3. Commit, then tag on **Gitea** (`git tag -a v<ver>` + `git push origin v<ver>`).
   Gitea is origin/source of truth; a push mirror (on-commit + 8h) carries
   commits and tags to the public GitHub repo. Never push to GitHub directly.
   Manual sync: `POST /api/v1/repos/tro2789/SequenceBatchExporter/push_mirrors-sync`
   on gitea.tohareprod.com (basic auth from git credential manager).
4. Create the GitHub release on the mirrored tag and upload the `.zxp` asset
   (`POST /releases` then `uploads.github.com/...@releases/<id>/assets`;
   GitHub PAT is in git credential manager for github.com, user tro2789).
   Verify the uploaded asset size matches the local file.

## Known limitations / candidate work

- Windows-only (paths, install script; a Mac build would need Mac signing).
- No per-output destination override — one folder per queue run.
- Extension guess for unknown fourCCs defaults to mp4; harmless but crude.
- Queue errors surface per-job in the log; there's no retry.
- CEP is deprecation-track; UXP can't do `app.encoder` yet, so CEP stays the
  right vehicle until Adobe exposes encoding in UXP (re-check on major
  Premiere versions).
