import { describe, expect, test } from 'bun:test';
import { composeAddress } from '../../src/web/lib/address.js';
import { canonicalSuffix, validateNameParts } from '../../src/web/lib/names.js';
import { nameParts, addressLine } from '../../src/server/lib/validate.js';

const name = { first: 'Ana', middle: '', last: 'Reyes', suffix: '' };
describe('account address and typed suffix contract', () => {
  test('numberless addresses and legacy free text survive composition', () => {
    for (const street of ['J.P. Rizal Street', 'Unit 4B, 12 J.P. Rizal Street', 'Block 2 Lot 5, Alley near the plaza']) {
      expect(composeAddress('', street)).toBe(street);
      expect(addressLine.safeParse(composeAddress('', street)).success).toBe(true);
    }
    expect(composeAddress(' 12B ', ' J.P. Rizal Street ')).toBe('12B J.P. Rizal Street');
    expect(addressLine.safeParse(composeAddress('12', 'x'.repeat(198))).success).toBe(false);
  });
  test('typed suggestions canonicalize only to database-supported values', () => {
    for (const [typed, expected] of [['jr', 'Jr.'], [' JR. ', 'Jr.'], ['sr', 'Sr.'], ['ii', 'II'], ['iii', 'III'], ['iv', 'IV'], ['v', 'V'], ['', '']]) {
      const suffix = canonicalSuffix(typed);
      expect(suffix).toBe(expected);
      expect(validateNameParts({ ...name, suffix: typed })).toEqual({});
      expect(nameParts.suffix.safeParse(suffix || undefined).success).toBe(true);
    }
    for (const suffix of ['Esq.', 'VI', 'Junior', 'J.R.', 'I']) {
      expect(validateNameParts({ ...name, suffix }).suffix).toBeDefined();
      expect(nameParts.suffix.safeParse(canonicalSuffix(suffix)).success).toBe(false);
    }
  });
});
