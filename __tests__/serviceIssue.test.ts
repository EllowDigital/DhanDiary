import { isLikelyServiceDownError } from '../src/utils/serviceIssue';

describe('serviceIssue', () => {
  test('detects common transient/server-down messages', () => {
    expect(isLikelyServiceDownError(new Error('Request timed out after 8000ms'))).toBe(true);
    expect(isLikelyServiceDownError('503 Service Unavailable')).toBe(true);
    expect(isLikelyServiceDownError({ message: 'Bad Gateway 502' })).toBe(true);
  });

  test('returns false for non-service errors', () => {
    expect(isLikelyServiceDownError({ message: 'Password is incorrect' })).toBe(false);
    expect(isLikelyServiceDownError({ errors: [{ message: 'Invalid code' }] })).toBe(false);
  });
});
