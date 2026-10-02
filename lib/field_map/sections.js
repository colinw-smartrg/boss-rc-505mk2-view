// Field names for the memory (<mem>) and system (<sys>) sections.
//
// status:
//   guide     the name is at its Parameter Guide position, and the sample
//             data agrees with the guide range and default
//   inferred  the name comes from the guide, but the tag was chosen from
//             the sample data (for example a shift by one), or the name
//             comes from the data alone
//   mcp       the name comes from rc505mk2-mcp
//   unknown   no source; `note` gives what the data shows
//
// Any tag that has no entry here is shown as unknown.

import {
  eq_freq_list, eq_lo_cut_list, eq_hi_cut_list, eq_q_list,
  input_bits, track_bits, track_list, genre_list, kit_list, beat_list,
  assign_source_list, assign_target_list,
  panel_func_list, ctl_func_list, exp_func_list, pan_list, numbered,
} from './lists.js';

const off_on = ['OFF', 'ON'];

function f(tag, name, status, source, extra = {}) {
  return { tag, name, status, source, ...extra };
}

function unknown(tag, note) {
  return { tag, name: null, status: 'unknown', source: null, note };
}

const enum_of = values => ({ display: { prefix: values }, min: 0, max: values.length - 1 });
const bool = enum_of(off_on);
const level_200 = { min: 0, max: 200 };
const bits_of = labels => ({ display: { bits: labels }, min: 0, max: 2 ** labels.length - 1 });
const db_20 = { display: { prefix: [], offset: -20, unit: ' dB' }, min: 0, max: 40 };

const track = [
  f('A', 'REVERSE', 'guide', 'p. 2', bool),
  f('B', '1SHOT', 'guide', 'p. 2', bool),
  f('C', 'PAN', 'guide', 'p. 2', { ...enum_of(pan_list()), widget: 'slider' }),
  f('D', 'PLAY LEVEL', 'guide', 'p. 2', level_200),
  f('E', 'START MODE', 'guide', 'p. 2', enum_of(['IMMEDIATE', 'FADE'])),
  f('F', 'STOP MODE', 'guide', 'p. 2', enum_of(['IMMEDIATE', 'FADE', 'LOOP'])),
  f('G', 'DUB MODE', 'guide', 'p. 2', enum_of(['OVERDUB', 'REPLACE1', 'REPLACE2'])),
  f('H', 'FX', 'guide', 'p. 2', bool),
  f('I', 'PLAY MODE', 'guide', 'p. 2', enum_of(['MULTI', 'SINGLE'])),
  f('J', 'MEASURE', 'inferred', 'p. 3; sample data', {
    display: { prefix: ['AUTO', 'FREE', ...numbered('NOTE', 6)], offset: -7, unit: ' MEAS' },
    note: 'In all sample files J = S + 7 when S > 0, so 8 = 1 measure. 0 = AUTO and 1 = FREE follow the guide order. The six note values are not named in any source.',
  }),
  unknown('K', '0 in all sample files. Guide order puts LOOP SYNC here, but its default is ON, so the fields from here on appear shifted by one.'),
  f('L', 'LOOP SYNC', 'inferred', 'p. 3; shifted by one', bool),
  f('M', 'TEMPO SYNC SW', 'inferred', 'p. 3; shifted by one', bool),
  f('N', 'TEMPO SYNC MODE', 'inferred', 'p. 3; shifted by one', enum_of(['PITCH', 'XFADE'])),
  f('O', 'TEMPO SYNC SPEED', 'inferred', 'p. 3; shifted by one', enum_of(['HALF', 'NORMAL', 'DOUBLE'])),
  f('P', 'BOUNCE IN', 'inferred', 'p. 3; shifted by one', bool),
  f('Q', 'INPUT', 'inferred', 'p. 4; sample data', {
    ...bits_of(input_bits),
    note: '127 (all 7 inputs ON) is the guide default. The bit order follows the guide list and is not confirmed.',
  }),
  unknown('R', '1 or 2 in the sample files, 0 once.'),
  f('S', 'MEASURE COUNT', 'inferred', 'sample data', {
    note: 'Number of measures of the phrase. J = S + 7 when S > 0.',
  }),
  unknown('T', '0 in all sample files.'),
  f('U', 'REC TEMPO', 'inferred', 'sample data', {
    display: { scale: 0.1, digits: 1, unit: ' BPM' },
    note: 'Tempo x10, rounded. V is the exact measure length at this tempo.',
  }),
  f('V', 'MEASURE LENGTH', 'inferred', 'sample data', {
    display: { samples: true },
    note: 'Samples per 4/4 measure at 44.1 kHz: within 0.1% of 44100 x 240 / (U / 10) in all 990 tracks.',
  }),
  f('W', 'PHRASE RECORDED', 'inferred', 'sample data', {
    ...bool,
    note: '1 exactly when X > 0, in all 990 tracks.',
  }),
  f('X', 'PHRASE LENGTH', 'inferred', 'sample data', {
    display: { samples: true },
    note: 'Length of the phrase in samples at 44.1 kHz.',
  }),
  unknown('Y', '1 or 2 in the sample files.'),
];

