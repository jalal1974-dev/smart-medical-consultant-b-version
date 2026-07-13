// S3-compatible object storage (Cloudflare R2, AWS S3, MinIO, ...).
// Replaces the Manus storage proxy used by the original template.
//
// Required env vars:
//   STORAGE_ENDPOINT           e.g. https://<accountid>.r2.cloudflarestorage.com
//   STORAGE_BUCKET             bucket name
//   STORAGE_ACCESS_KEY_ID      access key
//   STORAGE_SECRET_ACCESS_KEY  secret key
// Optional:
//   STORAGE_REGION             default "auto" (works for R2)
//   STORAGE_PUBLIC_URL         public base URL for objects (R2 public bucket
//                              domain like https://pub-xxxx.r2.dev or a custom
//                              domain). If unset, storageGet falls back to a
//                              7-day presigned URL.

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type StorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl?: string;
};

let cachedClient: S3Client | null = null;
let cachedConfig: StorageConfig | null = null;

function getStorageConfig(): StorageConfig {
  if (cachedConfig) return cachedConfig;

  const endpoint = process.env.STORAGE_ENDPOINT ?? "";
  const bucket = process.env.STORAGE_BUCKET ?? "";
  const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID ?? "";
  const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY ?? "";

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Storage not configured: set STORAGE_ENDPOINT, STORAGE_BUCKET, " +
        "STORAGE_ACCESS_KEY_ID and STORAGE_SECRET_ACCESS_KEY " +
        "(see docs/DEPLOY-WITHOUT-MANUS.md)"
    );
  }

  cachedConfig = {
    endpoint,
    region: process.env.STORAGE_REGION || "auto",
    bucket,
    accessKeyId,
    secretAccessKey,
    publicUrl: (process.env.STORAGE_PUBLIC_URL || "").replace(/\/+$/, "") || undefined,
  };
  return cachedConfig;
}

function getClient(): S3Client {
  if (cachedClient) return cachedClient;
  const cfg = getStorageConfig();
  cachedClient = new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
  return cachedClient;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

async function resolveUrl(key: string): Promise<string> {
  const cfg = getStorageConfig();
  if (cfg.publicUrl) {
    return `${cfg.publicUrl}/${key}`;
  }
  // No public domain configured — fall back to a presigned URL (7 days max).
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: cfg.bucket, Key: key }),
    { expiresIn: 7 * 24 * 60 * 60 }
  );
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const cfg = getStorageConfig();
  const key = normalizeKey(relKey);
  const body = typeof data === "string" ? Buffer.from(data) : data;

  await getClient().send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  return { key, url: await resolveUrl(key) };
}

export async function storageGet(
  relKey: string
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: await resolveUrl(key) };
}
