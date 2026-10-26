/**
 * Prisma BigInt fields (job.seed) don't survive JSON.stringify, which
 * NextResponse.json relies on. This recursively converts any BigInt to a
 * plain number before a Prisma row/array is sent to the client.
 */
export function serializeBigInts<T>(value: T): T {
  if (typeof value === "bigint") {
    return Number(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeBigInts(item)) as unknown as T;
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = serializeBigInts(val);
    }
    return result as unknown as T;
  }
  return value;
}