const master = [
  f('A', 'TEMPO', 'mcp', 'rc505mk2-mcp src/parser/rc0-parser.ts', {
    display: { scale: 0.1, digits: 1, unit: ' BPM' },
  }),
  f('B', 'MEASURE LENGTH', 'inferred', 'sample data', {
    display: { samples: true },
    note: 'Same meaning as TRACK V: samples per measure at the memory tempo.',
  }),
  unknown('C', '0 in all sample files.'),
  f('D', 'MEASURE COUNT', 'inferred', 'sample data', {
    note: 'Same value distribution as TRACK1 S.',
  }),
];

const rec = [
  f('A', 'REC ACTION', 'guide', 'p. 4', enum_of(['REC->DUB', 'REC->PLAY'])),
  f('B', 'QUANTIZE', 'guide', 'p. 4', enum_of(['OFF', 'MEASURE'])),
  f('C', 'AUTO REC SW', 'guide', 'p. 4', bool),
  f('D', 'AUTO REC SENS', 'guide', 'p. 4', { min: 1, max: 100 }),
  f('E', 'BOUNCE SW', 'guide', 'p. 4', bool),
  f('F', 'BOUNCE TRACK', 'guide', 'p. 4', {
    ...bits_of(track_bits),
    note: '63 in all sample files: 6 bits, but the unit has 5 tracks.',
  }),
];

const fade_list = ['1/8', '1/8.', '1/4', '1/4.'];

const play = [
  f('A', 'CURRENT TRACK', 'inferred', 'p. 4; sample data', {
    ...enum_of(track_list),
    note: 'Guide order puts S.TRK CHANGE first, but it has 2 values and the data holds 2. The rest of the section fits the guide without S.TRK CHANGE.',
  }),
  f('B', 'FADE TIME IN', 'inferred', 'p. 4', {
    display: { prefix: fade_list, offset: -3, unit: ' MEAS' }, min: 0, max: 67,
    note: '5 = 2MEAS (the default) in all sample files. The steps above 2MEAS are not confirmed.',
  }),
  f('C', 'FADE TIME OUT', 'inferred', 'p. 4', {
    display: { prefix: fade_list, offset: -3, unit: ' MEAS' }, min: 0, max: 67,
    note: 'Same encoding as FADE TIME IN.',
  }),
  f('D', 'ALL START TRK', 'guide', 'p. 4', bits_of(track_bits)),
  f('E', 'ALL STOP TRK', 'guide', 'p. 4', bits_of(track_bits)),
  f('F', 'LOOP LENGTH', 'inferred', 'p. 5', {
    display: { prefix: ['AUTO'], offset: 0, unit: ' MEAS' }, min: 0, max: 25362,
  }),
  f('G', 'SPEED CHANGE', 'inferred', 'p. 5', enum_of(['IMMEDIATE', 'LOOP END'])),
  unknown('H', '1 in all sample files. S.TRK CHANGE and SYNC ADJUST are not placed; both have the default 0 in the guide.'),
];

// The stored order differs from the guide list after VARIATION; the user
// checked each of these fields on the unit.
const rhythm_unit = 'p. 7; user, from the unit';

