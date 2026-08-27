# Sequence Batch Exporter

[![Latest release](https://img.shields.io/github/v/release/tro2789/SequenceBatchExporter)](https://github.com/tro2789/SequenceBatchExporter/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/tro2789/SequenceBatchExporter/total)](https://github.com/tro2789/SequenceBatchExporter/releases)
[![License: MIT](https://img.shields.io/github/license/tro2789/SequenceBatchExporter)](LICENSE)
![Platform: Windows](https://img.shields.io/badge/platform-Windows-0078d4)
![Premiere Pro 22.0+](https://img.shields.io/badge/Premiere%20Pro-22.0%2B-9999ff)
[![Buy me a coffee](https://img.shields.io/badge/%E2%98%95%20buy%20me%20a%20coffee-tip-ffdd00)](https://buy.stripe.com/28EcN5b5Scjw906091bwk0e)

CEP panel for Premiere Pro: queue N sequences × M export presets to Adobe Media
Encoder in one click. Built for the podcast delivery case (same cut → MP4 +
MP3), unlike track-permutation exporters.

## Install (users)

Download the signed `.zxp` from the
[latest release](https://github.com/tro2789/SequenceBatchExporter/releases/latest)
and open it with [ZXPInstaller](https://zxpinstaller.com). Restart Premiere →
**Window > Extensions > Sequence Batch Exporter**. Windows, Premiere Pro 22.0+.

## Install (development)

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```

Copies the working tree to `%APPDATA%\Adobe\CEP\extensions` as an unsigned
panel and sets `PlayerDebugMode=1` under `HKCU\Software\Adobe\CSXS.11/.12`.
Re-run after any code change, then restart Premiere.

## Usage

1. **Sequences** — check the sequences to export (Refresh after adding new ones).
2. **Delivery profile** — a named bundle of outputs. Each output is a preset +
   file extension + optional filename suffix. Profiles persist in the panel's
   localStorage.
   - **+ Add preset** opens a searchable picker over every preset already on
     disk: the ~540 system presets inside the latest Premiere install
     (`MediaIO\systempresets`, names parsed from the `.epr` XML — filenames can
     be stale) plus user presets from `Documents\Adobe\Adobe Media Encoder\<ver>\Presets`
     (OneDrive-redirected Documents handled). No AME export step needed.
   - Star presets as **favorites** — they pin to the top of the picker and
     persist. "Rescan disk" refreshes the cached scan; "From .epr file…" is
     still there for one-off preset files.
3. **Destination** — output folder (defaults to the project folder), range
   (entire / in-out / work area), and whether to auto-start the AME queue.
4. **Queue exports** — fires `app.encoder.encodeSequence()` per sequence ×
   output. Output name is `<sequence name>_<suffix>.<ext>` (the underscore is
   added automatically; a suffix that already starts with `_` or `-` is used
   as-is).

## Distribution (signed .zxp)

```powershell
.\build.ps1
```

Produces `dist\SequenceBatchExporter-v<version>.zxp`, signed and timestamped as
**Trevor O'Hare Productions**. Users install it with
[ZXPInstaller](https://zxpinstaller.com) — no PlayerDebugMode / registry edits.
First run downloads `ZXPSignCmd` (Adobe CEP-Resources 4.1.3 x64) into `tools/`
and generates a self-signed cert into `cert/` (password in
`cert/cert-password.txt`); both are gitignored. Keep `cert/` backed up — reuse
the same cert across releases.

Bump `ExtensionBundleVersion` and the extension `Version` in
`CSXS/manifest.xml` for each release; build.ps1 names the .zxp from it.

Notes:
- Sign Windows builds on Windows (Adobe's Nov 2024 cross-platform signing bug —
  see `ZXPSignCMD/KnownIssue2024.md` in CEP-Resources). No symlinks in the
  package, which is the other trigger for that bug.
- Adobe Exchange listing (CC desktop app distribution) is optional and needs a
  Developer Console submission; the self-signed .zxp works without it.

## Repos and releases

- **Source of truth:** `https://gitea.tohareprod.com/tro2789/SequenceBatchExporter`
  (private). Always push here — commits and tags auto-mirror to GitHub
  (push mirror: on-commit + 8h interval).
- **Public mirror + releases:** `https://github.com/tro2789/SequenceBatchExporter`.
  Never push to GitHub directly. Releases are created on GitHub with the signed
  `.zxp` attached (see CLAUDE.md for the checklist).

## Files

- `CSXS/manifest.xml` — CEP manifest (PPRO 22–99, CSXS 9+, Node enabled)
- `jsx/host.jsx` — ExtendScript: sequence list + `app.encoder` queueing
- `index.html` / `js/main.js` — panel UI and logic
- `js/presets.js` — on-disk preset scanner (CEP Node), fourCC→extension map
- `test/scan-test.js` — `node test/scan-test.js` dry-runs the scanner outside CEP
- `install.ps1` — dev install: copy to `%APPDATA%\Adobe\CEP\extensions` + debug-mode keys
- `build.ps1` — signed `.zxp` release build (see Distribution)

## Notes

- AME determines the actual container from the preset; the extension field just
  names the file. Keep it matching the preset format.
- Jobs are queued with `removeOnCompletion=0` so they stay visible in AME.
- If a queue job errors with "preset not found", the `.epr` path moved —
  re-add it in the profile.

## Support

Sequence Batch Exporter is free and stays free. If it saves you an export
afternoon, you can
[buy me a coffee](https://buy.stripe.com/28EcN5b5Scjw906091bwk0e).
