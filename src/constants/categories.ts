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

// Map categories to Material icon names used across the app.
export const getIconForCategory = (cat?: string | null): string => {
  const normalized = (cat || 'other').trim().toLowerCase();
  const map: Record<string, string> = {
    food: 'restaurant',
    transport: 'directions-car',
    bills: 'receipt-long',
    salary: 'attach-money',
    shopping: 'shopping-bag',
    health: 'medical-services',
    education: 'school',
    entertainment: 'movie',
    groceries: 'shopping-cart',
    fuel: 'local-gas-station',
    rent: 'home',
    utilities: 'lightbulb',
    other: 'category',
  };
  return map[normalized] || 'category';
};