const rhythm = [
  f('A', 'GENRE', 'guide', 'p. 7', enum_of(genre_list)),
  f('B', 'PATTERN', 'guide', 'pp. 7, 43-44', {
    note: 'Position in the pattern list of the stored GENRE (pp. 43-44). Every genre/pattern pair in the sample data fits.',
  }),
  f('C', 'VARIATION', 'guide', 'p. 7', enum_of(['A', 'B', 'C', 'D'])),
  f('D', 'VAR.CHANGE', 'unit', rhythm_unit, enum_of(['MEASURE', 'LOOP END'])),
  f('E', 'KIT', 'inferred', 'p. 7; sample data', {
    ...enum_of(kit_list),
    note: '0-11 in the sample files; 0 (STUDIO) is the default.',
  }),
  f('F', 'BEAT', 'inferred', 'p. 7; sample data', {
    ...enum_of(beat_list),
    note: '2 (4/4, the default) in all sample files.',
  }),
  f('G', 'FILL', 'unit', rhythm_unit, bool),
  f('H', 'INTRO REC', 'unit', rhythm_unit, bool),
  f('I', 'INTRO PLAY', 'unit', rhythm_unit, bool),
  f('J', 'ENDING', 'unit', rhythm_unit, bool),
  f('K', 'START TRIG', 'unit', rhythm_unit, enum_of(['LOOP START', 'REC END', 'BEFORE LOOP'])),
  f('L', 'STOP TRIG', 'unit', rhythm_unit, enum_of(['OFF', 'LOOP STOP', 'REC END'])),
  unknown('M', '0-2 in the sample files. A check on the unit found no parameter that matches it.'),
];

const name_fields = 'ABCDEFGHIJKL'.split('').map((tag, i) =>
  f(tag, `CHAR ${i + 1}`, 'guide', 'p. 8', { display: { ascii: true }, min: 32, max: 126 }));

const panel_ctl = [
  f('A', 'FUNC', 'inferred', 'pp. 14-16', {
    ...enum_of(panel_func_list),
    note: 'List position = stored value. TRACK1 TRACK=14, TRACK1 FX=15 and TRACK2 FX=30 fit only this order.',
  }),
  unknown('B', '0 in all sample files.'),
  unknown('C', '1 in all sample files.'),
];

const pedal_ctl = [
  unknown('A', 'Pedal function. The guide does not list the pedal functions, and the values (up to 204) do not fit the CTL list.'),
  unknown('B', '0 in all sample files.'),
  unknown('C', '1 in all sample files.'),
];

const ectl_ctl = [
  unknown('A', 'Equals B + 22 in three of four blocks.'),
  f('B', 'FUNC', 'inferred', 'pp. 17-21', {
    ...enum_of(ctl_func_list),
    note: 'The stored values decode to MEMORY INC, MEMORY DEC, TAP TEMPO and RHYTHM START/STOP.',
  }),
  unknown('C', '0 in all sample files.'),
  unknown('D', '1 in all sample files.'),
];

const ectl_exp = [
  unknown('A', 'Equals B + 2 in both blocks.'),
  f('B', 'FUNC', 'inferred', 'p. 22', {
    ...enum_of(exp_func_list),
    note: 'EXP1=19 (IN FX CUR CTL) and EXP2=24 (TR FX CUR CTL) are the guide defaults.',
  }),
  f('C', 'MIN', 'inferred', 'p. 22', { min: 0, max: 255 }),
  f('D', 'MAX', 'inferred', 'p. 22', { min: 0, max: 255 }),
];

const assign = [
  f('A', 'SW', 'guide', 'p. 23', bool),
  unknown('B', '0 in all sample files.'),
  f('C', 'SOURCE', 'inferred', 'p. 23; user, from the unit', {
    ...enum_of(assign_source_list),
    note: 'Stored value = position in the guide list. Each per-track row runs through TRK1-5 first (TRK2 REC/DB = 1, TRK2 TR (PLY) = 17). Not confirmed: CTL1-CTL4 are taken as four entries, so the stored 59-64 of the sample assigns are MIDI CC#21-26.',
  }),
  f('D', 'SOURCE MODE', 'inferred', 'p. 23', enum_of(['MOMENT', 'TOGGLE'])),
  f('E', 'SOURCE ACT. LO', 'inferred', 'p. 23', { min: 0, max: 127 }),
  f('F', 'SOURCE ACT. HI', 'inferred', 'p. 23', { min: 0, max: 127 }),
  unknown('G', '0 in all sample files.'),
  f('H', 'TARGET', 'unit', 'pp. 23-27; sample data; user, from the unit', {
    ...enum_of(assign_target_list),
    note: 'Stored value = position in the guide list from 0, track by track. The sample assigns confirm this up to RHYTHM ST/STP (714). From the unit: MIDI CC#0-127 are 790-917, INPUT THRU is 918, and 919 is IMM ST/STOP ALL, which the guide does not list.',
  }),
  f('I', 'TARGET MIN', 'inferred', 'p. 27', { note: 'The range depends on the target.' }),
  f('J', 'TARGET MAX', 'inferred', 'p. 27', { note: 'The range depends on the target.' }),
];

