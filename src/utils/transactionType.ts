export function isIncome(type: string | null | undefined) {
  if (!type) return false;
  const t = String(type).toLowerCase();
  return t === 'in' || t === 'income';
}

export function isExpense(type: string | null | undefined) {
  if (!type) return false;
  const t = String(type).toLowerCase();
  return t === 'out' || t === 'expense';
}

export function toCanonical(type: string | null | undefined) {
  return isIncome(type) ? 'income' : 'expense';
}
