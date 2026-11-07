import { z } from "zod";

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
  keyPrefix: string;
}

const REQUIRED_VARS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_BASE_URL",
] as const;

export function getR2Status(): { configured: boolean; missing: string[] } {
  const missing = REQUIRED_VARS.filter((key) => {
    const val = process.env[key];
    return !val || !val.trim();
  });
  return {
    configured: missing.length === 0,
    missing: [...missing],
  };
}

const r2EnvSchema = z.object({
  R2_ACCOUNT_ID: z.string().trim().min(1, "Thiếu R2_ACCOUNT_ID"),
  R2_ACCESS_KEY_ID: z.string().trim().min(1, "Thiếu R2_ACCESS_KEY_ID"),
  R2_SECRET_ACCESS_KEY: z.string().trim().min(1, "Thiếu R2_SECRET_ACCESS_KEY"),
  R2_BUCKET: z.string().trim().min(1, "Thiếu R2_BUCKET"),
  R2_PUBLIC_BASE_URL: z.string().trim().min(1, "Thiếu R2_PUBLIC_BASE_URL"),
  R2_KEY_PREFIX: z.string().trim().default("calendars/anima"),
});

export function readR2Config(): R2Config {
  const status = getR2Status();
  if (!status.configured) {
    throw new Error(`Thiếu biến môi trường R2: ${status.missing.join(", ")}`);
  }

  const parsed = r2EnvSchema.parse(process.env);
  return {
    accountId: parsed.R2_ACCOUNT_ID,
    accessKeyId: parsed.R2_ACCESS_KEY_ID,
    secretAccessKey: parsed.R2_SECRET_ACCESS_KEY,
    bucket: parsed.R2_BUCKET,
    publicBaseUrl: parsed.R2_PUBLIC_BASE_URL,
    keyPrefix: parsed.R2_KEY_PREFIX || "calendars/anima",
  };
}
