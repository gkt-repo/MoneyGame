// Validate at the boundary, compare in paise, and never accept NaN/Infinity or
// silently truncate malformed strings such as "100xyz".
export function money(value: unknown, minimum = 0.01): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > 10000000) {
    throw new Error(`Amount must be between ₹${minimum} and ₹10000000`);
  }
  const paise = Math.round(value * 100);
  if (Math.abs(value * 100 - paise) > 0.000001) {
    throw new Error('Amount must have at most two decimal places');
  }
  return paise / 100;
}

export const toPaise = (value: number) => Math.round(value * 100);

export function bankReference(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(value.trim())) {
    throw new Error('A valid bank UTR/reference (8–64 letters, digits, underscores or hyphens) is required');
  }
  return value.trim().toUpperCase();
}
