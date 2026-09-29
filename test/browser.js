// Usage: node test/browser.js
// Needs puppeteer-core (npm install --no-save puppeteer-core) and Chrome.
// Environment: RC0_DATA (the DATA folder), CHROME (the Chrome binary).
//
// The DevTools protocol cannot put files on a webkitdirectory input, so the
// test removes that attribute and uploads the RC0 files directly. The same
// change handler runs; only the browser folder dialog is not exercised.
// The test also removes showDirectoryPicker, so export uses downloads.

import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import puppeteer from 'puppeteer-core';
import { rc0_parse } from '../lib/rc0_parse.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const data_dir = process.env.RC0_DATA || '/sandbox/colinw/ROLAND/DATA';
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
check(await page.$$eval('.list-item', e => e.length) === 100, 'list has 99 memories and the system entry');
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
await page.$$eval('.fx-cell', cells => cells[0].click());
check((await page.$$eval('.fx-detail h4', e => e.map(x => x.textContent))).join() === 'Slot A-A,LPF,FX sequence', 'FX slot A-A opens LPF with its sequence');
await page.$$eval('.fx-detail table.fields tr', rows => {
  const row = rows.find(tr => tr.querySelector('td.name')?.textContent === 'FX TYPE');
  const sel = row.querySelector('select');
  sel.value = '35';
  sel.dispatchEvent(new Event('change'));
});
check((await page.$$eval('.fx-detail h4', e => e.map(x => x.textContent))).join() === 'Slot A-A,DELAY', 'a new FX TYPE shows the DELAY parameters');
check((await page.$eval('.fx-cell', e => e.textContent)).includes('DELAY'), 'the grid cell shows the new FX type');

// An FX parameter edit marks its grid cell.
await page.$$eval('.fx-cell', cells => cells[3].click());
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

await page.click('#export');
const out_file = path.join(out_dir, 'MEMORY001B.RC0');
for (let i = 0; i < 50 && !fs.existsSync(out_file); i++)
  await new Promise(r => setTimeout(r, 100));
check(fs.existsSync(out_file), 'export writes the lower-count copy MEMORY001B.RC0');
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

await page.$$eval('.list-item', items => items.find(i => i.textContent.includes('System')).click());
check((await page.$$eval('.system .card h4', e => e.map(x => x.textContent))).join() === 'INPUT,MIXER INPUT,ROUTING INPUT,EQ MIC,EQ INST1,EQ INST2,OUTPUT,MASTER FX,MIXER OUTPUT,ROUTING OUTPUT,EQ MAIN,EQ SUB1,EQ SUB2,USB,MIDI', 'system panels are grouped by input and output');
const card_names = title => page.evaluate(t => [...document.querySelectorAll('.system .card')].find(c => c.querySelector('h4').textContent === t).querySelectorAll('tbody td.name'), title)
  .then(() => page.$$eval('.system .card', (cards, t) => [...cards.find(c => c.querySelector('h4').textContent === t).querySelectorAll('tbody td.name')].map(td => td.textContent).join(','), title));
check(await card_names('ROUTING OUTPUT') === 'MAIN,SUB1,SUB2,PHONES', 'ROUTING OUTPUT merges the linked MAIN, SUB1 and SUB2');
check(await card_names('MIXER OUTPUT') === 'MAIN OUT,SUB1 OUT,SUB2 OUT,LOOP OUT,RHYTHM OUT,PHONES OUT,MASTER OUT', 'MIXER OUTPUT merges the linked outputs');
check(await card_names('MIXER INPUT') === 'MIC1 IN,MIC1 MUTE,MIC2 IN,MIC2 MUTE,INST1-L IN,INST1-L MUTE,INST1-R IN,INST1-R MUTE,INST2 IN,INST2 MUTE', 'MIXER INPUT merges only INST2');
check(await card_names('ROUTING INPUT') === 'MAIN,SUB1,SUB2,PHONES,PHONES RHYTHM,RHYTHM OUT,PHONES OUT SW,PHONES MONITOR,INPUT THRU', 'ROUTING INPUT lists the outputs and the rest');
check(await card_names('MASTER FX') === 'COMP,REVERB,INSERT', 'MASTER FX names A, B and C');
const eq_heads = t => page.$$eval('.system .card', (cards, t) => [...cards.find(c => c.querySelector('h4').textContent === t).querySelectorAll('thead th')].map(th => th.textContent).filter(Boolean).join(','), t);
check(await eq_heads('EQ MAIN') === 'MAIN' && await eq_heads('EQ MIC') === 'MIC1,MIC2', 'EQ boxes show one column when linked, two when not');
await page.screenshot({ path: path.join(out_dir, 'system.png'), fullPage: true });

// Linked edits go to both sides: separate EQ sections, fields in one
// section, and bits in one field. A revert restores both.
const changes_text = () => page.$eval('#changes', e => e.textContent);
const card_eval = (title, fn, arg) => page.$$eval('.system .card', (cards, [t, src, a]) => {
  const c = cards.find(x => x.querySelector('h4').textContent === t);
  return new Function('c', 'a', src)(c, a);
}, [title, fn, arg]);
await card_eval('EQ MAIN', `const t = [...c.querySelectorAll('tbody tr')].find(tr => tr.querySelector('td.name').textContent === 'SW'); t.querySelector('button.toggle').click();`);
let ch = await changes_text();
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

check(!errors.length, `no page errors${errors.length ? ': ' + errors.join('; ') : ''}`);
await browser.close();
server.close();
console.log(`output in ${out_dir}`);
process.exit(failures ? 1 : 0);
