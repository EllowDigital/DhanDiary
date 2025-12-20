import { getStartDateForFilter, getDaysCountForFilter } from '../src/utils/stats';
import dayjs from 'dayjs';

describe('stats helpers', () => {
  test('7D start and days', () => {
    const now = dayjs('2025-11-30');
    const start = getStartDateForFilter('7D', now);
    expect(start.format('YYYY-MM-DD')).toBe('2025-11-24');
    expect(getDaysCountForFilter('7D', now)).toBe(7);
  });

  test('30D start and days', () => {
    const now = dayjs('2025-11-30');
    const start = getStartDateForFilter('30D', now);
    expect(start.format('YYYY-MM-DD')).toBe('2025-11-01');
    expect(getDaysCountForFilter('30D', now)).toBe(30);
  });

  test('This Month days matches calendar', () => {
    const now = dayjs('2025-11-15');
    const start = getStartDateForFilter('This Month', now);
    expect(start.format('YYYY-MM-DD')).toBe('2025-11-01');
    expect(getDaysCountForFilter('This Month', now)).toBe(15);
  });

  test('This Year covers elapsed days', () => {
    const now = dayjs('2025-08-10');
    const start = getStartDateForFilter('This Year', now);
    expect(start.format('YYYY-MM-DD')).toBe('2025-01-01');
    expect(getDaysCountForFilter('This Year', now)).toBe(222);
  });
});
