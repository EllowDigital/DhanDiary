export type EmailValidationResult = {
  normalized: string;
  isValidFormat: boolean;
  isSupportedDomain: boolean;
  suggestion?: string | null;
  reason?: 'invalid_format' | 'unsupported_domain' | null;
};

const COMMON_DOMAIN_TYPOS: Record<string, string> = {
  'gmal.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'outllok.com': 'outlook.com',
  'outlok.com': 'outlook.com',
  'hotmial.com': 'hotmail.com',
  'hotmal.com': 'hotmail.com',
  'yaho.com': 'yahoo.com',
};

const UNSUPPORTED_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'test.com',
  'test.local',
  'localhost',
  'local',
  'invalid',
  'invalid.local',
]);

export const normalizeEmail = (raw: string): string => {
  // Spec: trim spaces + lowercase silently.
  // Also strip internal whitespace which is never valid in emails and commonly comes from copy/paste.
  return String(raw || '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
};

export const isValidEmailFormat = (email: string): boolean => {
  const v = normalizeEmail(email);
  // Practical email validation (not RFC-perfect; good UX).
  // - one @
  // - non-empty local and domain
  // - domain contains a dot and valid TLD-ish part
  if (!v.includes('@')) return false;
  const [local, domain, ...rest] = v.split('@');
  if (rest.length > 0) return false;
  if (!local || !domain) return false;
  if (local.length > 64) return false;
  if (domain.length > 255) return false;
  if (domain.startsWith('.') || domain.endsWith('.')) return false;
  if (!domain.includes('.')) return false;
  if (domain.includes('..')) return false;
  // Simple allowed charset checks
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return false;
  if (!/^[a-z0-9.-]+$/.test(domain)) return false;
  const tld = domain.split('.').pop() || '';
  if (tld.length < 2) return false;
  return true;
};

export const suggestEmailDomainTypo = (email: string): string | null => {
  const v = normalizeEmail(email);
  if (!v.includes('@')) return null;
  const [local, domain] = v.split('@');
  if (!local || !domain) return null;

  const correctedDomain = COMMON_DOMAIN_TYPOS[domain];
  if (!correctedDomain) return null;

  const suggestion = `${local}@${correctedDomain}`;
  return suggestion !== v ? suggestion : null;
};

export const isSupportedEmailDomain = (email: string): boolean => {
  const v = normalizeEmail(email);
  if (!v.includes('@')) return false;
  const domain = v.split('@')[1] || '';
  if (!domain) return false;

  if (UNSUPPORTED_DOMAINS.has(domain)) return false;
  if (domain.endsWith('.invalid')) return false;

  // Avoid obviously non-resolvable strings (still heuristic; no DNS checks on device)
  const parts = domain.split('.');
  if (parts.some((p) => !p || p.length > 63)) return false;

  return true;
};

export const validateEmail = (rawEmail: string): EmailValidationResult => {
  const normalized = normalizeEmail(rawEmail);

  if (!normalized) {
    return {
      normalized,
      isValidFormat: false,
      isSupportedDomain: true,
      suggestion: null,
      reason: 'invalid_format',
    };
  }

  const suggestion = suggestEmailDomainTypo(normalized);
  const isValidFormat = isValidEmailFormat(normalized);
  const isSupportedDomain = isSupportedEmailDomain(normalized);

  return {
    normalized,
    isValidFormat,
    isSupportedDomain,
    suggestion,
    reason: !isValidFormat ? 'invalid_format' : !isSupportedDomain ? 'unsupported_domain' : null,
  };
};
