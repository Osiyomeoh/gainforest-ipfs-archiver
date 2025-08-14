import { AppConfig, Environment } from '../types/config';
import { PINATA_CONFIG, CONTENT_VALIDATION } from './constants';

/**
 * Load and validate application configuration

 */
export function loadConfig(): AppConfig {
  const environment = (process.env.NODE_ENV || 'development') as Environment;
  
  validateRequiredEnvVars();

  const config: AppConfig = {
    environment,
    
    database: {
      client: 'postgresql',
      connection: getDatabaseConnection(environment),
      pool: getDatabasePool(environment)
    },

    ipfs: {
      endpoint: PINATA_CONFIG.apiKey ? 'pinata' : process.env.IPFS_ENDPOINT || 'http://localhost:5001',
      gateway: PINATA_CONFIG.gateway,
      timeout: PINATA_CONFIG.timeout,
      apiKey: PINATA_CONFIG.apiKey || PINATA_CONFIG.jwt,
      pinContent: true
    },

    contentValidation: CONTENT_VALIDATION,

    processing: {
      maxConcurrentDownloads: parseInt(process.env.MAX_CONCURRENT_DOWNLOADS || '5'),
      maxRetryAttempts: parseInt(process.env.MAX_RETRY_ATTEMPTS || '3'),
      retryDelayMs: parseInt(process.env.RETRY_DELAY_MS || '1000'),
      requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS || '30000'),
      downloadDirectory: process.env.DOWNLOAD_DIRECTORY || './temp/downloads',
      cleanupAfterProcessing: process.env.CLEANUP_AFTER_PROCESSING !== 'false',
      batchSize: parseInt(process.env.BATCH_SIZE || '10')
    },

    logging: {
      level: (process.env.LOG_LEVEL as any) || 'info',
      format: environment === 'production' ? 'json' : 'text',
      destination: 'console'
    },

    monitoring: {
      healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000'),
      enablePrometheus: process.env.ENABLE_PROMETHEUS === 'true',
      alerting: {
        failureRateThreshold: parseFloat(process.env.FAILURE_RATE_THRESHOLD || '0.1'),
        processingDelayThreshold: parseInt(process.env.PROCESSING_DELAY_THRESHOLD || '300000'),
        diskSpaceThreshold: parseFloat(process.env.DISK_SPACE_THRESHOLD || '0.9'),
        ...(process.env.ALERT_WEBHOOK_URL && { webhookUrl: process.env.ALERT_WEBHOOK_URL })
      }
    }
  };

  return config;
}

/**
 * Get database connection configuration

 */
function getDatabaseConnection(environment: Environment) {
  if (environment === 'production' || environment === 'staging') {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for production/staging');
    }
    
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    };
  }

  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: environment === 'test' ? 
      (process.env.TEST_DB_NAME || 'gainforest_archiver_test') :
      (process.env.DB_NAME || 'gainforest_archiver_dev'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password'
  };
}

/**
 * Get database pool configuration

 */
function getDatabasePool(environment: Environment) {
  const poolConfigs = {
    development: { min: 2, max: 10 },
    test: { min: 1, max: 5 },
    staging: { min: 5, max: 20 },
    production: { min: 10, max: 50 }
  };

  const baseConfig = poolConfigs[environment];
  
  return {
    ...baseConfig,
    acquireTimeoutMillis: 60000,
    createTimeoutMillis: 30000,
    destroyTimeoutMillis: 5000,
    idleTimeoutMillis: 30000
  };
}

/**
 * Validate required environment variables

 */
function validateRequiredEnvVars(): void {
  const required = [
    'NODE_ENV'
  ];

  if (process.env.NODE_ENV === 'production') {
    required.push('DATABASE_URL');
  }

  if (!process.env.PINATA_API_KEY && !process.env.PINATA_JWT) {
    required.push('PINATA_API_KEY', 'PINATA_API_SECRET');
  }

  const missing = required.filter(env => !process.env[env]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

/**
 * Get configuration for specific service

 */
export function getServiceConfig<K extends keyof AppConfig>(
  service: K,
  config?: AppConfig
): AppConfig[K] {
  const appConfig = config || loadConfig();
  return appConfig[service];
}