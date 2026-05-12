import { CACHE_TTL_MS, CACHE_MAX_ENTRIES } from '../constants.js'

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
}

export class Cache {
  private store = new Map<string, CacheEntry<unknown>>()
  private defaults = { ttl: CACHE_TTL_MS }
  private maxEntries: number

  constructor(ttl = CACHE_TTL_MS, maxEntries = CACHE_MAX_ENTRIES) {
    this.defaults.ttl = ttl
    this.maxEntries = maxEntries
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key)
    if (!entry) return null
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.store.delete(key)
      return null
    }
    return entry.data as T
  }

  set<T>(key: string, data: T, ttl?: number): void {
    // FIFO eviction keeps huge listings from growing memory unboundedly.
    if (!this.store.has(key) && this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next()
      if (!oldest.done) this.store.delete(oldest.value)
    }
    this.store.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl ?? this.defaults.ttl,
    })
  }

  has(key: string): boolean {
    return this.get(key) !== null
  }

  delete(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }

  get size(): number {
    return this.store.size
  }
}

export const githubCache = new Cache()

export function cacheKey(...parts: string[]): string {
  return parts.join(':')
}
