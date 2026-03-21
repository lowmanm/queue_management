import { Injectable } from '@nestjs/common';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { VolumeLoaderConfig, S3Config } from '@nexus-queue/shared-models';
import { IStorageConnector, RemoteFile, ConnectionTestResult } from './connector.interface';

@Injectable()
export class S3ConnectorService implements IStorageConnector {
  private getClient(config: VolumeLoaderConfig): S3Client {
    const s3Config = config as S3Config;
    return new S3Client({
      region: s3Config.region ?? process.env['AWS_REGION'] ?? 'us-east-1',
      credentials: s3Config.accessKeyId
        ? {
            accessKeyId: s3Config.accessKeyId,
            secretAccessKey: s3Config.secretAccessKey ?? '',
          }
        : undefined,
    });
  }

  async testConnection(config: VolumeLoaderConfig): Promise<ConnectionTestResult> {
    try {
      const s3Config = config as S3Config;
      const client = this.getClient(config);
      const cmd = new ListObjectsV2Command({
        Bucket: s3Config.bucket,
        Prefix: s3Config.pathPrefix,
        MaxKeys: 5,
      });
      const response = await client.send(cmd);
      const files: RemoteFile[] = (response.Contents ?? []).map((obj) => ({
        name: obj.Key!.split('/').pop() ?? obj.Key!,
        path: obj.Key!,
        sizeBytes: obj.Size ?? 0,
        lastModified: obj.LastModified ?? new Date(),
      }));
      return { ok: true, files };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  async listFiles(config: VolumeLoaderConfig): Promise<RemoteFile[]> {
    const s3Config = config as S3Config;
    const client = this.getClient(config);
    const files: RemoteFile[] = [];
    let continuationToken: string | undefined;

    do {
      const cmd = new ListObjectsV2Command({
        Bucket: s3Config.bucket,
        Prefix: s3Config.pathPrefix,
        ContinuationToken: continuationToken,
      });
      const response = await client.send(cmd);
      for (const obj of response.Contents ?? []) {
        files.push({
          name: obj.Key!.split('/').pop() ?? obj.Key!,
          path: obj.Key!,
          sizeBytes: obj.Size ?? 0,
          lastModified: obj.LastModified ?? new Date(),
        });
      }
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return files;
  }

  async downloadFile(config: VolumeLoaderConfig, filePath: string): Promise<Buffer> {
    const s3Config = config as S3Config;
    const client = this.getClient(config);
    const cmd = new GetObjectCommand({ Bucket: s3Config.bucket, Key: filePath });
    const response = await client.send(cmd);
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
}
