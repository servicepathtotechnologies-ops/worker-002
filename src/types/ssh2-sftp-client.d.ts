declare module 'ssh2-sftp-client' {
  interface ConnectOptions {
    host: string;
    port?: number;
    username?: string;
    password?: string;
    privateKey?: string | Buffer;
    [key: string]: unknown;
  }

  interface FileInfo {
    name: string;
    type: string;
    size: number;
    modifyTime: number;
    accessTime: number;
    rights: { user: string; group: string; other: string };
    owner: number;
    group: number;
  }

  class SftpClient {
    connect(config: ConnectOptions): Promise<void>;
    end(): Promise<void>;
    list(remoteFilePath: string): Promise<FileInfo[]>;
    get(remoteFilePath: string): Promise<Buffer>;
    put(input: Buffer | string, remoteFilePath: string): Promise<string>;
    delete(remoteFilePath: string): Promise<string>;
  }

  export = SftpClient;
}
