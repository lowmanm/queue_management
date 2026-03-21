import { VolumeLoaderConfig } from '@nexus-queue/shared-models';

/**
 * Represents a single file returned by a storage connector listing.
 */
export interface RemoteFile {
  /** File name (basename/key) */
  name: string;
  /** Full path or object key */
  path: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Last modification date */
  lastModified: Date;
}

/**
 * Connection test result returned by IStorageConnector.testConnection().
 */
export interface ConnectionTestResult {
  /** Whether the connection succeeded */
  ok: boolean;
  /** Sample files found (up to 5) */
  files?: RemoteFile[];
  /** Error message if connection failed */
  error?: string;
}

/**
 * Common interface implemented by all storage connectors.
 * Provides testConnection, listFiles, and downloadFile operations.
 */
export interface IStorageConnector {
  /** Validate credentials and connectivity. Returns a sample file listing (up to 5 files). */
  testConnection(config: VolumeLoaderConfig): Promise<ConnectionTestResult>;

  /** List all files matching the loader's path/prefix config. */
  listFiles(config: VolumeLoaderConfig): Promise<RemoteFile[]>;

  /** Download a single file and return its content as a Buffer. */
  downloadFile(config: VolumeLoaderConfig, filePath: string): Promise<Buffer>;
}
