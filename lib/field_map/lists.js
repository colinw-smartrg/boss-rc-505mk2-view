// Value lists from the RC-505mk2 Parameter Guide (eng02). The position in a
// list is the stored integer only where lib/field_map/*.js says so.

export const guide_url = 'https://static.roland.com/assets/media/pdf/RC-505mk2_Parameter_eng02_W.pdf';

export const freq_list = [
  '20.0 Hz', '25.0 Hz', '31.5 Hz', '40.0 Hz', '50.0 Hz', '63.0 Hz', '80.0 Hz',
  '100 Hz', '125 Hz', '160 Hz', '200 Hz', '250 Hz', '315 Hz', '400 Hz', '500 Hz',
  '630 Hz', '800 Hz', '1.00 kHz', '1.25 kHz', '1.60 kHz', '2.00 kHz', '2.50 kHz',
  '3.15 kHz', '4.00 kHz', '5.00 kHz', '6.30 kHz', '8.00 kHz', '10.0 kHz', '12.5 kHz',
];

export const eq_freq_list = freq_list.slice(0, freq_list.indexOf('10.0 kHz') + 1);
export const eq_lo_cut_list = ['FLAT', ...freq_list.slice(0, freq_list.indexOf('800 Hz') + 1)];
export const eq_hi_cut_list = [...freq_list.slice(freq_list.indexOf('630 Hz')), 'FLAT'];
export const eq_q_list = ['0.5', '1', '2', '4', '8', '16'];

export const input_bits = ['MIC1', 'MIC2', 'INST1-L', 'INST1-R', 'INST2-L', 'INST2-R', 'RHYTHM'];
export const track_bits = ['TRACK1', 'TRACK2', 'TRACK3', 'TRACK4', 'TRACK5', 'bit 6'];
export const track_list = ['TRACK1', 'TRACK2', 'TRACK3', 'TRACK4', 'TRACK5'];

export const genre_list = [
  'ACOUSTIC', 'BALLAD', 'BLUES', 'JAZZ', 'FUSION', 'R&B', 'SOUL', 'FUNK', 'POP',
  'SOFT ROCK', 'ROCK', 'ALT ROCK', 'PUNK', 'HEAVY ROCK', 'METAL', 'TRAD', 'WORLD',
  'BALLRM', 'ELCTRO', 'GUIDE', 'USER',
];

export const kit_list = [
  'STUDIO', 'LIVE', 'LIGHT', 'HEAVY', 'ROCK', 'METAL', 'JAZZ', 'BRUSH', 'CAJON',
  'DRUM&BASS', 'R&B', 'DANCE', 'TECHNO', 'DANCE BEATS', 'HIPHOP', '808+909',
];

export const beat_list = [
  '2/4', '3/4', '4/4', '5/4', '6/4', '7/4',
  '5/8', '6/8', '7/8', '8/8', '9/8', '10/8', '11/8', '12/8', '13/8', '14/8', '15/8',
];

// p. 14: the functions that repeat for each of tracks 1-5.
const panel_track_funcs = [
  'CLEAR', 'REVERSE', 'UNDO/REDO', 'MARK BACK1', 'MARK BACK2', 'REC BACK',
  'MARK SET1', 'MARK SET2', 'MARK CLEAR', 'HALF SPEED', 'HALF SPEED (MOMENT)',
  'DOUBLE SPEED', 'DOUBLE SPEED (MOMENT)', 'TRACK EDIT', 'TRACK FX',
];

function per_track(prefix_fn, funcs) {
  const out = [];
  for (let t = 1; t <= 5; t++)
    for (const f of funcs)
      out.push(`${prefix_fn(t)} ${f}`);
  return out;
}

// pp. 14-16, PANEL PLAY and PANEL UNDO. The entries run track by track;
// the stored defaults TRACK1 TRACK=14, TRACK1 FX=15 and TRACK2 FX=30 fit
// only that order.
export const panel_func_list = [
  'OFF',
  ...per_track(t => `TRK${t}`, panel_track_funcs),
  ...panel_track_funcs.map(f => `CUR.TRK ${f}`),
  'CUR.TRK INC', 'CUR.TRK DEC',
  'TEMPO UP', 'TEMPO DOWN', 'INPUT FX ON/OFF', 'TRACK FX ON/OFF',
  'MIC IN MUTE', 'MIC1 IN MUTE', 'MIC2 IN MUTE', 'LED',
];

