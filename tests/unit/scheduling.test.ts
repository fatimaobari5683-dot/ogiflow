import { describe, it, expect } from 'vitest';
import { formatScheduledWindow } from '@/shared/utils/scheduling';

describe('formatScheduledWindow', () => {
  it('formate un créneau avec heure de début et de fin', () => {
    const start = new Date('2026-08-24T14:00:00');
    expect(formatScheduledWindow(start, 120)).toBe('24 août, 14:00 – 16:00');
  });

  it('sans durée, affiche seulement l\'heure de début', () => {
    const start = new Date('2026-08-24T14:00:00');
    expect(formatScheduledWindow(start, null)).toBe('24 août, 14:00');
  });
});
