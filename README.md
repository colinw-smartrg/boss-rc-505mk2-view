# boss-rcview

A local web app that shows and edits the settings files of a BOSS RC-505mk2 loop station:
- the 99 memories (name, tracks 1-5, MASTER, REC, PLAY, RHYTHM, Input FX, Track FX, controls, assigns, mixer, EQ),
- the system settings.

The app runs in the browser. It reads the files from a folder that you pick, and no data leaves the computer. It does not play the WAV files, and it does not read `RHYTHM.RC0`.

## Run

The browser loads the app as ES modules, and Chrome does not load modules from `file://`. So serve the folder:

```sh
cd boss-rcview
python3 -m http.server 8000
```

Then open http://localhost:8000/ and click **Open folder**. Pick the `ROLAND` folder of the unit, a copy of it, or its `DATA` folder.

To see the files of the unit, connect it by USB and set MENU > USB > STORAGE to CONNECT.

## Files on the unit

- `DATA/MEMORY001A.RC0` .. `MEMORY099B.RC0`: two copies of each memory.
- `DATA/SYSTEM1.RC0`, `SYSTEM2.RC0`: two copies of the system settings.

Each file ends with `<count>XXXX</count>`, a 4-digit hex number. The unit loads the copy with the higher count, and it writes the next save over the other copy. The list in the app shows which copy is current (A/B or 1/2).

## Edit and export

1. Change fields in the app. A changed field has a yellow highlight, and the **Changes** panel lists each change with the old and the new value.
2. Click **Export**. A panel asks what to export and how:
   - **Just changed**: the new copy of each changed memory. For each one, the app takes the current copy, applies the changes, and sets the count to the higher count + 1. It writes the file under the name of the other copy (for example `MEMORY001B.RC0` if A is current).
   - **All (complete DATA folder)**: both copies of every loaded memory and of the system, with the new copy of each changed memory in place of its older copy. `RHYTHM.RC0` is not loaded, so it is not included.
   - **Single file**: the new copy of one changed memory.
   - **One ZIP file** or **separate files**. The ZIP holds the files in `ROLAND/DATA/`.
3. For separate files, a browser with a folder picker asks for an output folder and writes the files there. Without the picker, each file is a separate download, and Chrome stops a page after about 10 downloads, so use a ZIP for more files.
   - By default, the app refuses a folder that holds RC0 files, such as the loaded folder.
   - With **Overwrite RC0 files in the chosen folder**, it writes into such a folder and replaces the files with the same names, for example directly into `ROLAND/DATA` on the unit. It refuses a folder that holds a `DATA` folder, so pick `DATA` itself.
   - If the chosen folder is the loaded folder, the new copies become the current copies in the app, and their edits are cleared, so the app matches the disk.
4. Keep a backup of the `ROLAND` folder of the unit.
5. Copy each exported file into `ROLAND/DATA` on the unit, over the file with the same name. For a ZIP, unzip it at the top of the unit storage.

Chrome and Edge offer the folder picker only on a secure page: https, or http on `localhost`. If you open the app as `http://<host>:8000` from another computer, there is no picker, so separate files become separate downloads. To get the picker, forward the port and open `http://localhost:8000`, for example with `ssh -L 8000:localhost:8000 <host>`.

The app changes only the bytes of the edited values and of the count. All other bytes stay the same.

If a count is FFFF, export stops with an error. The behaviour of the unit after FFFF is not known.

## Copy to other memories

In a memory, click **Copy to other memories**. Pick what to copy, and type the destination memories:
- **Whole memory**: all settings, Input FX, Track FX and assigns. Each destination keeps its NAME, its TEMPO (MASTER A, B, D), and the track fields that follow its recording (TRACK J, R, S, U, V, W, X, Y). These fields describe the audio in `WAVE/NNN_T`, which the copy does not move.
- **Assign**: ASSIGN1-16.
- **Input FX** or **Track FX**: all 4 banks and 16 slots, with the stored values of every FX type.

The destination list takes numbers and ranges, separated by commas, for example `6,9,20,33-99`. The panel shows the resolved list before you copy. It skips the source memory and memories that are not in the loaded folder.

