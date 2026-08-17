import { describe, expect, it } from 'vitest';
import { isSafeMirrorDestination } from '../scripts/verify-local-mirror.mjs';

describe('local-drive mirror verifier', () => {
  it('rejects a mirror destination that would write into the source workspace', () => {
    expect(isSafeMirrorDestination('C:/repo', 'C:/repo')).toBe(false);
    expect(isSafeMirrorDestination('C:/repo', 'C:/repo/.verify')).toBe(false);
    expect(isSafeMirrorDestination('C:/repo', 'C:/verify/portfolio')).toBe(true);
  });
});