const ctl_track_funcs = [
  'REC/PLAY1', 'REC/PLAY2', 'REC/PLAY3', 'REC/PLAY4', 'MOMENT PLAY',
  'PLAY/STOP1', 'PLAY/STOP2', 'STOP1', 'STOP2', 'STOP3', 'STOP4', 'STOP5',
  ...panel_track_funcs,
];

// pp. 17-21, CTL1-4. TAP TEMPO at 170 and RHYTHM START/STOP at 185 (the
// stored values of CTL3 and CTL4) fit only if INPUT FX A-D and TRACK FX
// A-D are four entries each.
export const ctl_func_list = [
  'OFF',
  ...per_track(t => `TRK${t}`, ctl_track_funcs),
  ...ctl_track_funcs.map(f => `CUR.TRK ${f}`),
  'CUR.TRK INC', 'CUR.TRK DEC', 'CUR.TRK NUM',
  'ALL START/STOP1', 'ALL START/STOP2', 'ALL START/STOP3', 'ALL CLEAR',
  'TAP TEMPO', 'TEMPO UP', 'TEMPO DOWN',
  'INPUT FX', 'INPUT FX A', 'INPUT FX B', 'INPUT FX C', 'INPUT FX D', 'INPUT FX CUR',
  'TRACK FX', 'TRACK FX A', 'TRACK FX B', 'TRACK FX C', 'TRACK FX D', 'TRACK FX CUR',
  'RHYTHM START/STOP', 'RHYTHM START', 'RHYTHM STOP',
  'MEMORY INC', 'MEMORY DEC', 'MEMORY WRITE',
  'MIC IN MUTE', 'MIC1 IN MUTE', 'MIC2 IN MUTE',
];

// p. 22, EXP1/2 FUNC. The track-by-track order of LEVEL1/LEVEL2 is taken
// from the CTL lists; the stored defaults (19, 24) do not test it.
export const exp_func_list = [
  'OFF',
  ...per_track(t => `TRK${t}`, ['LEVEL1', 'LEVEL2']),
  'CUR.TRK LEVEL1', 'CUR.TRK LEVEL2', 'TEMPO UP', 'TEMPO DOWN',
  'IN FX A CTL', 'IN FX B CTL', 'IN FX C CTL', 'IN FX D CTL', 'IN FX CUR CTL',
  'TR FX A CTL', 'TR FX B CTL', 'TR FX C CTL', 'TR FX D CTL', 'TR FX CUR CTL',
  'RHYTHM LEVEL1', 'RHYTHM LEVEL2',
];

function per_func(funcs, prefix_fn) {
  const out = [];
  for (const f of funcs)
    for (let t = 1; t <= 5; t++)
      out.push(`${prefix_fn(t)} ${f}`);
  return out;
}

export function pan_list() {
  const out = [];
  for (let n = 0; n <= 100; n++)
    out.push(n < 50 ? `L${50 - n}` : n > 50 ? `R${n - 50}` : 'CENTER');
  return out;
}

export function numbered(prefix, count) {
  return Array.from({ length: count }, (_, i) => `${prefix} ${i + 1}`);
}

// p. 23, ASSIGN SOURCE, in guide order. Unlike TARGET, each per-track
// row runs through TRK1-5 before the next row starts (TRK2 REC/DB = 1,
// TRK2 TR (PLY) = 17; user, from the unit). CTL1, CTL2, CTL3 and CTL4 are
// taken as four entries, which is not confirmed.
export const assign_source_list = [
  ...per_func(['REC/DB', 'PLY/STP'], t => `TRK${t}`),
  'SYNC ST/STP',
  ...per_func(['FX (PLY)', 'TR (PLY)', 'FX (UND)', 'TR (UND)'], t => `TRK${t}`),
  'IN FX KNOB', 'TR FX KNOB', 'CTL1', 'CTL2', 'CTL3', 'CTL4', 'EXP1', 'EXP2',
  ...Array.from({ length: 31 }, (_, i) => `MIDI CC#${String(i + 1).padStart(2, '0')}`),
  ...Array.from({ length: 32 }, (_, i) => `MIDI CC#${i + 64}`),
];

