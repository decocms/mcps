import type { ExtendedObjectStorage } from "../interface.ts";
import type { S3Config } from "../types.ts";
export function createS3Client(config: S3Config): any {
  try {
    const { S3Client } = require("@aws-sdk/client-s3");

    const clientConfig: any = {
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    };

    if (config.endpoint) {
      clientConfig.endpoint = config.endpoint;
      clientConfig.forcePathStyle = config.forcePathStyle ?? true;
    }

    return new S3Client(clientConfig);
  } catch {
    throw new Error(
      "S3StorageAdapter requires @aws-sdk/client-s3. Install it with: npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner",
    );
  }
}
export class S3StorageAdapter implements ExtendedObjectStorage {
  private s3Client: any;
  private bucketName: string;

  constructor(configOrClient: S3Config | any, bucketName?: string) {
    if (bucketName) {
      this.s3Client = configOrClient;
      this.bucketName = bucketName;
    } else {
      const config = configOrClient as S3Config;
      this.s3Client = createS3Client(config);
      this.bucketName = config.bucketName;
    }
  }

  async getReadUrl(path: string, expiresIn: number): Promise<string> {
    const { GetObjectCommand } = require("@aws-sdk/client-s3");
    const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: path,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  async getWriteUrl(
    path: string,
    options: {
      contentType?: string;
      metadata?: Record<string, string>;
      expiresIn: number;
    },
  ): Promise<string> {
    const { PutObjectCommand } = require("@aws-sdk/client-s3");
    const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: path,
      ContentType: options.contentType,
      Metadata: options.metadata,
    });

    return getSignedUrl(this.s3Client, command, {
      expiresIn: options.expiresIn,
    });
  }

  async listObjects(options: {
    prefix?: string;
    maxKeys?: number;
    continuationToken?: string;
  }) {
    const { ListObjectsV2Command } = require("@aws-sdk/client-s3");

    const command = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: options.prefix,
      MaxKeys: options.maxKeys ?? 1000,
      ContinuationToken: options.continuationToken,
    });

    const response = await this.s3Client.send(command);

    return {
      objects: (response.Contents || []).map((obj: any) => ({
        key: obj.Key!,
        size: obj.Size!,
        lastModified: obj.LastModified!,
        etag: obj.ETag!,
      })),
      nextContinuationToken: response.NextContinuationToken,
      isTruncated: response.IsTruncated ?? false,
    };
  }

  async getMetadata(key: string) {
    const { HeadObjectCommand } = require("@aws-sdk/client-s3");

    const command = new HeadObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    const response = await this.s3Client.send(command);

    return {
      contentType: response.ContentType,
      contentLength: response.ContentLength!,
      lastModified: response.LastModified!,
      etag: response.ETag!,
      metadata: response.Metadata,
    };
  }

  async deleteObject(key: string): Promise<void> {
    const { DeleteObjectCommand } = require("@aws-sdk/client-s3");

    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    await this.s3Client.send(command);
  }

  async deleteObjects(keys: string[]) {
    const { DeleteObjectsCommand } = require("@aws-sdk/client-s3");

    const command = new DeleteObjectsCommand({
      Bucket: this.bucketName,
      Delete: {
        Objects: keys.map((key) => ({ Key: key })),
      },
    });

    const response = await this.s3Client.send(command);

    return {
      deleted: (response.Deleted || []).map((obj: any) => obj.Key!),
      errors: (response.Errors || []).map((err: any) => ({
        key: err.Key!,
        message: err.Message || "Unknown error",
      })),
    };
  }
}
