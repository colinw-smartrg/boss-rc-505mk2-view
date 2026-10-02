// Usage: node test/browser.js
// Needs puppeteer-core (npm install --no-save puppeteer-core) and Chrome.
// Environment: CHROME (the Chrome binary). The data is test/fixtures/DATA.
//
// The DevTools protocol cannot put files on a webkitdirectory input, so the
// test removes that attribute and uploads the RC0 files directly. The same
// change handler runs; only the browser folder dialog is not exercised.
// The test also removes showDirectoryPicker, so export uses downloads.

import { execFileSync } from 'child_process';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import puppeteer from 'puppeteer-core';
import { rc0_parse } from '../lib/rc0_parse.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
// The checks below are facts of the fixture snapshot, not of the live folder.
const data_dir = path.join(root, 'test/fixtures/DATA');
const chrome = process.env.CHROME || '/usr/bin/google-chrome';
const out_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rcview-'));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

let failures = 0;
function check(cond, message) {
  console.log(cond ? 'ok  ' : 'FAIL', message);
  if (!cond)
    failures++;
}

const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/index.html`;

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => {
  if (m.type() === 'error')
    errors.push(m.text());
});
page.on('requestfailed', r => errors.push(`request failed: ${r.url()}`));
page.on('response', r => {
  if (r.status() >= 400)
    errors.push(`HTTP ${r.status()}: ${r.url()}`);
});
await page.evaluateOnNewDocument(() => {
  delete window.showDirectoryPicker;
});
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: out_dir });
await page.goto(url);

const files = fs.readdirSync(data_dir).filter(n => /\.RC0$/i.test(n)).map(n => path.join(data_dir, n));
await page.$eval('#picker', e => e.removeAttribute('webkitdirectory'));
await (await page.$('#picker')).uploadFile(...files);
await page.waitForSelector('.list-item');

const src_a = rc0_parse(fs.readFileSync(path.join(data_dir, 'MEMORY001A.RC0'), 'latin1'));
check(await page.$$eval('.list-item', e => e.length) === 5, 'list has the system entry and the 4 fixture memories');
check(await page.$$eval('#legend .badge', e => e.map(b => b.textContent).join()) === 'unit,guide,inferred,mcp,unknown', 'the legend lists the unit status first');
check(await page.$eval('.name-input', e => e.value) === 'DonkeyKong', 'memory 01 shows its name');
check((await page.$eval('.view-head .sub', e => e.textContent)).startsWith('90.0 BPM'), 'memory 01 shows 90.0 BPM');
check((await page.$eval('.track .track-sum', e => e.textContent)).startsWith('2 meas, 5.33 s'), 'track 1 summary decodes the phrase length');

await page.$$eval('.track:first-child table.fields tr', rows => {
  const row = rows.find(tr => tr.querySelector('td.name').firstChild.textContent === 'PLAY LEVEL');
  const input = row.querySelector('input');
  input.value = '150';
  input.dispatchEvent(new Event('change'));
});
check(await page.$eval('.track .meter-fill', e => e.style.width) === '75%', 'level bar follows the edit');
const row_of = (name) => `[...document.querySelectorAll('.track:first-child table.fields tr')].find(tr => tr.querySelector('td.name').firstChild.textContent === '${name}')`;
check(await page.evaluate(`[...${row_of('PAN')}.querySelectorAll('.slider-value span')].map(s => s.textContent).join('|')`) === 'CENTER|(50)', 'PAN slider shows CENTER and (50) on the side');
check(await page.evaluate(`${row_of('PLAY LEVEL')}.querySelector('.slider-value').textContent`) === '150', 'PLAY LEVEL slider shows 150');
check(await page.evaluate(`${row_of('STOP MODE')}.querySelector('select').selectedOptions[0].textContent`) === 'LOOP' + '\u00a0'.repeat(6) + '(2)', 'STOP MODE option pads LOOP so that (2) is right-aligned');
check(await page.evaluate(`(() => { const r = ${row_of('STOP MODE')}; const a = r.querySelector('select').getBoundingClientRect(); const b = r.querySelector('td.name').getBoundingClientRect(); return a.top < b.bottom && b.top < a.bottom && a.left > b.left; })()`), 'track controls share the line of their name');
check(await page.evaluate(`${row_of('PAN')}.querySelector('input').getBoundingClientRect().top > ${row_of('PAN')}.querySelector('td.name').getBoundingClientRect().bottom - 1`), 'PAN slider is on its own line');
check(await page.evaluate(`[...${row_of('INPUT')}.querySelectorAll('.bit')].map(b => b.textContent).join()`) === 'MIC1,MIC2,INST1-L,INST1-R,INST2,RHYTHM', 'track INPUT merges INST2 (STEREO LINK INST2 is ON in the system file)');
check(await page.evaluate(`${row_of('PLAY MODE')}.querySelector('select').selectedOptions[0].textContent`) === 'MULTI', 'a 2-option select shows no value');
check(await page.evaluate(`${row_of('REVERSE')}.querySelector('button.toggle').textContent`) === 'OFF', 'REVERSE is an OFF toggle');
await page.evaluate(`${row_of('REVERSE')}.querySelector('button.toggle').click()`);
check(await page.evaluate(`(() => { const b = ${row_of('REVERSE')}.querySelector('button.toggle'); return b.textContent + ' ' + b.classList.contains('on') + ' ' + getComputedStyle(b).backgroundColor; })()`) === 'ON true rgb(63, 185, 107)', 'the toggle turns ON with a green background');
await page.evaluate(`${row_of('REVERSE')}.querySelector('button.toggle').click()`);
check(await page.evaluate(`getComputedStyle(${row_of('REVERSE')}.querySelector('button.toggle')).backgroundColor`) === 'rgb(0, 0, 0)', 'OFF has a black background');
check(!(await page.$eval('#changes', e => e.textContent)).includes('TRACK1 A'), 'a toggle back to the stored value leaves no change');
check((await page.$eval('#changes', e => e.textContent)).includes('TRACK1 D: 100 -> 150'), 'changes panel lists the edit');

await page.screenshot({ path: path.join(out_dir, 'memory.png') });
check(await page.$$eval('.fx', fx => fx.map(f => [...f.querySelectorAll('.fx-setup td.name')].map(td => td.firstChild.textContent).join()).join('|')) === 'BANK|BANK', 'BANK stands alone below each FX title');
check(await page.$$eval('.fx', fx => fx.every(f => f.querySelector('h3').nextElementSibling.classList.contains('fx-setup'))), 'the BANK line follows the title directly');
check(await page.$$eval('.fx .fx-bank', cols => cols.map(c => c.querySelector('.fx-bank-setup td.name:nth-child(1)') && [...c.querySelectorAll('.fx-bank-setup td.name')].map(td => td.firstChild.textContent).join()).join('|')) === Array(8).fill('MODE,SW,KNOB').join('|'), 'each bank column holds its own bank settings');
check(await page.$$eval('.fx .fx-bank', cols => cols.every(c => c.querySelectorAll('.fx-slots .fx-cell').length === 4)), 'each bank column holds 4 slots');
check(!(await page.$('.fx-banks')), 'the separate setup card is gone');
await page.evaluate(() => { document.querySelector('.view').scrollTop = document.querySelector('.fx').offsetTop - 10; });
await page.screenshot({ path: path.join(out_dir, 'fx.png') });
const rhythm_row = name => `[...document.querySelectorAll('.panels .card')].find(c => c.querySelector('h4')?.textContent === 'RHYTHM').querySelectorAll('tr')`;
const rhythm_select = name => page.evaluate(`[...${rhythm_row()}].find(tr => tr.querySelector('td.name').textContent === '${name}').querySelector('select')`);
const pattern_state = () => page.evaluate(`(() => { const s = [...${rhythm_row()}].find(tr => tr.querySelector('td.name').textContent === 'PATTERN').querySelector('select'); return s.selectedOptions[0].textContent.replace(/\u00a0+/g, ' ') + '|' + s.options.length; })()`);
check(await pattern_state() === 'ELCTRO01 (0)|9', 'memory 01 PATTERN shows ELCTRO01 from the ELCTRO list');
check(await page.evaluate(`[...${rhythm_row()}].map(tr => tr.querySelector('td.name').textContent).join()`) === 'GENRE,PATTERN,VARIATION,KIT,BEAT,START TRIG,STOP TRIG,INTRO REC,INTRO PLAY,ENDING,FILL,VAR.CHANGE,?', 'RHYTHM rows follow the guide order, M last');
await page.evaluate(`(() => { const s = [...${rhythm_row()}].find(tr => tr.querySelector('td.name').textContent === 'GENRE').querySelector('select'); s.value = '10'; s.dispatchEvent(new Event('change')); })()`);
check((await pattern_state()).endsWith('|16'), 'GENRE ROCK gives the 16 ROCK patterns');
await page.evaluate(`[...${rhythm_row()}].find(tr => tr.querySelector('td.name').textContent === 'GENRE').querySelector('button.revert').click()`);
check(await pattern_state() === 'ELCTRO01 (0)|9', 'a GENRE revert brings back the ELCTRO list');
check(await page.$$eval('.assign-cell', e => e.length) === 16, 'the ASSIGN grid has 16 cells');
check(await page.$eval('.assign-cell', e => e.textContent) === '1MIDI CC#21ON', 'ASSIGN1 shows ON and its SOURCE');
check(await page.$$eval('.assign-cell', e => {
  const x = e.map(c => Math.round(c.getBoundingClientRect().left));
  const y = e.map(c => Math.round(c.getBoundingClientRect().top));
  const col = i => x[i];
  return [0, 1, 2, 3].every(i => col(i) === col(0)) && [12, 13, 14, 15].every(i => col(i) === col(12))
    && col(12) > col(8) && col(8) > col(4) && col(4) > col(0) && y[1] > y[0] && y[4] === y[0];
}), 'ASSIGN grid runs by column: 1-4 in the first column, 13-16 in the last');
await page.$$eval('.assign-cell', e => e[5].click());
const target_label = () => page.$eval('.assign-detail', c => [...c.querySelectorAll('tr')].find(tr => tr.querySelector('td.name').textContent === 'TARGET').querySelector('select').selectedOptions[0].textContent);
check((await target_label()).startsWith('ALL ST/STP'), 'ASSIGN6 TARGET 69 decodes as ALL ST/STP');
await page.$$eval('.assign-cell', e => e[6].click());
check((await target_label()).startsWith('MIDI CC#127'), 'ASSIGN7 TARGET 917 decodes as MIDI CC#127');
await page.$$eval('.assign-cell', e => e[6].click());
await page.$$eval('.assign-cell', e => e[0].click());
check((await target_label()).startsWith('TRK1 REC/PLY'), 'ASSIGN1 TARGET decodes as TRK1 REC/PLY');
await page.$$eval('.assign-cell', e => e[6].click());
await page.$eval('.assign-detail', c => [...c.querySelectorAll('tr')].find(tr => tr.querySelector('td.name').textContent === 'SW').querySelector('button.toggle').click());
check(await page.$$eval('.assign-cell', e => e[6].classList.contains('on') && e[6].classList.contains('changed')), 'an ASSIGN edit updates its grid cell');
await page.evaluate(() => { document.querySelector('.view').scrollTop = document.querySelector('.assign').offsetTop - 10; });
await page.screenshot({ path: path.join(out_dir, 'assign.png') });
await page.$eval('.assign-detail', c => [...c.querySelectorAll('tr')].find(tr => tr.querySelector('td.name').textContent === 'SW').querySelector('button.revert').click());
await page.$$eval('.assign-cell', e => e[6].click());
await page.$$eval('.fx-cell:not(.assign-cell)', cells => cells[0].click());
check((await page.$$eval('.fx-detail h4', e => e.map(x => x.textContent))).join() === 'Slot A-A,LPF,FX sequence', 'FX slot A-A opens LPF with its sequence');
check(await page.$eval('.fx-detail .card', c => [...c.querySelectorAll('td.name')].map(td => td.textContent).join()) === 'SW,SW MODE,FX TYPE,INSERT', 'the slot table names its 4 fields');
await page.$eval('.fx-detail .card', c => {
  const row = [...c.querySelectorAll('tr')].find(tr => tr.querySelector('td.name').textContent === 'INSERT');
  const sel = row.querySelector('select');
  sel.value = '1';
  sel.dispatchEvent(new Event('change'));
});
check((await page.$$eval('.fx-cell', e => e[0].textContent)).includes('INSERT MIC1'), 'the grid cell shows INSERT MIC1');
await page.$eval('.fx-detail .card', c => {
  const row = [...c.querySelectorAll('tr')].find(tr => tr.querySelector('td.name').textContent === 'INSERT');
  row.querySelector('button.revert').click();
});
await page.$$eval('.fx-detail table.fields tr', rows => {
  const row = rows.find(tr => tr.querySelector('td.name')?.textContent === 'FX TYPE');
  const sel = row.querySelector('select');
  sel.value = '35';
  sel.dispatchEvent(new Event('change'));
});
check((await page.$$eval('.fx-detail h4', e => e.map(x => x.textContent))).join() === 'Slot A-A,DELAY', 'a new FX TYPE shows the DELAY parameters');
check((await page.$eval('.fx-cell', e => e.textContent)).includes('DELAY'), 'the grid cell shows the new FX type');

// An FX parameter edit marks its grid cell.
await page.$$eval('.fx-cell:not(.assign-cell)', cells => cells[3].click());
await page.$$eval('.fx-detail .card:nth-child(2) table.fields tr', rows => {
  const slider = rows.map(r => r.querySelector('input[type=range]')).find(Boolean);
  slider.value = String(Number(slider.value) === Number(slider.min) ? Number(slider.min) + 1 : slider.min);
  slider.dispatchEvent(new Event('change'));
});
check(await page.$$eval('.fx-cell', e => e[3].classList.contains('changed')), 'an FX parameter edit marks its grid cell');

// A tempo edit updates the header; an empty input is not stored.
const set_master = async value => page.$$eval('.panels .card table.fields tr', (rows, v) => {
  const row = rows.find(tr => tr.querySelector('td.name')?.textContent === 'TEMPO');
  const input = row.querySelector('input');
  input.value = v;
  input.dispatchEvent(new Event('change'));
  return input.classList.contains('invalid');
}, value);
await set_master('');
check(!(await page.$eval('#changes', e => e.textContent)).includes('MASTER A'), 'an empty input is not stored');
await set_master('95.5');
check((await page.$eval('.view-head .sub', e => e.textContent)).startsWith('95.5 BPM'), 'header follows a tempo edit');
check((await page.$eval('#changes', e => e.textContent)).includes('MASTER A: 900 -> 955'), 'tempo x10 is stored');

// Export opens a panel: what to export, and in which format. Without the
// folder picker, a ZIP is one download.
const export_with = async (scope, format, single) => {
  if (!(await page.$('.export-panel')))
    await page.click('#export');
  return page.evaluate((sc, fm, si) => {
    const panel = document.querySelector('.export-panel');
    panel.querySelector(`input[name=export-scope][value=${sc}]`).checked = true;
    panel.querySelector(`input[name=export-format][value=${fm}]`).checked = true;
    if (si)
      panel.querySelector('.export-single').value = si;
    panel.dispatchEvent(new Event('change'));
    return panel.querySelector('.export-summary').textContent;
  }, scope, format, single);
};
check((await export_with('changed', 'zip')).startsWith('1 file, 1 with changes.'), 'the panel counts the files of Just changed');
await page.click('.export-panel button.primary');
const zip_of = () => fs.readdirSync(out_dir).find(n => /^rc505-export-.*\.zip$/.test(n));
for (let i = 0; i < 50 && !zip_of(); i++)
  await new Promise(r => setTimeout(r, 100));
const zip_file = zip_of() && path.join(out_dir, zip_of());
check(zip_file, 'export downloads one ZIP file');
const zip_entries = zip_file ? execFileSync('python3', ['-c', 'import sys, zipfile; z = zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(",".join(z.namelist()))', zip_file]).toString().trim() : '';
check(zip_entries === 'ROLAND/DATA/MEMORY001B.RC0', `the ZIP holds the changed memory in ROLAND/DATA/: ${zip_entries}`);
if (zip_file)
  execFileSync('python3', ['-m', 'zipfile', '-e', zip_file, out_dir]);
check((await page.$eval('#info', e => e.textContent)).startsWith(`Downloaded ${zip_of()} with 1 file in ROLAND/DATA/.`), 'the export message names the ZIP');
const out_file = path.join(out_dir, 'ROLAND/DATA/MEMORY001B.RC0');
check(fs.existsSync(out_file), 'export writes the lower-count copy MEMORY001B.RC0');
check(!(await page.$('.export-panel')), 'the panel closes after the export');

fs.renameSync(zip_file, zip_file + '.changed');
check((await export_with('all', 'zip')).startsWith('10 files, 1 with changes.'), 'All counts the complete DATA folder');
await page.click('.export-panel button.primary');
for (let i = 0; i < 50 && !zip_of(); i++)
  await new Promise(r => setTimeout(r, 100));
const all_entries = execFileSync('python3', ['-c', 'import sys, zipfile; print(len(zipfile.ZipFile(sys.argv[1]).namelist()))', path.join(out_dir, zip_of())]).toString().trim();
check(all_entries === '10', `All exports a ZIP of the 10 files: ${all_entries}`);
fs.renameSync(path.join(out_dir, zip_of()), path.join(out_dir, 'all.zip.done'));

check(await page.evaluate(() => { document.querySelector('#export').click(); return [...document.querySelectorAll('.export-single option')].map(o => o.value).join(); }) === 'MEMORY001', 'Single file lists only changed memories');
await export_with('single', 'files', 'MEMORY001');
fs.rmSync(path.join(out_dir, 'MEMORY001B.RC0'), { force: true });
await page.click('.export-panel button.primary');
for (let i = 0; i < 50 && !fs.existsSync(path.join(out_dir, 'MEMORY001B.RC0')); i++)
  await new Promise(r => setTimeout(r, 100));
check(fs.existsSync(path.join(out_dir, 'MEMORY001B.RC0')), 'Single file as a separate download writes MEMORY001B.RC0');
if (fs.existsSync(out_file)) {
  const src = fs.readFileSync(path.join(data_dir, 'MEMORY001A.RC0'));
  const out = fs.readFileSync(out_file);
  const doc = rc0_parse(out.toString('latin1'));
  const field = (p, t) => doc.sections.find(s => s.path === p).fields.find(f => f.tag === t).value;
  check(field('mem/MASTER', 'A') === '955', 'export holds the tempo edit');
  check(field('mem/TRACK1', 'D') === '150' && field('ifx/AA', 'C') === '35', 'export holds both edits');
  check(doc.count === src_a.count + 1, 'export count is the higher count + 1');
  const src_lines = src.toString('latin1').split('\n');
  const out_lines = out.toString('latin1').split('\n');
  check(src_lines.length === out_lines.length && src_lines.filter((l, i) => l !== out_lines[i]).length === 5, 'export changes exactly 5 lines (4 values, count)');
}

// Copy from memory 01 to a list of memories.
const changes_text = () => page.$eval('#changes', e => e.textContent);
let ch;
await page.click('#revert-all');
await page.click('.copy-open');
const copy_set = async (kind, dest) => page.evaluate((k, d) => {
  const panel = document.querySelector('.copy-panel');
  const sel = panel.querySelector('select');
  sel.value = k;
  sel.dispatchEvent(new Event('change'));
  const input = panel.querySelector('.copy-dest');
  input.value = d;
  input.dispatchEvent(new Event('input'));
  return panel.querySelector('.copy-preview').textContent;
}, kind, dest);
let preview = await copy_set('assign', '2,7,10,50');
check(preview.includes('To 3 memories: 2, 7, 10.') && preview.includes('skipped: 50'), `copy preview: ${preview}`);
preview = await copy_set('assign', '2,x');
check(preview.includes('"x" is not a number') && await page.$eval('.copy-panel button.primary', b => b.disabled), 'a bad destination list shows the error and disables Copy');
await copy_set('assign', '2,7,10,50');
await page.click('.copy-panel button.primary');
await page.waitForFunction(() => document.querySelector('.copy-result').textContent.startsWith('Copied'));
ch = await changes_text();
check(ch.includes('MEMORY002 (') && ch.includes('MEMORY007 (') && ch.includes('MEMORY010 (') && ch.includes('ASSIGN1 C: 0 -> 59'), 'Assign copy edits memories 2, 7 and 10');
check((await page.$eval('.copy-result', e => e.textContent)).startsWith('Copied Assign of memory 1, as it was at the time of the copy, to 3 memories: '), 'the copy reports its result');
await copy_set('memory', '2');
await page.click('.copy-panel button.primary');
await page.waitForFunction(() => document.querySelector('.copy-result').textContent.startsWith('Copied Whole'));
check(await page.$$eval('.list-item', e => e.find(i => i.textContent.startsWith('02')).querySelector('.list-name').textContent) === 'Gothassz', 'a whole-memory copy keeps the destination name');
await page.click('#revert-all');
check((await changes_text()) === 'No changes.', 'Revert all undoes the copy');
check((await export_with('changed', 'zip')).includes('There are no changes to export.') && await page.$eval('.export-panel button.primary', b => b.disabled), 'with no changes, Just changed exports nothing');
check((await export_with('single', 'zip')).includes('has no changes to export'), 'with no changes, Single file has nothing to export');
check((await export_with('all', 'zip')).startsWith('10 files, 0 with changes.'), 'with no changes, All still exports the complete folder');
await page.screenshot({ path: path.join(out_dir, 'export.png') });
await page.click('#export');
await page.$$eval('.list-item', items => items.find(i => i.textContent.includes('System')).click());
check((await page.$$eval('.system .card h4', e => e.map(x => x.textContent))).join() === 'INPUT,MIXER INPUT,ROUTING INPUT,EQ MIC,EQ INST1,EQ INST2,OUTPUT,MASTER FX,MIXER OUTPUT,ROUTING OUTPUT,EQ MAIN,EQ SUB1,EQ SUB2,CTL1,CTL2,EXP1,CTL3,CTL4,EXP2,USB,MIDI', 'system panels are grouped by input and output, with CTL/EXP above USB and MIDI');
const card_names = title => page.evaluate(t => [...document.querySelectorAll('.system .card')].find(c => c.querySelector('h4').textContent === t).querySelectorAll('tbody td.name'), title)
  .then(() => page.$$eval('.system .card', (cards, t) => [...cards.find(c => c.querySelector('h4').textContent === t).querySelectorAll('tbody td.name')].map(td => td.textContent).join(','), title));
check(await card_names('ROUTING OUTPUT') === 'MAIN,SUB1,SUB2,PHONES', 'ROUTING OUTPUT merges the linked MAIN, SUB1 and SUB2');
check(await card_names('MIXER OUTPUT') === 'MAIN OUT,SUB1 OUT,SUB2 OUT,LOOP OUT,RHYTHM OUT,PHONES OUT,MASTER OUT', 'MIXER OUTPUT merges the linked outputs');
check(await card_names('MIXER INPUT') === 'MIC1 IN,MIC1 MUTE,MIC2 IN,MIC2 MUTE,INST1-L IN,INST1-L MUTE,INST1-R IN,INST1-R MUTE,INST2 IN,INST2 MUTE', 'MIXER INPUT merges only INST2');
check(await card_names('ROUTING INPUT') === 'MAIN,SUB1,SUB2,PHONES,PHONES RHYTHM,RHYTHM OUT,PHONES OUT SW,PHONES MONITOR,INPUT THRU', 'ROUTING INPUT lists the outputs and the rest');
check(await card_names('MASTER FX') === 'COMP,REVERB,INSERT', 'MASTER FX names A, B and C');
check(await card_names('CTL1') === '?,FUNC,?,?' && await card_names('EXP1') === '?,FUNC,MIN,MAX', 'CTL and EXP cards show their fields');
const ectl_rows = await page.$$eval('.system .panels-3 .card', cards => {
  const rows = new Map();
  for (const c of cards) {
    const top = Math.round(c.getBoundingClientRect().top);
    rows.set(top, [...(rows.get(top) || []), c.querySelector('h4').textContent]);
  }
  return [...rows.values()].map(r => r.join(',')).join('|');
});
check(ectl_rows === 'CTL1,CTL2,EXP1|CTL3,CTL4,EXP2', `CTL/EXP cards sit in two rows of three: ${ectl_rows}`);
const groups = await page.$$eval('.system details.group > summary', e => e.map(x => x.textContent).join('|'));
check(groups === 'Panel and pedal controls (ICTL) (47)|Setup and preferences (4)', `the collapsed group holds only the ICTL sections: ${groups}`);
const eq_heads = t => page.$$eval('.system .card', (cards, t) => [...cards.find(c => c.querySelector('h4').textContent === t).querySelectorAll('thead th')].map(th => th.textContent).filter(Boolean).join(','), t);
check(await eq_heads('EQ MAIN') === 'MAIN' && await eq_heads('EQ MIC') === 'MIC1,MIC2', 'EQ boxes show one column when linked, two when not');
await page.screenshot({ path: path.join(out_dir, 'system.png'), fullPage: true });

// Linked edits go to both sides: separate EQ sections, fields in one
// section, and bits in one field. A revert restores both.

const card_eval = (title, fn, arg) => page.$$eval('.system .card', (cards, [t, src, a]) => {
  const c = cards.find(x => x.querySelector('h4').textContent === t);
  return new Function('c', 'a', src)(c, a);
}, [title, fn, arg]);
await card_eval('EQ MAIN', `const t = [...c.querySelectorAll('tbody tr')].find(tr => tr.querySelector('td.name').textContent === 'SW'); t.querySelector('button.toggle').click();`);
ch = await changes_text();
check(ch.includes('EQ_MAINOUTL A: 0 -> 1') && ch.includes('EQ_MAINOUTR A: 0 -> 1'), 'linked EQ MAIN SW edit sets L and R');
await card_eval('EQ MAIN', `const t = [...c.querySelectorAll('tbody tr')].find(tr => tr.querySelector('td.name').textContent === 'SW'); t.querySelector('button.revert').click();`);
ch = await changes_text();
check(!ch.includes('EQ_MAINOUT'), 'revert of the linked EQ edit restores L and R');
await card_eval('MIXER OUTPUT', `const t = [...c.querySelectorAll('tbody tr')].find(tr => tr.querySelector('td.name').textContent === 'SUB1 OUT'); const i = t.querySelector('input'); i.value = '120'; i.dispatchEvent(new Event('change'));`);
ch = await changes_text();
check(ch.includes('MIXER O: 100 -> 120') && ch.includes('MIXER P: 100 -> 120'), 'linked MIXER SUB1 OUT edit sets SUB1-L and SUB1-R');
const inst2_before = await card_eval('ROUTING INPUT', `const t = [...c.querySelectorAll('tbody tr')].find(tr => tr.querySelector('td.name').textContent === 'SUB1'); return [...t.querySelectorAll('.bit')].map(b => b.textContent).join();`);
check(inst2_before === 'MIC1,MIC2,INST1-L,INST1-R,INST2,RHYTHM', 'ROUTING INPUT bits merge INST2');
await card_eval('ROUTING INPUT', `const t = [...c.querySelectorAll('tbody tr')].find(tr => tr.querySelector('td.name').textContent === 'SUB1'); const b = [...t.querySelectorAll('.bit')].find(x => x.textContent === 'INST2'); b.firstChild.click();`);
ch = await changes_text();
check(ch.includes('ROUTING J: 96 -> 112') && ch.includes('ROUTING K: 127 -> 112'), 'linked INST2 bit sets INST2-L and INST2-R (96 -> 112), and linked SUB1 copies the field to SUB1-R');
await card_eval('ROUTING INPUT', `const t = [...c.querySelectorAll('tbody tr')].find(tr => tr.querySelector('td.name').textContent === 'SUB1'); const b = [...t.querySelectorAll('.bit')].find(x => x.textContent === 'INST2'); b.firstChild.click();`);
ch = await changes_text();
check(!ch.includes('ROUTING J') && !ch.includes('ROUTING K'), 'unchecking the bit again restores the stored values of SUB1-L and SUB1-R');
await page.$$eval('.system .card', cards => {
  const out = cards.find(c => c.querySelector('h4').textContent === 'OUTPUT');
  const row = [...out.querySelectorAll('tr')].find(tr => tr.querySelector('td.name').textContent === 'STEREO LINK MAIN');
  row.querySelector('button.toggle').click();
});
check(await card_names('ROUTING OUTPUT') === 'MAIN-L,MAIN-R,SUB1,SUB2,PHONES', 'STEREO LINK MAIN OFF shows MAIN-L and MAIN-R again');
check(await eq_heads('EQ MAIN') === 'MAIN-L,MAIN-R', 'EQ MAIN shows L and R after the link is off');

// A stand-in folder picker: a DATA folder in memory that holds the
// fixture files, and a ROLAND folder around it. It records each write.
const page2 = await browser.newPage();
page2.on('pageerror', e => errors.push(e.message));
await page2.evaluateOnNewDocument(names => {
  const file_handle = (dir, name) => ({
    kind: 'file', name,
    getFile: async () => new File([dir.files.get(name)], name),
    createWritable: async () => {
      const parts = [];
      return { write: async b => parts.push(b), close: async () => { dir.files.set(name, new Blob(parts)); window.__written.push(name); } };
    },
  });
  const make_dir = (name, files, subdirs = []) => {
    const dir = {
      kind: 'directory', name, files, subdirs,
      isSameEntry: async other => other === dir,
      getFileHandle: async (n, opts) => {
        if (!dir.files.has(n) && !opts?.create)
          throw new DOMException('not found', 'NotFoundError');
        if (!dir.files.has(n))
          dir.files.set(n, new Blob([]));
        return file_handle(dir, n);
      },
      values: async function* () {
        for (const d of dir.subdirs)
          yield d;
        for (const n of dir.files.keys())
          yield file_handle(dir, n);
      },
    };
    return dir;
  };
  window.__written = [];
  window.__ready = (async () => {
    const files = new Map();
    for (const n of names)
      files.set(n, await (await fetch(`/test/fixtures/DATA/${n}`)).blob());
    window.__data = make_dir('DATA', files);
    window.__roland = make_dir('ROLAND', new Map(), [window.__data]);
  })();
  window.__pick = 'data';
  window.showDirectoryPicker = async () => { await window.__ready; return window.__pick === 'roland' ? window.__roland : window.__data; };
}, fs.readdirSync(data_dir));
await page2.setViewport({ width: 1600, height: 1000 });
await page2.goto(url);
await page2.click('#open');
await page2.waitForSelector('.list-item');
check(await page2.$$eval('.list-item', e => e.length) === 5, 'the folder picker loads the fixture');
await page2.evaluate(() => {
  const row = [...document.querySelectorAll('.track:first-child table.fields tr')].find(tr => tr.querySelector('td.name').firstChild.textContent === 'PLAY LEVEL');
  const input = row.querySelector('input');
  input.value = '150';
  input.dispatchEvent(new Event('change'));
});
const export2 = async (overwrite, pick) => {
  await page2.evaluate(p => { window.__pick = p; }, pick);
  if (!(await page2.$('.export-panel')))
    await page2.click('#export');
  await page2.evaluate(ow => {
    const panel = document.querySelector('.export-panel');
    panel.querySelector('input[name=export-scope][value=changed]').checked = true;
    panel.querySelector('input[name=export-format][value=files]').checked = true;
    panel.dispatchEvent(new Event('change'));
    const box = panel.querySelector('.export-overwrite');
    box.checked = ow;
    panel.dispatchEvent(new Event('change'));
  }, overwrite);
  const shown = await page2.$eval('.export-overwrite', b => !b.closest('.export-row').hidden);
  await page2.click('.export-panel button.primary');
  await page2.waitForFunction(() => !document.querySelector('#info').textContent.startsWith('Loaded'));
  const info = await page2.$eval('#info', e => e.textContent);
  await page2.evaluate(() => { document.querySelector('#info').textContent = 'Loaded'; });
  return { shown, info, written: await page2.evaluate(() => window.__written.join()) };
};
let r = await export2(false, 'data');
check(r.shown && r.info.startsWith('This folder holds RC0 files.') && r.written === '', 'without overwrite, the loaded folder is refused');
r = await export2(true, 'roland');
check(r.info.startsWith('This folder holds a DATA folder.') && r.written === '', 'with overwrite, a folder around DATA is refused');
r = await export2(true, 'data');
check(r.written === 'MEMORY001B.RC0' && r.info.includes('1 existing file was replaced') && r.info.includes('now the current copies of 1 memory'), `with overwrite, the loaded folder takes the new copy: ${r.info}`);
check(await page2.$$eval('.list-item', e => e.find(i => i.textContent.startsWith('01')).querySelector('.list-copy').textContent) === 'B 000E', 'memory 01 now shows its new copy B with count 000E');
check(await page2.$eval('#changes', e => e.textContent) === 'No changes.', 'the committed memory has no edits left');
check(await page2.evaluate(async () => (await window.__data.files.get('MEMORY001B.RC0').text()).includes('<count>000E</count>')), 'the written file holds count 000E');
await page2.close();

check(!errors.length, `no page errors${errors.length ? ': ' + errors.join('; ') : ''}`);
await browser.close();
server.close();
console.log(`output in ${out_dir}`);
process.exit(failures ? 1 : 0);