A copy takes the current values of the source, with its unsaved edits. It makes ordinary edits on each destination: they show in **Changes**, **Export** writes them, and **Revert all** undoes them. Without the folder picker, all changed memories go into one ZIP download.

## Field status

Roland does not document the file format. The tags are letters (`<A>`, `<B>`, ...), so every field name in this app is a claim from one of these sources. Each field shows its status; hover the badge (or the dot in a track card) to see the source and the evidence.

| Status | Meaning |
| --- | --- |
| unit | Someone confirmed the field on the unit: the name, the encoding and the range. |
| guide | The name comes from the Parameter Guide, at its position in the guide list. The sample data agrees with the guide range and default. |
| inferred | The name comes from the guide or from the data, but the sample data decided which tag it is (for example, the TRACK fields from K onward are shifted by one against guide order). |
| mcp | The name comes from rc505mk2-mcp (see `THIRD_PARTY.md`). Its letters follow guide order, and its author says that they are not verified on the unit. |
| unknown | No source names the field. The app shows the tag and the raw number. |

Set `unit` only for a field that someone checked on the unit. If a field has no known range, the app limits the input to the values seen in the loaded files.

## Confirm a field on the unit

1. Copy the `DATA` folder of the unit.
2. On the unit, change one parameter and write the memory.
3. Copy the `DATA` folder again.
4. Run `diff` on the two copies of the memory file. The tag that changed, other than `<count>`, holds the parameter.
5. Update the entry in `lib/field_map/sections.js` (or `lib/field_map/fx_fixes.js` for an FX parameter). Set `status: 'unit'` and put the evidence in `note`.

## Code

| Path | Content |
| --- | --- |
| `lib/rc0_parse.js` | Tokenizer. It records the position of each value, so that an edit replaces only those bytes. A DOM parser rejects the files (tags `<0>`..`<9>`, `<#>`, and the `<count>` after the root). |
| `lib/rc0_write.js`, `lib/rc0_file.js`, `lib/pair.js` | Edits, count, A/B pairs, export. |
| `lib/field_map.js` | Lookup of field names, display of values, choices for widgets. |
| `lib/field_map/sections.js` | Names for the memory and system sections, with status, source and notes. |
| `lib/field_map/lists.js` | Value lists from the Parameter Guide. |
| `lib/field_map/fx.js` | Generated from rc505mk2-mcp. Do not edit by hand. |
| `lib/field_map/fx_fixes.js` | Corrections to `fx.js`, each with its evidence. |
| `ui/`, `app.js`, `index.html`, `style.css` | The app. |
| `tools/field_stats.js` | Prints the range and the distinct values of each field over a `DATA` folder. |
| `tools/mcp_import.js` | Writes `lib/field_map/fx.js` from a clone of rc505mk2-mcp. |
| `tools/mcp_check.js` | Compares the guide default of each FX parameter with the value that most FX slots in a `DATA` folder hold. |

Commands:

```sh
node test/run.js                                    # parser, writer, pairs, export, field map
node tools/field_stats.js ../ROLAND/DATA '^mem/TRACK1$'
npx --yes tsx tools/mcp_import.js /path/to/rc505mk2-mcp ../ROLAND/DATA
npx --yes tsx tools/mcp_check.js /path/to/rc505mk2-mcp ../ROLAND/DATA
```

If you give no `DATA` folder, `mcp_import.js` and `mcp_check.js` read `/sandbox/colinw/ROLAND/DATA`. `field_stats.js` needs the folder.

The tests use two sets of data:
- `test/fixtures/DATA`: a fixed copy of memories 01, 02, 07 and 10 and of SYSTEM1/2. The checks of exact values (names, current copies, edits, export, and the whole browser test) use it.
- The live folder, `RC0_DATA` or `/sandbox/colinw/ROLAND/DATA`: a copy of the unit storage. It changes after each save on the unit, so it feeds only the rule checks (byte round trip, A/B counts, value ranges, genre and pattern pairs).

If you replace the fixture files, update the expected values in the tests.

The browser test needs Chrome and puppeteer-core:

```sh
npm install --no-save puppeteer-core
CHROME=/usr/bin/google-chrome node test/browser.js
```

The browser test cannot open the browser folder dialog. It uploads the files to the same input without the `webkitdirectory` attribute, and it uses the download path for export.