const input = [
  f('A', 'PHANTOM MIC1', 'guide', 'p. 9', bool),
  f('B', 'PHANTOM MIC2', 'guide', 'p. 9', bool),
  f('C', 'INST1 GAIN', 'guide', 'p. 9', enum_of(['INST', 'LINE'])),
  f('D', 'INST2 GAIN', 'guide', 'p. 9', enum_of(['INST', 'LINE'])),
  f('E', 'STEREO LINK MIC', 'guide', 'p. 9', bool),
  f('F', 'STEREO LINK INST1', 'guide', 'p. 9', bool),
  f('G', 'STEREO LINK INST2', 'guide', 'p. 9', bool),
  f('H', 'MIC1 COMP', 'inferred', 'p. 10', { display: { prefix: ['OFF'] }, min: 0, max: 100 }),
  f('I', 'MIC2 COMP', 'inferred', 'p. 10', { display: { prefix: ['OFF'] }, min: 0, max: 100 }),
  f('J', 'MIC1 NS', 'inferred', 'p. 10', { min: 0, max: 100 }),
  f('K', 'MIC2 NS', 'inferred', 'p. 10', { min: 0, max: 100 }),
  f('L', 'INST1 NS', 'inferred', 'p. 10', { min: 0, max: 100 }),
  f('M', 'INST2 NS', 'inferred', 'p. 10', {
    min: 0, max: 100,
    note: 'The guide lists COMP and NS per mic. The memory defaults (0, 0, 40, 40, 40, 40) fit the two COMP values first.',
  }),
];

const output = [
  f('A', 'OUTPUT KNOB', 'guide', 'p. 11', enum_of(['ALL', 'MASTER', 'PHONES', 'OFF'])),
  f('B', 'STEREO LINK MAIN', 'guide', 'p. 11', bool),
  f('C', 'STEREO LINK SUB1', 'guide', 'p. 11', bool),
  f('D', 'STEREO LINK SUB2', 'guide', 'p. 11', bool),
];

const outs = ['MAIN-L', 'MAIN-R', 'SUB1-L', 'SUB1-R', 'SUB2-L', 'SUB2-R', 'PHONES'];

const routing = [
  ...outs.map((o, i) => f('ABCDEFG'[i], `TRACK -> ${o}`, 'inferred', 'p. 11', bits_of(track_bits))),
  ...outs.map((o, i) => f('HIJKLMN'[i], `INPUT -> ${o}`, 'inferred', 'p. 12', bits_of(input_bits))),
  f('O', 'PHONES RHYTHM', 'inferred', 'p. 12', bool),
  f('P', 'RHYTHM OUT', 'inferred', 'p. 12', enum_of(['OUTPUT', 'LOOP'])),
  f('Q', 'PHONES OUT SW', 'inferred', 'p. 12', enum_of(['MAIN', 'SUB1', 'SUB2', 'INDIVIDUAL'])),
  f('R', 'PHONES MONITOR', 'inferred', 'p. 12; user assessment', {
    ...bool,
    note: 'Guide order puts PHONES MONITOR here. The guide default is ON, but R is 0 in all sample files, so the encoding is not confirmed.',
  }),
  f('S', 'INPUT THRU', 'inferred', 'p. 12 (Ver. 1.1, stored last)', bool),
];

const mixer_ins = ['MIC1', 'MIC2', 'INST1-L', 'INST1-R', 'INST2-L', 'INST2-R'];
const mixer_outs = ['MAIN-L OUT', 'MAIN-R OUT', 'SUB1-L OUT', 'SUB1-R OUT', 'SUB2-L OUT', 'SUB2-R OUT',
  'LOOP OUT', 'RHYTHM OUT', 'PHONES OUT', 'MASTER OUT'];

const mixer = [
  ...mixer_ins.flatMap((name, i) => [
    f('ABCDEFGHIJKL'[2 * i], `${name} IN`, 'inferred', 'p. 13', level_200),
    f('ABCDEFGHIJKL'[2 * i + 1], `${name} MUTE`, 'inferred', 'p. 13', {
      ...bool,
      note: 'The guide says the knob push mutes the input. The data holds level/0 pairs.',
    }),
  ]),
  ...mixer_outs.map((name, i) => f('MNOPQRSTUV'[i], name, 'inferred', 'p. 13', level_200)),
];

