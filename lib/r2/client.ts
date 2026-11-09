import {
  S3Client,
  PutObjectCommand,
  HeadBucketCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import type { R2Config } from "./config";

export const RUNPOD_OUTPUT_PREFIX = process.env.RUNPOD_OUTPUT_PREFIX ?? "runpod-out";

export function createR2Client(config: R2Config): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export async function putObject(
  client: S3Client,
  bucket: string,
  key: string,
  body: Buffer | Uint8Array,
  contentType = "image/png",
  cacheControl = "public, max-age=3600",
): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: cacheControl,
  });
  await client.send(command);
}

export async function headBucket(client: S3Client, bucket: string): Promise<void> {
  const command = new HeadBucketCommand({ Bucket: bucket });
  await client.send(command);
}

export async function getObjectBuffer(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<Buffer | null> {
  try {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await client.send(command);
    if (!response.Body) return null;
    const bytes = await response.Body.transformToByteArray();
    return Buffer.from(bytes);
  } catch (error: unknown) {
    const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (err?.name === "NoSuchKey" || err?.name === "NotFound" || err?.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw error;
  }
}

export async function deleteObject(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<void> {
  const command = new DeleteObjectCommand({ Bucket: bucket, Key: key });
  await client.send(command);
}

