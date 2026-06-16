// Wraps the bits of the S3 SDK we need: uploading invoice PDFs, deleting them,
// and minting short-lived signed view URLs. When AWS credentials are absent
// (typical for local dev), every operation no-ops so the same code path can
// run without S3 wired up.

import "dotenv/config";
import { readFileSync } from "fs";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const region = process.env.AWS_REGION;
const bucket = process.env.AWS_S3_BUCKET;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

const enabled = !!(region && bucket && accessKeyId && secretAccessKey);

const client: S3Client | null = enabled
  ? new S3Client({
      region,
      credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
    })
  : null;

export const isEnabled = () => enabled;
export const bucketName = () => bucket ?? "";

// Uploads a local file to S3 under the given key. Returns the key on success;
// returns null when S3 is not configured.
export const uploadFile = async (
  localPath: string,
  s3Key: string,
  contentType = "application/pdf",
): Promise<string | null> => {
  if (!enabled || !client) return null;
  const body = readFileSync(localPath);
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return s3Key;
};

export const deleteObject = async (s3Key: string): Promise<boolean> => {
  if (!enabled || !client) return false;
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: s3Key }));
  return true;
};

// Returns a presigned URL for GET, valid for `expiresInSeconds`. Returns null
// when S3 is not configured.
export const getSignedViewUrl = async (
  s3Key: string,
  expiresInSeconds = 300,
): Promise<string | null> => {
  if (!enabled || !client) return null;
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: s3Key }),
    { expiresIn: expiresInSeconds },
  );
};
