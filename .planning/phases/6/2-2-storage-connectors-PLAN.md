<plan>
  <name>Storage Connectors</name>
  <wave>2</wave>
  <requirements>P6-050, P6-051, P6-052, P6-053, P6-054</requirements>
  <files>
    <!-- npm packages -->
    package.json

    <!-- New connector abstraction layer -->
    apps/api-server/src/app/volume-loader/connectors/connector.interface.ts  [NEW]
    apps/api-server/src/app/volume-loader/connectors/local.connector.ts      [NEW]
    apps/api-server/src/app/volume-loader/connectors/http.connector.ts       [NEW]
    apps/api-server/src/app/volume-loader/connectors/s3.connector.ts         [NEW]
    apps/api-server/src/app/volume-loader/connectors/gcs.connector.ts        [NEW]
    apps/api-server/src/app/volume-loader/connectors/sftp.connector.ts       [NEW]
    apps/api-server/src/app/volume-loader/connectors/index.ts                [NEW]

    <!-- Updated VolumeLoader module -->
    apps/api-server/src/app/volume-loader/volume-loader.service.ts
    apps/api-server/src/app/volume-loader/volume-loader.controller.ts
    apps/api-server/src/app/volume-loader/volume-loader.module.ts

    <!-- Frontend -->
    apps/agent-workspace/src/app/features/admin/components/volume-loader/volume-loader.component.ts
    apps/agent-workspace/src/app/features/admin/components/volume-loader/volume-loader.component.html
  </files>
  <tasks>
    <task id="1">
      <name>IStorageConnector interface and refactor LOCAL + HTTP as connectors</name>
      <action>
        Create `apps/api-server/src/app/volume-loader/connectors/connector.interface.ts`:
        ```typescript
        export interface RemoteFile {
          name: string;          // file name/key
          path: string;          // full path/key
          sizeBytes: number;
          lastModified: Date;
        }

        export interface IStorageConnector {
          /** Validate credentials and connectivity. Returns sample file listing (up to 5 files). */
          testConnection(config: VolumeLoaderConfig): Promise<{ ok: boolean; files?: RemoteFile[]; error?: string }>;

          /** List all files matching the loader's path/prefix config. */
          listFiles(config: VolumeLoaderConfig): Promise<RemoteFile[]>;

          /** Download a single file and return its content as a Buffer. */
          downloadFile(config: VolumeLoaderConfig, filePath: string): Promise<Buffer>;
        }
        ```

        Create `apps/api-server/src/app/volume-loader/connectors/local.connector.ts`:
        - Implements `IStorageConnector`
        - `testConnection()`: checks if `config.localConfig.rootPath` exists on disk; lists up to 5 files
        - `listFiles()`: reads directory, returns files matching `config.localConfig.filePattern` (glob)
        - `downloadFile()`: reads file from disk via `fs.promises.readFile()`

        Create `apps/api-server/src/app/volume-loader/connectors/http.connector.ts`:
        - Implements `IStorageConnector`
        - `testConnection()`: sends `HEAD` to `config.httpConfig.url`; returns ok if 200-299
        - `listFiles()`: returns a single `RemoteFile` representing the configured URL (HTTP loaders are single-file)
        - `downloadFile()`: fetches with `node-fetch` (already available) or Node `https` module

        Create `apps/api-server/src/app/volume-loader/connectors/index.ts` barrel export.

        Note: Do NOT modify `VolumeLoaderService` yet — that is Task 4.

        Commit: `feat(volume-loader): add IStorageConnector interface + LOCAL and HTTP connector implementations (P6-053)`
      </action>
      <files>
        apps/api-server/src/app/volume-loader/connectors/connector.interface.ts
        apps/api-server/src/app/volume-loader/connectors/local.connector.ts
        apps/api-server/src/app/volume-loader/connectors/http.connector.ts
        apps/api-server/src/app/volume-loader/connectors/index.ts
      </files>
      <verify>
        npx nx build api-server
        npx nx run api-server:eslint:lint
      </verify>
      <done>
        - `IStorageConnector` interface defined with testConnection, listFiles, downloadFile methods
        - `LocalConnectorService` implements IStorageConnector using fs.promises
        - `HttpConnectorService` implements IStorageConnector using fetch/https
        - All connector files compile without TypeScript errors
        - 0 lint errors
      </done>
    </task>

    <task id="2">
      <name>S3ConnectorService</name>
      <action>
        Install AWS SDK S3 client:
          npm install @aws-sdk/client-s3

        Create `apps/api-server/src/app/volume-loader/connectors/s3.connector.ts`:
        ```typescript
        import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

        @Injectable()
        export class S3ConnectorService implements IStorageConnector {
          private getClient(config: VolumeLoaderConfig): S3Client {
            return new S3Client({
              region: config.s3Config?.region ?? process.env['AWS_REGION'] ?? 'us-east-1',
              credentials: config.s3Config?.accessKeyId
                ? { accessKeyId: config.s3Config.accessKeyId, secretAccessKey: config.s3Config.secretAccessKey! }
                : undefined, // falls back to IAM role / env vars (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
            });
          }

          async testConnection(config: VolumeLoaderConfig) {
            try {
              const client = this.getClient(config);
              const cmd = new ListObjectsV2Command({
                Bucket: config.s3Config!.bucket,
                Prefix: config.s3Config?.keyPrefix,
                MaxKeys: 5,
              });
              const response = await client.send(cmd);
              const files = (response.Contents ?? []).map(obj => ({
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
            const client = this.getClient(config);
            const files: RemoteFile[] = [];
            let continuationToken: string | undefined;
            do {
              const cmd = new ListObjectsV2Command({
                Bucket: config.s3Config!.bucket,
                Prefix: config.s3Config?.keyPrefix,
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
            const client = this.getClient(config);
            const cmd = new GetObjectCommand({ Bucket: config.s3Config!.bucket, Key: filePath });
            const response = await client.send(cmd);
            const chunks: Uint8Array[] = [];
            for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
              chunks.push(chunk);
            }
            return Buffer.concat(chunks);
          }
        }
        ```

        Update connector barrel export to include S3ConnectorService.

        Commit: `feat(volume-loader): add S3ConnectorService using @aws-sdk/client-s3 (P6-050)`
      </action>
      <files>
        package.json
        apps/api-server/src/app/volume-loader/connectors/s3.connector.ts
        apps/api-server/src/app/volume-loader/connectors/index.ts
      </files>
      <verify>
        npx nx build api-server
        npx nx run api-server:eslint:lint
      </verify>
      <done>
        - `@aws-sdk/client-s3` in package.json
        - `S3ConnectorService` implements `IStorageConnector` for S3
        - `testConnection()` uses `ListObjectsV2Command` with MaxKeys=5
        - `listFiles()` paginates with `ContinuationToken`
        - `downloadFile()` streams `GetObjectCommand` response into `Buffer`
        - Credentials from `s3Config` or `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` env vars
        - 0 lint errors; compiles cleanly
      </done>
    </task>

    <task id="3">
      <name>GcsConnectorService and SftpConnectorService</name>
      <action>
        Install GCS and SFTP clients:
          npm install @google-cloud/storage ssh2-sftp-client
          npm install --save-dev @types/ssh2-sftp-client

        ### GCS Connector

        Create `apps/api-server/src/app/volume-loader/connectors/gcs.connector.ts`:
        ```typescript
        import { Storage } from '@google-cloud/storage';

        @Injectable()
        export class GcsConnectorService implements IStorageConnector {
          private getClient(): Storage {
            // credentials via GOOGLE_APPLICATION_CREDENTIALS env var (path to service account JSON)
            return new Storage();
          }

          async testConnection(config: VolumeLoaderConfig) {
            try {
              const [files] = await this.getClient()
                .bucket(config.gcsConfig!.bucket)
                .getFiles({ prefix: config.gcsConfig?.prefix, maxResults: 5 });
              return { ok: true, files: files.map(f => ({
                name: f.name.split('/').pop() ?? f.name,
                path: f.name,
                sizeBytes: Number(f.metadata.size ?? 0),
                lastModified: new Date(f.metadata.updated ?? Date.now()),
              })) };
            } catch (err) {
              return { ok: false, error: String(err) };
            }
          }

          async listFiles(config: VolumeLoaderConfig): Promise<RemoteFile[]> {
            const [files] = await this.getClient()
              .bucket(config.gcsConfig!.bucket)
              .getFiles({ prefix: config.gcsConfig?.prefix });
            return files.map(f => ({
              name: f.name.split('/').pop() ?? f.name,
              path: f.name,
              sizeBytes: Number(f.metadata.size ?? 0),
              lastModified: new Date(f.metadata.updated ?? Date.now()),
            }));
          }

          async downloadFile(config: VolumeLoaderConfig, filePath: string): Promise<Buffer> {
            const [buf] = await this.getClient()
              .bucket(config.gcsConfig!.bucket)
              .file(filePath)
              .download();
            return buf;
          }
        }
        ```

        ### SFTP Connector

        Create `apps/api-server/src/app/volume-loader/connectors/sftp.connector.ts`:
        ```typescript
        import SftpClient from 'ssh2-sftp-client';

        @Injectable()
        export class SftpConnectorService implements IStorageConnector {
          private async withClient<T>(config: VolumeLoaderConfig, fn: (client: SftpClient) => Promise<T>): Promise<T> {
            const client = new SftpClient();
            await client.connect({
              host: config.sftpConfig!.host,
              port: config.sftpConfig?.port ?? 22,
              username: config.sftpConfig!.username,
              privateKey: config.sftpConfig?.privateKey,
              password: config.sftpConfig?.password,
            });
            try {
              return await fn(client);
            } finally {
              await client.end();
            }
          }

          async testConnection(config: VolumeLoaderConfig) {
            try {
              const files = await this.withClient(config, async (client) => {
                const listing = await client.list(config.sftpConfig?.remotePath ?? '/');
                return listing.slice(0, 5).map(f => ({
                  name: f.name,
                  path: `${config.sftpConfig?.remotePath ?? ''}/${f.name}`,
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
            return this.withClient(config, async (client) => {
              const listing = await client.list(config.sftpConfig?.remotePath ?? '/');
              return listing.map(f => ({
                name: f.name,
                path: `${config.sftpConfig?.remotePath ?? ''}/${f.name}`,
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
        ```

        Update connector barrel export to include GcsConnectorService and SftpConnectorService.

        Commit: `feat(volume-loader): add GcsConnectorService and SftpConnectorService (P6-051, P6-052)`
      </action>
      <files>
        package.json
        apps/api-server/src/app/volume-loader/connectors/gcs.connector.ts
        apps/api-server/src/app/volume-loader/connectors/sftp.connector.ts
        apps/api-server/src/app/volume-loader/connectors/index.ts
      </files>
      <verify>
        npx nx build api-server
        npx nx run api-server:eslint:lint
      </verify>
      <done>
        - `@google-cloud/storage` and `ssh2-sftp-client` in package.json
        - `GcsConnectorService` implements IStorageConnector using @google-cloud/storage
        - `SftpConnectorService` implements IStorageConnector using ssh2-sftp-client
        - `withClient()` pattern in SFTP ensures connection cleanup
        - Credentials from `GOOGLE_APPLICATION_CREDENTIALS` env var for GCS
        - SFTP accepts both `privateKey` and `password` auth
        - 0 lint errors; compiles cleanly
      </done>
    </task>

    <task id="4">
      <name>VolumeLoader connector routing and test-connection endpoint</name>
      <action>
        ### Wire connectors into VolumeLoaderService (P6-053)

        In `VolumeLoaderModule`:
        - Register all connector services as providers:
          `LocalConnectorService`, `HttpConnectorService`, `S3ConnectorService`,
          `GcsConnectorService`, `SftpConnectorService`

        In `VolumeLoaderService`:
        - Inject all connector services
        - Add private method `getConnector(loaderType: VolumeLoaderType): IStorageConnector`
          that returns the appropriate connector based on type
        - Update internal file-fetching logic (wherever the service reads files from a source)
          to call `connector.listFiles(config)` and `connector.downloadFile(config, filePath)`
          instead of inline fs/http calls
        - This replaces the existing type-switch logic that was embedded in the service

        ### Test-connection endpoint (P6-054)

        Add to `VolumeLoaderController`:
        ```typescript
        @Post(':id/test-connection')
        async testConnection(@Param('id') id: string) {
          const loader = await this.volumeLoaderService.findOne(id);
          const connector = this.volumeLoaderService.getConnectorPublic(loader.loaderType);
          return connector.testConnection(loader.config);
        }
        ```
        - Make `getConnector()` accessible (rename to `getConnectorPublic()` or keep internal
          and add a `testConnection(id: string)` method on the service)
        - Returns `{ ok: boolean, files?: RemoteFile[], error?: string }` directly

        Commit: `feat(volume-loader): route execution through IStorageConnector; add test-connection endpoint (P6-053, P6-054)`
      </action>
      <files>
        apps/api-server/src/app/volume-loader/volume-loader.service.ts
        apps/api-server/src/app/volume-loader/volume-loader.controller.ts
        apps/api-server/src/app/volume-loader/volume-loader.module.ts
      </files>
      <verify>
        npx nx build api-server
        npx nx run api-server:eslint:lint
        npx nx test api-server
      </verify>
      <done>
        - `VolumeLoaderService.getConnector(type)` dispatches to correct IStorageConnector
        - File ingestion logic calls `connector.listFiles()` and `connector.downloadFile()`
        - `POST /api/volume-loaders/:id/test-connection` returns connection test result
        - All existing volume-loader tests still pass
        - 0 lint errors
      </done>
    </task>

    <task id="5">
      <name>Volume Loader UI — Test Connection button (frontend)</name>
      <action>
        In `volume-loader.component.ts`:
        - Add `connectionTestResult = signal<{ ok: boolean; files?: RemoteFile[]; error?: string } | null>(null)`
        - Add `isTestingConnection = signal(false)`
        - Add `testConnection(loaderId: string)` method:
          - Sets `isTestingConnection(true)`
          - Calls `POST /api/volume-loaders/:id/test-connection` via HttpClient
          - On response: sets `connectionTestResult` signal
          - On error: sets result to `{ ok: false, error: 'Network error' }`
          - Always: sets `isTestingConnection(false)`

        In `volume-loader.component.html` (in the loader detail/edit view):
        - Add "Test Connection" button next to the loader type badge
        - Disabled while `isTestingConnection()` is true (shows spinner)
        - After test: show result banner:
          - ✅ "Connection successful — [N] files found" with file list (up to 5 sample paths)
          - ❌ "Connection failed: [error message]"
        - Result banner dismissable (X button)

        Commit: `feat(admin): add Test Connection button to Volume Loader admin UI (P6-054)`
      </action>
      <files>
        apps/agent-workspace/src/app/features/admin/components/volume-loader/volume-loader.component.ts
        apps/agent-workspace/src/app/features/admin/components/volume-loader/volume-loader.component.html
      </files>
      <verify>
        npx nx build agent-workspace
        npx nx lint agent-workspace
        npx nx test agent-workspace
      </verify>
      <done>
        - "Test Connection" button visible in Volume Loader detail view
        - Button disabled during testing (spinner shown)
        - Success result shows file count and sample file paths
        - Error result shows error message in red banner
        - Result banner is dismissable
        - 0 lint errors
        - All tests pass
      </done>
    </task>
  </tasks>
  <dependencies>
    Wave 1 (1-1-platform-hardening) must complete before Wave 2 begins.
    This plan is independent of 2-1-observability-alerting (can execute in parallel).
  </dependencies>
</plan>
