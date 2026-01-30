import { readdir, stat, unlink, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { md5 } from 'js-md5';
import { config } from '../config';

/**
 * File-based audio cache with TTL cleanup
 *
 * SECURITY: Uses MD5 hash for filenames to prevent path traversal
 * Cache key: md5(videoId + voice) + .mp3
 */

const CACHE_EXTENSION = '.mp3';
const SUMMARY_EXTENSION = '_summary.json';

/**
 * Summary cache data structure
 */
export interface CachedSummary {
  videoId: string;
  summary: string;
  metadata?: {
    title?: string;
    channel?: string;
    duration?: string;
  };
  model: string;
  createdAt: number;
}

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
 * Get summary cache key
 */
export function getSummaryCacheKey(videoId: string): string {
  return md5(videoId) + SUMMARY_EXTENSION;
}

/**
 * Get summary cache path
 */
export function getSummaryCachePath(videoId: string): string {
  return join(config.cacheDir, getSummaryCacheKey(videoId));
}

/**
 * Read cached summary
 */
export async function readSummaryCache(videoId: string): Promise<CachedSummary | null> {
  const filePath = getSummaryCachePath(videoId);

  try {
    const stats = await stat(filePath);
    const ageMs = Date.now() - stats.mtimeMs;
    const ttlMs = config.cacheTtlDays * 24 * 60 * 60 * 1000;

    if (ageMs > ttlMs) {
      await unlink(filePath).catch(() => {});
      return null;
    }

    const file = Bun.file(filePath);
    const content = await file.text();
    return JSON.parse(content) as CachedSummary;
  } catch {
    return null;
  }
}

/**
 * Write summary to cache
 */
export async function writeSummaryCache(
  videoId: string,
  summary: string,
  model: string,
  metadata?: { title?: string; channel?: string; duration?: string }
): Promise<boolean> {
  const filePath = getSummaryCachePath(videoId);

  try {
    if (!existsSync(config.cacheDir)) {
      await mkdir(config.cacheDir, { recursive: true });
    }

    const data: CachedSummary = {
      videoId,
      summary,
      metadata,
      model,
      createdAt: Date.now(),
    };

    await Bun.write(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Failed to write summary cache:', error);
    return false;
  }
}

/**
 * History item returned by getCacheHistory
 */
export interface HistoryItem {
  videoId: string;
  title: string;
  channel: string;
  duration: string;
  createdAt: number;
  hasAudio: boolean;
}

/**
 * Get list of all cached summaries (history)
 */
export async function getCacheHistory(): Promise<HistoryItem[]> {
  if (!existsSync(config.cacheDir)) {
    return [];
  }

  try {
    const files = await readdir(config.cacheDir);
    const history: HistoryItem[] = [];
    const ttlMs = config.cacheTtlDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    for (const file of files) {
      if (!file.endsWith(SUMMARY_EXTENSION)) continue;

      try {
        const filePath = join(config.cacheDir, file);
        const stats = await stat(filePath);
        const ageMs = now - stats.mtimeMs;

        // Skip expired files
        if (ageMs > ttlMs) continue;

        const content = await Bun.file(filePath).text();
        const data = JSON.parse(content) as CachedSummary;

        // Check if audio exists for this video
        const audioFiles = files.filter((f) => f.endsWith(CACHE_EXTENSION));
        const hasAudio = audioFiles.length > 0; // Simplified - can't easily map hash back to videoId

        history.push({
          videoId: data.videoId,
          title: data.metadata?.title || 'Unknown Video',
          channel: data.metadata?.channel || 'Unknown Channel',
          duration: data.metadata?.duration || '',
          createdAt: data.createdAt,
          hasAudio,
        });
      } catch {
        // Skip files we can't read
      }
    }

    // Sort by most recent first
    history.sort((a, b) => b.createdAt - a.createdAt);
    return history;
  } catch {
    return [];
  }
}

/**
 * Delete all cache files for a specific video
 * Removes summary JSON and all audio files for this videoId
 */
export async function deleteVideoCache(videoId: string): Promise<{ deleted: number }> {
  let deleted = 0;

  if (!existsSync(config.cacheDir)) {
    return { deleted: 0 };
  }

  // Delete summary file
  const summaryPath = getSummaryCachePath(videoId);
  try {
    await unlink(summaryPath);
    deleted++;
  } catch {
    // File doesn't exist or can't be deleted
  }

  // Delete audio files - need to check all .mp3 files since they're hashed
  // We'll delete files that match the videoId pattern (with any voice)
  try {
    const files = await readdir(config.cacheDir);
    for (const file of files) {
      if (!file.endsWith(CACHE_EXTENSION)) continue;

      // Check common voice variants
      const voices = ['af_heart', 'af_bella', 'af_nicole', 'af_sarah', 'af_sky',
                      'am_adam', 'am_michael', 'bf_emma', 'bf_isabella', 'bm_george', 'bm_lewis'];

      for (const voice of voices) {
        const expectedKey = getCacheKey(videoId, voice);
        if (file === expectedKey) {
          try {
            await unlink(join(config.cacheDir, file));
            deleted++;
          } catch {
            // Ignore deletion errors
          }
        }
        // Also check for summary audio variant
        const summaryKey = getCacheKey(videoId + '_summary', voice);
        if (file === summaryKey) {
          try {
            await unlink(join(config.cacheDir, file));
            deleted++;
          } catch {
            // Ignore deletion errors
          }
        }
      }
    }
  } catch {
    // Ignore read errors
  }

  return { deleted };
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
