import {
  S3Client,
  PutObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import type { R2Config } from "./config";

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
