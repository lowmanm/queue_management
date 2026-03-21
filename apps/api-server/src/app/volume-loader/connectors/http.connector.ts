import { Injectable } from '@nestjs/common';
import * as https from 'https';
import * as http from 'http';
import { VolumeLoaderConfig, HttpConfig } from '@nexus-queue/shared-models';
import { IStorageConnector, RemoteFile, ConnectionTestResult } from './connector.interface';

@Injectable()
export class HttpConnectorService implements IStorageConnector {
  async testConnection(config: VolumeLoaderConfig): Promise<ConnectionTestResult> {
    try {
      const httpConfig = config as HttpConfig;
      const url = new URL(httpConfig.url);
      const statusCode = await this.headRequest(url);

      if (statusCode >= 200 && statusCode < 300) {
        const file = this.urlToRemoteFile(httpConfig.url);
        return { ok: true, files: [file] };
      }
      return { ok: false, error: `HTTP HEAD returned status ${statusCode}` };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  async listFiles(config: VolumeLoaderConfig): Promise<RemoteFile[]> {
    const httpConfig = config as HttpConfig;
    return [this.urlToRemoteFile(httpConfig.url)];
  }

  async downloadFile(config: VolumeLoaderConfig, _filePath: string): Promise<Buffer> {
    const httpConfig = config as HttpConfig;
    return this.fetchUrl(httpConfig.url);
  }

  private urlToRemoteFile(url: string): RemoteFile {
    const parsed = new URL(url);
    const name = parsed.pathname.split('/').filter(Boolean).pop() ?? 'file';
    return {
      name,
      path: url,
      sizeBytes: 0,
      lastModified: new Date(),
    };
  }

  private headRequest(url: URL): Promise<number> {
    return new Promise((resolve, reject) => {
      const client = url.protocol === 'https:' ? https : http;
      const req = client.request(
        { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method: 'HEAD' },
        (res) => resolve(res.statusCode ?? 0)
      );
      req.on('error', reject);
      req.end();
    });
  }

  private fetchUrl(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const client = parsed.protocol === 'https:' ? https : http;
      client.get(url, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    });
  }
}
