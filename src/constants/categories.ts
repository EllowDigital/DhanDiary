export const ALLOWED_CATEGORIES = [
  'Food',
  'Transport',
  'Bills',
  'Salary',
  'Shopping',
  'Health',
  'Other',
] as const;

export type Category = (typeof ALLOWED_CATEGORIES)[number];

export const DEFAULT_CATEGORY: Category = 'Food';
export const FALLBACK_CATEGORY: Category = 'Other';

const lookup = new Map<string, Category>(
  ALLOWED_CATEGORIES.map((cat) => [cat.toLowerCase(), cat] as [string, Category])
);

export const ensureCategory = (value?: string | null): Category => {
  if (!value) return FALLBACK_CATEGORY;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return FALLBACK_CATEGORY;
  return lookup.get(normalized) ?? FALLBACK_CATEGORY;
};
