import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { VolumeLoaderConfig, LocalConfig } from '@nexus-queue/shared-models';
import { IStorageConnector, RemoteFile, ConnectionTestResult } from './connector.interface';

@Injectable()
export class LocalConnectorService implements IStorageConnector {
  async testConnection(config: VolumeLoaderConfig): Promise<ConnectionTestResult> {
    try {
      const localConfig = config as LocalConfig;
      const rootPath = localConfig.directory;

      if (!fs.existsSync(rootPath)) {
        return { ok: false, error: `Directory does not exist: ${rootPath}` };
      }

      const entries = fs.readdirSync(rootPath, { withFileTypes: true });
      const files: RemoteFile[] = entries
        .filter((e) => e.isFile())
        .slice(0, 5)
        .map((e) => {
          const fullPath = path.join(rootPath, e.name);
          const stat = fs.statSync(fullPath);
          return {
            name: e.name,
            path: fullPath,
            sizeBytes: stat.size,
            lastModified: stat.mtime,
          };
        });

      return { ok: true, files };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  async listFiles(config: VolumeLoaderConfig): Promise<RemoteFile[]> {
    const localConfig = config as LocalConfig;
    const rootPath = localConfig.directory;

    if (!fs.existsSync(rootPath)) {
      return [];
    }

    const entries = fs.readdirSync(rootPath, { withFileTypes: true });
    const pattern = localConfig.filePattern ?? '*';
    const ext = pattern.startsWith('*.') ? pattern.slice(1) : null;

    return entries
      .filter((e) => {
        if (!e.isFile()) return false;
        if (ext) return e.name.endsWith(ext);
        return true;
      })
      .map((e) => {
        const fullPath = path.join(rootPath, e.name);
        const stat = fs.statSync(fullPath);
        return {
          name: e.name,
          path: fullPath,
          sizeBytes: stat.size,
          lastModified: stat.mtime,
        };
      });
  }

  async downloadFile(_config: VolumeLoaderConfig, filePath: string): Promise<Buffer> {
    return fs.promises.readFile(filePath);
  }
}
