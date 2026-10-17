import { describe, expect, it } from 'vitest';
import { whoDid } from './people';

const people = [
  { id: '1', name: 'Jo' },
  { id: '2', name: 'Kim' },
];

describe('who did it', () => {
  it('names the other person, says "you" for yourself', () => {
    expect(whoDid('2', people, '1')).toBe('Kim');
    expect(whoDid('1', people, '1')).toBe('you');
  });

  it('says nothing with one person, an unknown person, or no stamp', () => {
    expect(whoDid('1', [people[0]], '1')).toBeNull();
    expect(whoDid('9', people, '1')).toBeNull();
    expect(whoDid(undefined, people, '1')).toBeNull();
    expect(whoDid('2', undefined, '1')).toBeNull();
  });
});
