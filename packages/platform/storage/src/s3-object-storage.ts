import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type ObjectStorageConfig = Readonly<{
  endpoint: string;
  region: string;
  bucket: string;
  forcePathStyle: boolean;
  accessKeyId: string | null;
  secretAccessKey: string | null;
}>;

export type PresignedUpload = Readonly<{
  url: string;
  objectKey: string;
  requiredHeaders: Readonly<Record<string, string>>;
  expiresAt: Date;
}>;

function sha256HexToBase64(contentHash: string): string {
  const match = /^sha256:([a-f0-9]{64})$/.exec(contentHash);
  if (!match) throw new Error("content hash must be sha256:<64 lowercase hex chars>");
  return Buffer.from(match[1]!, "hex").toString("base64");
}

function buildClientConfig(config: ObjectStorageConfig): S3ClientConfig {
  return {
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    ...(config.accessKeyId && config.secretAccessKey
      ? { credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } }
      : {}),
  };
}

export class S3ObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ObjectStorageConfig) {
    this.client = new S3Client(buildClientConfig(config));
    this.bucket = config.bucket;
  }

  async presignUpload(input: Readonly<{
    objectKey: string;
    contentType: string;
    contentLength: number;
    contentHash: string;
    expiresInSeconds?: number;
  }>): Promise<PresignedUpload> {
    const checksum = sha256HexToBase64(input.contentHash);
    const expiresIn = input.expiresInSeconds ?? 900;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.objectKey,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
      ChecksumSHA256: checksum,
      Metadata: { "content-hash": input.contentHash },
    });
    const url = await getSignedUrl(this.client, command, { expiresIn });
    return Object.freeze({
      url,
      objectKey: input.objectKey,
      requiredHeaders: Object.freeze({
        "content-type": input.contentType,
        "x-amz-checksum-sha256": checksum,
        "x-amz-meta-content-hash": input.contentHash,
      }),
      expiresAt: new Date(Date.now() + expiresIn * 1_000),
    });
  }

  async assertUploadedObject(input: Readonly<{
    objectKey: string;
    contentLength: number;
    contentHash: string;
  }>): Promise<void> {
    const expectedChecksum = sha256HexToBase64(input.contentHash);
    const head = await this.client.send(new HeadObjectCommand({
      Bucket: this.bucket,
      Key: input.objectKey,
      ChecksumMode: "ENABLED",
    }));
    if (head.ContentLength !== input.contentLength) throw new Error("uploaded artifact length does not match upload intent");
    if (head.Metadata?.["content-hash"] !== input.contentHash) throw new Error("uploaded artifact metadata hash does not match upload intent");
    if (head.ChecksumSHA256 && head.ChecksumSHA256 !== expectedChecksum) throw new Error("uploaded artifact checksum does not match upload intent");
  }

  async downloadToFile(objectKey: string, target: string, maxBytes: number): Promise<void> {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }));
    const declaredLength = response.ContentLength;
    if (declaredLength !== undefined && declaredLength > maxBytes) throw new Error("artifact exceeds workspace limit");
    if (!response.Body) throw new Error("object storage returned an empty body");
    const bytes = await response.Body.transformToByteArray();
    if (bytes.byteLength > maxBytes) throw new Error("artifact exceeds workspace limit");
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes, { mode: 0o600 });
  }

  destroy(): void {
    this.client.destroy();
  }
}