const eq = [
  f('A', 'SW', 'guide', 'pp. 9, 13', bool),
  f('B', 'LO GAIN', 'guide', 'pp. 9, 13', db_20),
  f('C', 'HIGH GAIN', 'guide', 'pp. 9, 13', db_20),
  f('D', 'LO MID FREQ', 'guide', 'pp. 9, 13', enum_of(eq_freq_list)),
  f('E', 'LO MID Q', 'guide', 'pp. 9, 13', enum_of(eq_q_list)),
  f('F', 'LO MID GAIN', 'guide', 'pp. 9, 13', db_20),
  f('G', 'HI MID FREQ', 'guide', 'pp. 9, 13', enum_of(eq_freq_list)),
  f('H', 'HI MID Q', 'guide', 'pp. 9, 13', enum_of(eq_q_list)),
  f('I', 'HI MID GAIN', 'guide', 'pp. 9, 13', db_20),
  f('J', 'LEVEL', 'guide', 'pp. 9, 13', db_20),
  f('K', 'LO CUT', 'guide', 'pp. 9, 13', enum_of(eq_lo_cut_list)),
  f('L', 'HI CUT', 'guide', 'pp. 9, 13', enum_of(eq_hi_cut_list)),
];

const master_fx_note = 'Names from p. 13, in guide order (user assessment).';

const master_fx = [
  f('A', 'COMP', 'inferred', 'p. 13', {
    display: { prefix: ['OFF'] }, min: 0, max: 40,
    note: master_fx_note,
  }),
  f('B', 'REVERB', 'unit', 'p. 13; user, from the unit', {
    min: 0, max: 100,
    note: `${master_fx_note} The guide gives 0-40, but the unit allows 0-100, which fits the stored 88.`,
  }),
  f('C', 'INSERT', 'inferred', 'p. 13', {
    ...enum_of(['MAIN-L', 'MAIN-R', 'SUB1-L', 'SUB1-R', 'SUB2-L', 'SUB2-R', 'OFF']),
    note: `${master_fx_note} 0 (MAIN-L, the default) in all sample files.`,
  }),
];

const usb = [
  f('A', 'STORAGE', 'guide', 'p. 27', enum_of(['OFF', 'CONNECT'])),
  f('B', 'AUDIO MODE', 'guide', 'p. 27', enum_of(['GENERIC', 'VENDOR'])),
  f('C', 'AUDIO ROUTING', 'guide', 'p. 27', enum_of(['LINE OUT', 'SUB MIX', 'LOOP IN'])),
  f('D', 'INPUT LEVEL', 'guide', 'p. 27', level_200),
  f('E', 'OUTPUT LEVEL', 'guide', 'p. 27', level_200),
];

const channel = { display: { prefix: [], offset: 1 }, min: 0, max: 15 };

const midi = [
  f('A', 'RX CH CTL', 'guide', 'p. 28', channel),
  f('C', 'RX CH RHYTHM', 'guide', 'p. 28', { ...channel, note: 'The file has no B tag.' }),
  f('D', 'RX CH VOICE', 'guide', 'p. 28', channel),
  f('E', 'TX CH', 'guide', 'p. 28', {
    display: { table: [...Array.from({ length: 16 }, (_, i) => String(i + 1)), 'RX CTL'] }, min: 0, max: 16,
  }),
  f('F', 'SYNC CLOCK', 'guide', 'p. 28', enum_of(['AUTO', 'INTERNAL', 'MIDI', 'USB (AUTO)'])),
  f('G', 'SYNC OUT', 'guide', 'p. 28', bool),
  f('H', 'SYNC START', 'guide', 'p. 28', enum_of(['OFF', 'ALL', 'RHYTHM'])),
  f('I', 'PC OUT', 'guide', 'p. 28', bool),
  f('J', 'THRU', 'guide', 'p. 28', enum_of(['OFF', 'MIDI OUT', 'USB OUT', 'USB & MIDI'])),
  unknown('K', '0 in the system file.'),
];

const setup_note = 'The guide SETUP list (p. 29) has 11 parameters and the file has 22 fields; no alignment fits. Values such as 271-277 may be KNOB FUNC entries.';
const setup = 'ABCDEFGHIJKLMNOPQRSTUV'.split('').map(tag => unknown(tag, setup_note));

