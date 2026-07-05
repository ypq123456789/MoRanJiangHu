type Awaitable<T> = T | Promise<T>;

interface ExportedHandler<Env = unknown, QueueHandlerMessage = unknown> {
  fetch?: (request: Request, env: Env, ctx: ExecutionContext) => Awaitable<Response>;
  scheduled?: (
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) => Awaitable<void>;
  queue?: (
    batch: MessageBatch<QueueHandlerMessage>,
    env: Env,
    ctx: ExecutionContext,
  ) => Awaitable<void>;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface ScheduledController {
  readonly cron: string;
  readonly scheduledTime: number;
  noRetry(): void;
}

interface QueueMessage<Message = unknown> {
  readonly id: string;
  readonly timestamp: Date;
  readonly body: Message;
  retry(): void;
  ack(): void;
}

interface MessageBatch<Message = unknown> {
  readonly queue: string;
  readonly messages: readonly QueueMessage<Message>[];
  retryAll(): void;
  ackAll(): void;
}

interface KVNamespaceListResult<KeyMetadata = unknown> {
  keys: Array<{
    name: string;
    expiration?: number;
    metadata?: KeyMetadata;
  }>;
  list_complete: boolean;
  cursor?: string;
}

interface KVNamespace<Key = string> {
  get(key: string, type: 'text'): Promise<string | null>;
  get(key: string, type: 'json'): Promise<Key | null>;
  get(key: string, type: 'arrayBuffer'): Promise<ArrayBuffer | null>;
  get(key: string, type: 'stream'): Promise<ReadableStream | null>;
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: {
      expiration?: number;
      expirationTtl?: number;
      metadata?: unknown;
    },
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list<KeyMetadata = unknown>(options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<KVNamespaceListResult<KeyMetadata>>;
}

interface R2HTTPMetadata {
  contentType?: string;
  contentLanguage?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  cacheControl?: string;
  cacheExpiry?: Date;
}

interface R2Object {
  readonly key: string;
  readonly version: string | null;
  readonly size: number;
  readonly etag: string;
  readonly httpEtag: string;
  readonly uploaded: Date;
  readonly checksums: {
    md5?: ArrayBuffer;
    sha1?: ArrayBuffer;
    sha256?: ArrayBuffer;
    sha384?: ArrayBuffer;
    sha512?: ArrayBuffer;
  };
  readonly httpMetadata?: R2HTTPMetadata;
  readonly customMetadata?: Record<string, string>;
}

interface R2ObjectBody extends R2Object {
  readonly body: ReadableStream;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  json<T>(): Promise<T>;
  blob(): Promise<Blob>;
}

interface R2PutOptions {
  onlyIf?: Headers | {
    etagMatches?: string;
    etagDoesNotMatch?: string;
    uploadedBefore?: Date;
    uploadedAfter?: Date;
  };
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
  md5?: ArrayBuffer | ArrayBufferView | string;
  sha1?: ArrayBuffer | ArrayBufferView | string;
  sha256?: ArrayBuffer | ArrayBufferView | string;
  sha384?: ArrayBuffer | ArrayBufferView | string;
  sha512?: ArrayBuffer | ArrayBufferView | string;
}

interface R2ListOptions {
  prefix?: string;
  delimiter?: string;
  limit?: number;
  cursor?: string;
  startAfter?: string;
  include?: ('httpMetadata' | 'customMetadata')[];
}

interface R2Objects {
  objects: R2Object[];
  truncated: boolean;
  cursor?: string;
  delimitedPrefixes: string[];
}

interface R2Bucket {
  head(key: string): Promise<R2Object | null>;
  get(
    key: string,
    options?: {
      onlyIf?: Headers | {
        etagMatches?: string;
        etagDoesNotMatch?: string;
        uploadedBefore?: Date;
        uploadedAfter?: Date;
      };
      range?:
        | Headers
        | {
            offset?: number;
            length?: number;
            suffix?: number;
          };
    },
  ): Promise<R2ObjectBody | null>;
  put(
    key: string,
    value:
      | string
      | ArrayBuffer
      | ArrayBufferView
      | ReadableStream
      | Blob
      | null,
    options?: R2PutOptions,
  ): Promise<R2Object>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: R2ListOptions): Promise<R2Objects>;
}
