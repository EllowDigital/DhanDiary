import {
  isSupportedEmailDomain,
  isValidEmailFormat,
  normalizeEmail,
  suggestEmailDomainTypo,
  validateEmail,
} from '../src/utils/emailValidation';

describe('emailValidation', () => {
  test('normalizeEmail trims, removes spaces, lowercases', () => {
    expect(normalizeEmail('  User@GMail.com  ')).toBe('user@gmail.com');
    expect(normalizeEmail('u s e r @ g m a i l . c o m')).toBe('user@gmail.com');
  });

  test('isValidEmailFormat basic cases', () => {
    expect(isValidEmailFormat('usergmail.com')).toBe(false);
    expect(isValidEmailFormat('user@')).toBe(false);
    expect(isValidEmailFormat('@gmail.com')).toBe(false);
    expect(isValidEmailFormat('user@gmail.com')).toBe(true);
  });

  test('suggestEmailDomainTypo suggests common typos', () => {
    expect(suggestEmailDomainTypo('user@gmal.com')).toBe('user@gmail.com');
    expect(suggestEmailDomainTypo('user@outllok.com')).toBe('user@outlook.com');
    expect(suggestEmailDomainTypo('user@hotmail.com')).toBe(null);
  });

  test('isSupportedEmailDomain blocks obvious placeholders', () => {
    expect(isSupportedEmailDomain('user@example.com')).toBe(false);
    expect(isSupportedEmailDomain('user@localhost')).toBe(false);
    expect(isSupportedEmailDomain('user@gmail.com')).toBe(true);
  });

  test('validateEmail returns reason and suggestion', () => {
    const v1 = validateEmail('usergmail.com');
    expect(v1.isValidFormat).toBe(false);
    expect(v1.reason).toBe('invalid_format');

    const v2 = validateEmail('user@gmal.com');
    expect(v2.suggestion).toBe('user@gmail.com');
  });
});