const pref_note = 'The guide lists 19 SYSTEM/MEMORY preferences (pp. 9, 11, 22); the file has 20 fields, all 1.';
const pref = 'ABCDEFGHIJKLMNOPQRST'.split('').map(tag => unknown(tag, pref_note));

// FX bank and slot sections under <ifx> and <tfx>.
const fx_setup = [
  f('A', 'BANK', 'mcp', 'rc505mk2-mcp src/parser/rc0-parser.ts', enum_of(['A', 'B', 'C', 'D'])),
];

const fx_user = 'pp. 5, 6; user assessment';

const fx_bank = [
  f('A', 'MODE', 'inferred', fx_user, {
    ...enum_of(['SINGLE', 'MULTI']),
    note: '1 (MULTI, the guide default) in all sample files.',
  }),
  f('B', 'SW', 'inferred', fx_user, {
    ...bool,
    note: 'The guide default is OFF, but B is 1 in all sample files.',
  }),
  f('C', 'KNOB', 'inferred', fx_user, {
    ...enum_of(['A', 'B', 'C', 'D']),
    note: 'The guide calls this FX TARGET: the FX that the [INPUT FX] or [TRACK FX] knob controls.',
  }),
];

const fx_slot_base = [
  f('A', 'SW', 'mcp', 'rc505mk2-mcp src/parser/rc0-parser.ts', bool),
  f('B', 'SW MODE', 'inferred', fx_user, {
    ...enum_of(['TOGGLE', 'MOMENT']),
    note: 'The guide default is MOMENT, but B is 0 (TOGGLE) in all sample files.',
  }),
  f('C', 'FX TYPE', 'mcp', 'rc505mk2-mcp src/fx/fx-indexes.ts', { min: 0, max: 54 }),
];

const insert_note = '0 (ALL, the default) in all sample files.';

const fx_slot_ifx = [
  ...fx_slot_base,
  f('D', 'INSERT', 'inferred', fx_user, {
    ...enum_of(['ALL', 'MIC1', 'MIC2', 'INST1-L', 'INST1-R', 'INST2-L', 'INST2-R']),
    note: insert_note,
  }),
];

const fx_slot_tfx = [
  ...fx_slot_base,
  f('D', 'INSERT', 'inferred', fx_user, {
    ...enum_of(['ALL', 'TRACK1', 'TRACK2', 'TRACK3', 'TRACK4', 'TRACK5']),
    note: insert_note,
  }),
];

// [pattern on "<parent>/<section>", fields, section note]
export const section_maps = [
  [/^mem\/NAME$/, name_fields],
  [/^mem\/TRACK[1-5]$/, track],
  [/^mem\/TRACK6$/, track, 'The unit has 5 tracks. TRACK6 holds default values in all sample files.'],
  [/^mem\/MASTER$/, master],
  [/^mem\/REC$/, rec],
  [/^mem\/PLAY$/, play],
  [/^mem\/RHYTHM$/, rhythm],
  [/^(mem|sys)\/ICTL[12]_TRACK[1-5]_(FX|TRACK)$/, panel_ctl, 'ICTL1 = PANEL PLAY, ICTL2 = PANEL UNDO (p. 14).'],
  [/^(mem|sys)\/ICTL[123]_PEDAL[1-9]$/, pedal_ctl],
  [/^(mem|sys)\/ECTL_CTL[1-4]$/, ectl_ctl],
  [/^(mem|sys)\/ECTL_EXP[12]$/, ectl_exp],
  [/^mem\/ASSIGN([1-9]|1[0-6])$/, assign],
  [/^(mem|sys)\/INPUT$/, input],
  [/^(mem|sys)\/OUTPUT$/, output],
  [/^(mem|sys)\/ROUTING$/, routing],
  [/^(mem|sys)\/MIXER$/, mixer],
  [/^(mem|sys)\/EQ_\w+$/, eq],
  [/^(mem|sys)\/MASTER_FX$/, master_fx],
  [/^sys\/USB$/, usb],
  [/^sys\/MIDI$/, midi],
  [/^sys\/SETUP$/, setup],
  [/^sys\/PREF$/, pref],
  [/^(ifx|tfx)\/SETUP$/, fx_setup],
  [/^(ifx|tfx)\/[A-D]$/, fx_bank],
  [/^ifx\/[A-D][A-D]$/, fx_slot_ifx],
  [/^tfx\/[A-D][A-D]$/, fx_slot_tfx],
];
