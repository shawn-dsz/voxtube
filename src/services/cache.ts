import { readdir, stat, unlink, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import md5 from 'js-md5';
import { config } from '../config';

/**
 * File-based audio cache with TTL cleanup
 *
 * SECURITY: Uses MD5 hash for filenames to prevent path traversal
 * Cache key: md5(videoId + voice) + .mp3
 */

const CACHE_EXTENSION = '.mp3';

/**
 * Generate cache key (hashed filename)
 * SECURITY: Hashing prevents path traversal attacks
 */
export function getCacheKey(videoId: string, voice: string): string {
  return md5(`${videoId}_${voice}`) + CACHE_EXTENSION;
}

/**
 * Get full path for a cache file
 */
export function getCachePath(videoId: string, voice: string): string {
  return join(config.cacheDir, getCacheKey(videoId, voice));
}

/**
 * Check if cached audio exists and is fresh (not expired)
 */
export async function isCached(videoId: string, voice: string): Promise<boolean> {
  const filePath = getCachePath(videoId, voice);

  try {
    const stats = await stat(filePath);
    const ageMs = Date.now() - stats.mtimeMs;
    const ttlMs = config.cacheTtlDays * 24 * 60 * 60 * 1000;

    // If file is older than TTL, consider it not cached (will be regenerated)
    if (ageMs > ttlMs) {
      // Delete stale file
      await unlink(filePath).catch(() => {});
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Read cached audio file
 */
export async function readCache(
  videoId: string,
  voice: string
): Promise<ArrayBuffer | null> {
  if (!(await isCached(videoId, voice))) {
    return null;
  }

  const filePath = getCachePath(videoId, voice);

  try {
    const file = Bun.file(filePath);
    return await file.arrayBuffer();
  } catch {
    return null;
  }
}

/**
 * Write audio to cache
 */
export async function writeCache(
  videoId: string,
  voice: string,
  audioBuffer: ArrayBuffer
): Promise<boolean> {
  const filePath = getCachePath(videoId, voice);

  try {
    // Ensure cache directory exists
    if (!existsSync(config.cacheDir)) {
      await mkdir(config.cacheDir, { recursive: true });
    }

    await Bun.write(filePath, audioBuffer);
    return true;
  } catch (error) {
    console.error('Failed to write cache:', error);
    return false;
  }
}

/**
 * Clean up expired cache files
 * Called on startup and periodically
 */
export async function cleanupCache(): Promise<{ deleted: number; errors: number }> {
  const result = { deleted: 0, errors: 0 };

  if (!existsSync(config.cacheDir)) {
    return result;
  }

  const ttlMs = config.cacheTtlDays * 24 * 60 * 60 * 1000;
  const now = Date.now();

  try {
    const files = await readdir(config.cacheDir);

    for (const file of files) {
      if (!file.endsWith(CACHE_EXTENSION)) continue;

      const filePath = join(config.cacheDir, file);

      try {
        const stats = await stat(filePath);
        const ageMs = now - stats.mtimeMs;

        if (ageMs > ttlMs) {
          await unlink(filePath);
          result.deleted++;
        }
      } catch {
        result.errors++;
      }
    }
  } catch (error) {
    console.error('Cache cleanup error:', error);
  }

  return result;
}

/**
 * Start background cache cleanup interval
 */
export function startCleanupInterval(): void {
  const intervalMs = config.cleanupIntervalHours * 60 * 60 * 1000;

  // Initial cleanup (async, non-blocking)
  cleanupCache().then((result) => {
    if (result.deleted > 0) {
      console.log(`🗑️  Cache cleanup: deleted ${result.deleted} expired files`);
    }
  });

  // Periodic cleanup
  setInterval(async () => {
    const result = await cleanupCache();
    if (result.deleted > 0) {
      console.log(`🗑️  Cache cleanup: deleted ${result.deleted} expired files`);
    }
  }, intervalMs);
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  files: number;
  totalSizeBytes: number;
}> {
  if (!existsSync(config.cacheDir)) {
    return { files: 0, totalSizeBytes: 0 };
  }

  try {
    const files = await readdir(config.cacheDir);
    let totalSize = 0;
    let count = 0;

    for (const file of files) {
      if (!file.endsWith(CACHE_EXTENSION)) continue;

      try {
        const stats = await stat(join(config.cacheDir, file));
        totalSize += stats.size;
        count++;
      } catch {
        // Skip files we can't stat
      }
    }

    return { files: count, totalSizeBytes: totalSize };
  } catch {
    return { files: 0, totalSizeBytes: 0 };
  }
}
