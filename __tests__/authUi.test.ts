import {
  getClerkPrimaryError,
  isOAuthCancel,
  mapLoginErrorToUi,
  mapRegisterErrorToUi,
  mapSocialLoginErrorToUi,
  mapVerifyErrorToUi,
} from '../src/utils/authUi';

describe('authUi', () => {
  test('getClerkPrimaryError picks first error', () => {
    expect(getClerkPrimaryError({ errors: [{ code: 'x', message: 'Hello' }] })).toMatchObject({
      code: 'x',
      message: 'Hello',
    });
  });

  test('mapLoginErrorToUi incorrect password', () => {
    const ui = mapLoginErrorToUi({ errors: [{ code: 'form_password_incorrect', message: 'bad' }] });
    expect(ui.field).toBe('password');
  });

  test('mapLoginErrorToUi not found -> go_register', () => {
    const ui = mapLoginErrorToUi({
      errors: [{ code: 'form_identifier_not_found', message: 'nope' }],
    });
    expect(ui.action?.type).toBe('go_register');
  });

  test('mapRegisterErrorToUi already exists social', () => {
    const ui = mapRegisterErrorToUi({
      errors: [{ code: 'form_identifier_exists', message: 'OAuth already exists' }],
    });
    expect(ui.kind).toBe('already_registered');
  });

  test('isOAuthCancel detects cancel wording', () => {
    expect(isOAuthCancel({ message: 'User cancelled' })).toBe(true);
  });

  test('mapSocialLoginErrorToUi returns null on cancel', () => {
    expect(mapSocialLoginErrorToUi({ message: 'cancelled' })).toBe(null);
  });

  test('mapVerifyErrorToUi expired', () => {
    const ui = mapVerifyErrorToUi({
      errors: [{ code: 'verification_expired', message: 'expired' }],
    });
    expect(ui.field).toBe('code');
  });
});
