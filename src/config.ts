/**
 * VoxTube Configuration
 * Loads settings from environment variables with defaults
 */

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  kokoroUrl: process.env.KOKORO_URL || 'http://localhost:8880',
  cacheDir: process.env.CACHE_DIR || './cache',
  cacheTtlDays: parseInt(process.env.CACHE_TTL_DAYS || '7', 10),
  ytCliPath: process.env.YT_CLI_PATH || 'yt',
  maxTranscriptLength: parseInt(process.env.MAX_TRANSCRIPT_LENGTH || '50000', 10),
  cleanupIntervalHours: parseInt(process.env.CLEANUP_INTERVAL_HOURS || '12', 10),
  claudeCliPath: process.env.CLAUDE_CLI_PATH || 'claude',
} as const;

export type Config = typeof config;
