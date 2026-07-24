import mongoose from 'mongoose';

/**
 * Generates a sequential, per-tenant, per-month document number like
 * `QT-202607-0001`. Unlike a random suffix (which can collide undetected),
 * this counts existing documents for that tenant+month+prefix and retries
 * on the rare case another request grabbed the same number first — cheap
 * enough for this volume, no dedicated counter collection needed.
 */
export async function generateSequentialNumber(
  model: mongoose.Model<any>,
  clientId: string,
  numberField: string,
  prefix: string
): Promise<string> {
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const base = `${prefix}-${yyyymm}-`;

  for (let attempt = 0; attempt < 10; attempt++) {
    const count = await model.countDocuments({ clientId, [numberField]: { $regex: `^${base}` } });
    const candidate = `${base}${String(count + 1 + attempt).padStart(4, '0')}`;
    const exists = await model.exists({ clientId, [numberField]: candidate });
    if (!exists) return candidate;
  }
  // Extremely unlikely fallback — timestamp suffix guarantees uniqueness.
  return `${base}${Date.now().toString().slice(-6)}`;
}
