import { IPFSConfig, ContentValidationRules } from './ipfs';

export type Environment = 'development' | 'test' | 'staging' | 'production';

/**
 * Database configuration
 */
export interface DatabaseConfig {
  readonly client: 'postgresql';
  readonly connection: {
    readonly host?: string;
    readonly port?: number;
    readonly database?: string;
    readonly user?: string;
    readonly password?: string;
    readonly connectionString?: string;
    readonly ssl?: boolean | { rejectUnauthorized: boolean };
  };
  readonly pool: {
    readonly min: number;
    readonly max: number;
    readonly acquireTimeoutMillis?: number;
    readonly createTimeoutMillis?: number;
    readonly destroyTimeoutMillis?: number;
    readonly idleTimeoutMillis?: number;
  };
}

/**
 * Application configuration
 * Configuration management
 */
export interface AppConfig {
  readonly environment: Environment;
  readonly database: DatabaseConfig;
  readonly ipfs: IPFSConfig;
  readonly contentValidation: ContentValidationRules;
  readonly processing: ProcessingConfig;
  readonly logging: LoggingConfig;
  readonly monitoring: MonitoringConfig;
}

/**
 * Content processing configuration
 */
export interface ProcessingConfig {
  readonly maxConcurrentDownloads: number;
  readonly maxRetryAttempts: number;
  readonly retryDelayMs: number;
  readonly requestTimeoutMs: number;
  readonly downloadDirectory: string;
  readonly cleanupAfterProcessing: boolean;
  readonly batchSize: number;
}

/**
 * Logging configuration
 */
export interface LoggingConfig {
  readonly level: 'error' | 'warn' | 'info' | 'debug';
  readonly format: 'json' | 'text';
  readonly destination: 'console' | 'file' | 'both';
  readonly logFile?: string;
  readonly maxFileSize?: string;
  readonly maxFiles?: number;
}

/**
 * Monitoring configuration
 * Health checks and metrics
 */
export interface MonitoringConfig {
  readonly healthCheckInterval: number;
  readonly metricsPort?: number;
  readonly enablePrometheus: boolean;
  readonly alerting: AlertingConfig;
}

/**
 * Alerting configuration
 */
export interface AlertingConfig {
  readonly failureRateThreshold: number;
  readonly processingDelayThreshold: number;
  readonly diskSpaceThreshold: number;
  readonly webhookUrl?: string;
}

/**
 * Runtime configuration validation
 * Configuration validation
 */
export interface ConfigValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

/**
 * Feature flags
 */
export interface FeatureFlags {
  readonly enableRetryLogic: boolean;
  readonly enableContentValidation: boolean;
  readonly enableMalwareScan: boolean;
  readonly enableMetrics: boolean;
  readonly enableCaching: boolean;
  readonly enableBatchProcessing: boolean;
}