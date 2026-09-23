// Corrections to the data imported from rc505mk2-mcp (lib/field_map/fx.js).
// Each entry replaces the named keys of the imported parameter and says
// why. Evidence comes from the Parameter Guide (pp. 33-42) and from the
// values that most FX slots in the sample data hold (factory values).

import { numbered } from './lists.js';

const rate_prefix = ['4MEAS', '2MEAS', '1MEAS', ...numbered('NOTE', 11)];

const rate_fix = {
  display: { prefix: rate_prefix, offset: -14 },
  min: 0, max: 114,
  status: 'inferred',
  source: 'p. 33; sample data',
  note: 'TREMOLO RATE 99, VIBRATO RATE 64 and CHORUS RATE 64 in the sample data decode to the guide defaults 85, 50 and 50 with offset 14. rc505mk2-mcp shows the raw value. No source names the 11 note values.',
};

// Keyed by the name of the rc505mk2-mcp forward transform.
export const fx_transform_fixes = {
  rateValue: rate_fix,
  seqRate: {
    ...rate_fix,
    note: 'Assumed to use the RATE encoding (0-2 = 4MEAS-1MEAS, 3-13 = notes, then value + 14). Not confirmed.',
  },
  stepRateValue: {
    display: { prefix: ['OFF', ...rate_prefix], offset: -15 },
    min: 0, max: 115,
    status: 'inferred',
    source: 'p. 33',
    note: 'The guide lists OFF before the RATE values. 0 (OFF, the default) in the sample data; the offset is not confirmed.',
  },
  delayTime: {
    display: { prefix: numbered('NOTE', 12), offset: -11, unit: ' ms' },
    min: 0, max: 2011,
    status: 'inferred',
    source: 'p. 39; sample data',
    note: '211 in 3133 of 3168 DELAY slots and in all TAPE ECHO slots, and the guide default is 200 ms, so 1 ms = 12. rc505mk2-mcp decodes 211 as 201 ms. The count of note values is not confirmed.',
  },
  feedback16: {
    display: null,
    min: undefined, max: undefined,
    status: 'unknown',
    note: 'The sample data holds 20 and 30, outside the guide range 1-16. The encoding is not known, so the raw value is shown.',
  },
};

const v11_note = 'Ver. 1.1 parameters are stored after the others (the EQ FREQ and Q values in the sample data confirm this for EQ).';

// Keyed by FX section name, then by tag.
export const fx_param_fixes = {
  VOCODER: {
    E: {
      name: 'BALANCE', display: { prefix: [] }, min: 0, max: 100, status: 'inferred', source: 'p. 36; sample data',
      note: `rc505mk2-mcp puts CARRIER THRU here. The data holds 50 (the BALANCE default). ${v11_note}`,
    },
    F: {
      name: 'CARRIER THRU', display: { prefix: ['OFF', 'ON'] }, min: 0, max: 1, status: 'inferred', source: 'p. 36; sample data',
      note: `rc505mk2-mcp puts BALANCE here. The data holds 1 (the CARRIER THRU default ON). ${v11_note}`,
    },
  },
  LOFI: {
    A: {
      min: 0, max: 31,
      note: 'rc505mk2-mcp gives the range 0-1. Its decode (0 = OFF, else 32 - n) turns the stored 24 into 8, the guide default, so the range is 0-31.',
    },
  },
  EQ: {
    E: { note: 'The sample data holds 20. The guide gives LEVEL 0-50-100, so the encoding is not confirmed.' },
  },
  PATTERN_SLICER: {
    F: { note: 'The guide (p. 39) does not list this parameter.' },
    G: { note: 'The guide (p. 39) does not list this parameter.' },
  },
  STEP_SLICER: {
    9: { note: 'The guide (p. 39) does not list this parameter.' },
    '#': { note: 'The guide (p. 39) does not list this parameter.' },
  },
};
