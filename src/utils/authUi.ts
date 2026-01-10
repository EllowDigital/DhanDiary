export type AuthField = 'email' | 'password' | 'code' | 'form';

export type AuthUiAction =
  | { type: 'none' }
  | { type: 'go_register' }
  | { type: 'go_login' }
  | { type: 'go_verify_email' };

export type AuthUiFeedback = {
  field?: AuthField;
  message: string;
  action?: AuthUiAction;
};

type ClerkErrorShape = {
  errors?: Array<{ code?: string; message?: string; longMessage?: string } | any>;
  message?: string;
};

const str = (v: any) => String(v ?? '').trim();

export const getClerkPrimaryError = (err: unknown): { code?: string; message: string } => {
  const e = err as ClerkErrorShape;
  const code = e?.errors?.[0]?.code;
  const message =
    str(e?.errors?.[0]?.message) || str(e?.errors?.[0]?.longMessage) || str((e as any)?.message);
  return { code, message: message || 'Something went wrong. Please try again later.' };
};

export const isOAuthCancel = (err: unknown): boolean => {
  const { code, message } = getClerkPrimaryError(err);
  const lower = message.toLowerCase();
  return (
    String(code || '')
      .toLowerCase()
      .includes('cancel') ||
    lower.includes('cancelled') ||
    lower.includes('canceled') ||
    lower.includes('cancel')
  );
};

export const mapLoginErrorToUi = (err: unknown): AuthUiFeedback => {
  const { code, message } = getClerkPrimaryError(err);
  const lower = message.toLowerCase();

  if (
    code === 'form_password_incorrect' ||
    (lower.includes('password') && lower.includes('incorrect'))
  ) {
    return {
      field: 'password',
      message: 'Incorrect password. Please try again.',
      action: { type: 'none' },
    };
  }

  if (code === 'form_identifier_not_found') {
    return {
      field: 'email',
      message: 'Account not found. Please register first.',
      action: { type: 'go_register' },
    };
  }

  // Clerk indicates the user exists but the strategy is wrong (e.g., OAuth-only)
  if (code === 'strategy_for_user_invalid') {
    return {
      field: 'email',
      message:
        'This email is already registered using social login. Please sign in using Google/GitHub.',
      action: { type: 'none' },
    };
  }

  // Best-effort: verification required
  if (lower.includes('verify') || lower.includes('verification') || lower.includes('email code')) {
    return {
      field: 'form',
      message: 'Please verify your email before logging in.',
      action: { type: 'go_verify_email' },
    };
  }

  return {
    field: 'form',
    message: 'Something went wrong. Please try again later.',
    action: { type: 'none' },
  };
};

export const mapRegisterErrorToUi = (
  err: unknown
): { kind: 'already_registered' | 'weak_password' | 'generic'; message: string } => {
  const { code, message } = getClerkPrimaryError(err);
  const lower = message.toLowerCase();

  if (
    code === 'form_identifier_exists' ||
    lower.includes('already exists') ||
    lower.includes('already in use')
  ) {
    const looksLikeSocial =
      lower.includes('oauth') || lower.includes('google') || lower.includes('github');
    return {
      kind: 'already_registered',
      message: looksLikeSocial
        ? 'This email is already registered using social login. Please sign in using Google/GitHub.'
        : 'You are already registered. Please log in.',
    };
  }

  if (
    String(code || '').includes('password') ||
    lower.includes('password') ||
    code === 'form_password_pwned' ||
    code === 'form_password_length_too_short'
  ) {
    return { kind: 'weak_password', message: 'Please choose a stronger password.' };
  }

  return { kind: 'generic', message: 'Something went wrong. Please try again later.' };
};

export const mapSocialLoginErrorToUi = (err: unknown): AuthUiFeedback | null => {
  if (isOAuthCancel(err)) return null;

  const { code, message } = getClerkPrimaryError(err);
  const lower = message.toLowerCase();

  // Common edge: email is already registered with password.
  if ((code && String(code).toLowerCase().includes('oauth')) || lower.includes('oauth')) {
    return {
      field: 'form',
      message:
        'This email is already registered with email and password. Please log in using email.',
      action: { type: 'none' },
    };
  }

  return {
    field: 'form',
    message: 'Something went wrong. Please try again later.',
    action: { type: 'none' },
  };
};

export const mapVerifyErrorToUi = (err: unknown): AuthUiFeedback => {
  const { code, message } = getClerkPrimaryError(err);
  const lower = message.toLowerCase();

  if (code === 'verification_failed') {
    return { field: 'code', message: 'The code you entered is invalid. Please try again.' };
  }

  if (code === 'verification_expired' || lower.includes('expired')) {
    return { field: 'code', message: 'Verification link expired. Please request a new one.' };
  }

  return { field: 'form', message: 'Verification failed. Please try again.' };
};
