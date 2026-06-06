interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface CacheStorage {
  readonly default: Cache;
}

declare const caches: CacheStorage;
