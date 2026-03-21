import { Injectable } from '@nestjs/common';
import SftpClient from 'ssh2-sftp-client';
import { VolumeLoaderConfig, SftpConfig } from '@nexus-queue/shared-models';
import { IStorageConnector, RemoteFile, ConnectionTestResult } from './connector.interface';

@Injectable()
export class SftpConnectorService implements IStorageConnector {
  private async withClient<T>(
    config: VolumeLoaderConfig,
    fn: (client: SftpClient) => Promise<T>
  ): Promise<T> {
    const sftpConfig = config as SftpConfig;
    const client = new SftpClient();
    await client.connect({
      host: sftpConfig.host,
      port: sftpConfig.port ?? 22,
      username: sftpConfig.username,
      privateKey: sftpConfig.privateKey,
      password: sftpConfig.password,
    });
    try {
      return await fn(client);
    } finally {
      await client.end();
    }
  }

  async testConnection(config: VolumeLoaderConfig): Promise<ConnectionTestResult> {
    try {
      const sftpConfig = config as SftpConfig;
      const files = await this.withClient(config, async (client) => {
        const listing = await client.list(sftpConfig.remotePath ?? '/');
        return listing.slice(0, 5).map((f) => ({
          name: f.name,
          path: `${sftpConfig.remotePath ?? ''}/${f.name}`,
          sizeBytes: f.size,
          lastModified: new Date(f.modifyTime),
        }));
      });
      return { ok: true, files };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  async listFiles(config: VolumeLoaderConfig): Promise<RemoteFile[]> {
    const sftpConfig = config as SftpConfig;
    return this.withClient(config, async (client) => {
      const listing = await client.list(sftpConfig.remotePath ?? '/');
      return listing.map((f) => ({
        name: f.name,
        path: `${sftpConfig.remotePath ?? ''}/${f.name}`,
        sizeBytes: f.size,
        lastModified: new Date(f.modifyTime),
      }));
    });
  }

  async downloadFile(config: VolumeLoaderConfig, filePath: string): Promise<Buffer> {
    return this.withClient(config, async (client) => {
      const data = await client.get(filePath);
      return Buffer.isBuffer(data) ? data : Buffer.from(data as string);
    });
  }
}