const fx_assign_funcs = [
  '', ' CTL', ' TYPE', ' TYP INC', ' TYP DEC', ' SW MODE',
  ' PRM1', ' PRM2', ' PRM3', ' PRM4', ' SEQ', ' S.SYNC', ' S.RTRIG', ' S.RATE', ' S.MAX',
];

function fx_assign_block(prefix) {
  const out = [];
  for (const slot of ['A', 'B', 'C', 'D'])
    out.push(...fx_assign_funcs.map(f => `${prefix} ${slot}${f}`));
  for (const bank of ['A', 'B', 'C', 'D'])
    for (const slot of ['A', 'B', 'C', 'D'])
      out.push(...fx_assign_funcs.map(f => `${prefix} ${bank}${slot}${f}`));
  out.push(...fx_assign_funcs.map(f => `${prefix} CR${f}`));
  return out;
}

// pp. 23-27, ASSIGN TARGET, in guide order, track by track and slot by
// slot. The sample assigns confirm the order up to RHYTHM ST/STP (714).
// From the unit (user): MIDI CC#0-127 are all valid and sit at 790-917,
// INPUT THRU (Ver. 1.1) is stored after them at 918, and 919 is
// IMM ST/STOP ALL, which the guide does not list.
export const assign_target_list = [
  ...per_track(t => `TRK${t}`, ['REC/PLY', 'PLY/STP', 'STOP', 'CLEAR', 'REVERSE', 'UN/RED',
    'M.BACK', 'R.BACK', 'M.SET', 'M.CLEAR', 'LEVEL']),
  ...['REC/PLY', 'PLY/STP', 'STOP', 'CLEAR', 'REVERSE', 'UN/RED', 'M.BACK', 'R.BACK',
    'M.SET', 'M.CLEAR', 'LEVEL', 'INC', 'DEC', 'NUM'].map(f => `CUR.TRK ${f}`),
  'ALL ST/STP', 'TAP TEMPO', 'TEMPO', 'INPUT FX',
  'IN FX TGT INC', 'IN FX TGT DEC', 'IN FX BNK INC', 'IN FX BNK DEC', 'IN FX SW MODE',
  ...fx_assign_block('IN FX'),
  'TRK FX', 'TRK FX TGT INC', 'TRK FX TGT DEC', 'TRK FX BNK INC', 'TRK FX BNK DEC', 'TRK FX SW MODE',
  ...fx_assign_block('T FX'),
  'RHYTHM ST/STP', 'RHYTHM START', 'RHYTHM STOP', 'RHYTHM LEVEL',
  'MIC IN MUTE', 'MIC1 IN MUTE', 'MIC2 IN MUTE',
  ...per_track(t => `TRK${t}`, ['FADER', '1SHOT', 'PAN', 'FX', 'SPEED', 'BNC IN']),
  'DUB MODE', 'AUTO REC', 'BOUNCE', 'RHYTHM VARI', 'RHYTHM KIT',
  'MIC1 LEVEL', 'MIC2 LEVEL', 'INST1-L LEVEL', 'INST1-R LEVEL', 'INST1-L MUTE', 'INST1-R MUTE',
  'INST2-L LEVEL', 'INST2-R LEVEL', 'INST2-L MUTE', 'INST2-R MUTE',
  'LOOP LEVEL', 'MAIN-L LEVEL', 'MAIN-R LEVEL', 'SUB1-L LEVEL', 'SUB1-R LEVEL',
  'SUB2-L LEVEL', 'SUB2-R LEVEL', 'PHONES LEVEL', 'MASTER LEVEL',
  'INST1 GAIN', 'INST2 GAIN', 'EQ MIC1', 'EQ MIC2', 'EQ INST1-L', 'EQ INST1-R', 'EQ INST2-L', 'EQ INST2-R',
  'EQ MAIN-L', 'EQ MAIN-R', 'EQ SUB1-L', 'EQ SUB1-R', 'EQ SUB2-L', 'EQ SUB2-R', 'PANEL MODE',
  ...Array.from({ length: 128 }, (_, i) => `MIDI CC#${String(i).padStart(2, '0')}`),
  'INPUT THRU', 'IMM ST/STOP ALL',
];
