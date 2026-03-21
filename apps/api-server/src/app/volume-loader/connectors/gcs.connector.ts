import { Injectable } from '@nestjs/common';
import { Storage } from '@google-cloud/storage';
import { VolumeLoaderConfig, GcsConfig } from '@nexus-queue/shared-models';
import { IStorageConnector, RemoteFile, ConnectionTestResult } from './connector.interface';

@Injectable()
export class GcsConnectorService implements IStorageConnector {
  private getClient(): Storage {
    // Credentials via GOOGLE_APPLICATION_CREDENTIALS env var (path to service account JSON)
    return new Storage();
  }

  async testConnection(config: VolumeLoaderConfig): Promise<ConnectionTestResult> {
    try {
      const gcsConfig = config as GcsConfig;
      const [files] = await this.getClient()
        .bucket(gcsConfig.bucket)
        .getFiles({ prefix: gcsConfig.pathPrefix, maxResults: 5 });

      return {
        ok: true,
        files: files.map((f) => ({
          name: f.name.split('/').pop() ?? f.name,
          path: f.name,
          sizeBytes: Number(f.metadata['size'] ?? 0),
          lastModified: new Date(
            (f.metadata['updated'] as string | undefined) ?? Date.now()
          ),
        })),
      };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  async listFiles(config: VolumeLoaderConfig): Promise<RemoteFile[]> {
    const gcsConfig = config as GcsConfig;
    const [files] = await this.getClient()
      .bucket(gcsConfig.bucket)
      .getFiles({ prefix: gcsConfig.pathPrefix });

    return files.map((f) => ({
      name: f.name.split('/').pop() ?? f.name,
      path: f.name,
      sizeBytes: Number(f.metadata['size'] ?? 0),
      lastModified: new Date(
        (f.metadata['updated'] as string | undefined) ?? Date.now()
      ),
    }));
  }

  async downloadFile(config: VolumeLoaderConfig, filePath: string): Promise<Buffer> {
    const gcsConfig = config as GcsConfig;
    const [buf] = await this.getClient()
      .bucket(gcsConfig.bucket)
      .file(filePath)
      .download();
    return buf;
  }
}
