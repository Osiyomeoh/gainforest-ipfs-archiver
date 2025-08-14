import { EventEmitter } from 'events';
import { DatabaseService } from './services/database';
import { EcocertService } from './services/ecocertService';
import { ContentDownloader } from './services/contentDownloader';
import { logger } from './utils/logger';
import { AppConfig } from './types/config';
import { EcocertProcessingResult } from './types/ecocert';
import { ArchivingStats } from './types/database';
import { DatabaseError } from './types/errors';

/**
 * Main application class

 */
export class GainForestArchiver extends EventEmitter {
  private databaseService: DatabaseService;
  private ecocertService: EcocertService;
  private contentDownloader: ContentDownloader;
  private isInitialized = false;
  private isShuttingDown = false;
  private processingPromises: Set<Promise<any>> = new Set();

  constructor(private _config: AppConfig) {
    super();
    
    this.databaseService = DatabaseService.getInstance();
    this.ecocertService = new EcocertService();
    this.contentDownloader = new ContentDownloader();
    
    this.setupSignalHandlers();
    
    logger.info('GainForest Archiver initialized', {
      environment: this._config.environment,
      version: process.env.npm_package_version || '1.0.0'
    });
  }

  /**
   * Initialize all application services

   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Application already initialized');
      return;
    }

    try {
      logger.info('Initializing GainForest Archiver services...');

      await this.databaseService.initialize();
      this.emit('service:database:ready');

      await this.ecocertService.initialize();
      this.emit('service:ecocert:ready');

      await this.performHealthChecks();

      this.isInitialized = true;
      this.emit('app:ready');

      logger.info('GainForest Archiver initialization completed successfully');

    } catch (error) {
      logger.error('Application initialization failed', { error });
      this.emit('app:error', error);
      throw error;
    }
  }

  /**
   * Perform health checks
   */
  async performHealthChecks(): Promise<{ [service: string]: boolean }> {
    const healthChecks = {
      database: false,
      ipfs: false
    };

    try {
      const dbHealth = await this.databaseService.healthCheck();
      healthChecks.database = dbHealth.connection;

      healthChecks.ipfs = true;

      logger.info('Health checks completed', healthChecks);

      this.emit('health:check', healthChecks);

      return healthChecks;

    } catch (error) {
      logger.error('Health check failed', { error });
      this.emit('health:error', error);
      throw error;
    }
  }

  /**
   * Process all sample ecocerts

   */
  async processAllEcocerts(): Promise<{
    results: EcocertProcessingResult[];
    summary: ProcessingSummary;
  }> {
    this.ensureInitialized();
    this.ensureNotShuttingDown();

    const startTime = Date.now();
    logger.info('Starting processing of all sample ecocerts');

    try {
      const ecocertIds = this.ecocertService.getSampleEcocertIds();
      logger.info('Retrieved sample ecocert IDs', { count: ecocertIds.length });

      const processingPromise = this.ecocertService.processBatch([...ecocertIds]);
      this.processingPromises.add(processingPromise);

      this.emit('processing:started', { ecocertIds });

      try {
        const results = await processingPromise;

        const summary = this.generateProcessingSummary(results, startTime);

        this.emit('processing:completed', { results, summary });

        logger.info('All ecocerts processing completed', summary);

        return { results, summary };

      } finally {
        this.processingPromises.delete(processingPromise);
      }

    } catch (error) {
      logger.error('Ecocert processing failed', { error });
      this.emit('processing:error', error);
      throw error;
    }
  }

  /**
   * Process specific ecocerts by ID

   */
  async processSpecificEcocerts(ecocertIds: string[]): Promise<{
    results: EcocertProcessingResult[];
    summary: ProcessingSummary;
  }> {
    this.ensureInitialized();
    this.ensureNotShuttingDown();

    const validIds: string[] = [];
    const invalidIds: string[] = [];

    for (const id of ecocertIds) {
      try {
        this.ecocertService.parseEcocertId(id);
        validIds.push(id);
      } catch (error) {
        invalidIds.push(id);
        logger.warn('Invalid ecocert ID provided', { id, error: error instanceof Error ? error.message : String(error) });
      }
    }

    if (invalidIds.length > 0) {
      this.emit('validation:error', { invalidIds });
    }

    if (validIds.length === 0) {
      throw new DatabaseError(
        'No valid ecocert IDs provided',
        'NO_VALID_ECOCERTS'
      );
    }

    const startTime = Date.now();
    logger.info('Starting processing of specific ecocerts', {
      validCount: validIds.length,
      invalidCount: invalidIds.length,
      validIds
    });

    try {
      const processingPromise = this.ecocertService.processBatch(validIds);
      this.processingPromises.add(processingPromise);

      this.emit('processing:started', { ecocertIds: validIds });

      try {
        const results = await processingPromise;
        const summary = this.generateProcessingSummary(results, startTime);

        this.emit('processing:completed', { results, summary });

        logger.info('Specific ecocerts processing completed', summary);

        return { results, summary };

      } finally {
        this.processingPromises.delete(processingPromise);
      }

    } catch (error) {
      logger.error('Specific ecocerts processing failed', { error });
      this.emit('processing:error', error);
      throw error;
    }
  }

  /**
   * Get archiving statistics

   */
  async getArchivingStatistics(): Promise<ArchivingStats & { 
    systemHealth: any;
    lastUpdated: Date;
  }> {
    this.ensureInitialized();

    try {
      const [stats, healthChecks] = await Promise.all([
        this.databaseService.getArchivingStats(),
        this.performHealthChecks()
      ]);

      const result = {
        ...stats,
        systemHealth: healthChecks,
        lastUpdated: new Date()
      };

      this.emit('stats:retrieved', result);
      return result;

    } catch (error) {
      logger.error('Failed to get archiving statistics', { error });
      this.emit('stats:error', error);
      throw error;
    }
  }

  /**
   * Retry failed archives

   */
  async retryFailedArchives(limit: number = 50): Promise<{
    attempted: number;
    successful: number;
    stillFailed: number;
  }> {
    this.ensureInitialized();
    this.ensureNotShuttingDown();

    logger.info('Starting retry of failed archives', { limit });

    try {
      const failedArchives = await this.databaseService.getFailedArchives(limit);
      
      if (failedArchives.length === 0) {
        logger.info('No failed archives found for retry');
        return { attempted: 0, successful: 0, stillFailed: 0 };
      }

      logger.info('Found failed archives for retry', { count: failedArchives.length });

      let successful = 0;
      let stillFailed = 0;

      const archivesByEcocert = failedArchives.reduce((acc, archive) => {
        if (!acc[archive.ecocert_id]) {
          acc[archive.ecocert_id] = [];
        }
        acc[archive.ecocert_id].push(archive);
        return acc;
      }, {} as Record<string, any[]>);

      for (const [ecocertId, archives] of Object.entries(archivesByEcocert)) {
        logger.info('Retrying failed archives for ecocert', {
          ecocertId,
          archiveCount: archives.length
        });

        for (const archive of archives) {
          try {
            await this.retryArchiveRecord(archive);
            successful++;
            logger.info('Archive retry successful', {
              archiveId: archive.id,
              url: archive.original_url
            });

          } catch (error) {
            stillFailed++;
            logger.error('Archive retry failed', {
              archiveId: archive.id,
              url: archive.original_url,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
      }

      const result = {
        attempted: failedArchives.length,
        successful,
        stillFailed
      };

      logger.info('Failed archives retry completed', result);
      this.emit('retry:completed', result);

      return result;

    } catch (error) {
      logger.error('Failed archives retry process failed', { error });
      this.emit('retry:error', error);
      throw error;
    }
  }

  /**
   * Retry individual archive record

   */
  private async retryArchiveRecord(archive: any): Promise<void> {
    await this.databaseService.updateArchiveStatus(archive.id, 'downloading');

    try {
      const downloadResult = await this.contentDownloader.downloadContent(archive.original_url);

      await this.databaseService.updateArchiveStatus(archive.id, 'uploading');

      const filename = `retry_${Date.now()}_${archive.id}${downloadResult.metadata.fileExtension || '.bin'}`;

      const ipfsService = new (require('./services/ipfs').PinataIPFSService)();
      const ipfsResult = await ipfsService.upload(
        downloadResult.content,
        filename,
        downloadResult.metadata
      );

      await this.databaseService.executeRaw(
        `UPDATE archived_content 
         SET status = ?, content_type = ?, file_extension = ?, 
             ipfs_hash = ?, ipfs_url = ?, file_size = ?, content_hash = ?,
             error_message = NULL
         WHERE id = ?`,
        [
          'completed',
          downloadResult.metadata.contentType,
          downloadResult.metadata.fileExtension,
          ipfsResult.hash,
          ipfsResult.url,
          downloadResult.metadata.fileSize,
          downloadResult.metadata.contentHash,
          archive.id
        ]
      );

    } catch (error) {
      await this.databaseService.updateArchiveStatus(
        archive.id,
        'failed',
        `Retry failed: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  /**
   * Graceful shutdown

   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    logger.info('Starting graceful shutdown...');

    try {
      this.emit('shutdown:started');

      if (this.processingPromises.size > 0) {
        logger.info('Waiting for ongoing processing to complete', {
          activePromises: this.processingPromises.size
        });

        const timeout = 30000;
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Shutdown timeout')), timeout);
        });

        try {
          await Promise.race([
            Promise.all(this.processingPromises),
            timeoutPromise
          ]);
          logger.info('All processing completed before shutdown');
        } catch (error) {
          logger.warn('Shutdown timeout reached, forcing cleanup', { error: error instanceof Error ? error.message : String(error) });
        }
      }

      await this.contentDownloader.cleanup();

      await this.databaseService.destroy();

      this.emit('shutdown:completed');
      logger.info('Graceful shutdown completed');

    } catch (error) {
      logger.error('Error during shutdown', { error });
      this.emit('shutdown:error', error);
      throw error;
    }
  }

  /**
   * Generate processing summary

   */
  private generateProcessingSummary(
    results: EcocertProcessingResult[],
    startTime: number
  ): ProcessingSummary {
    const duration = Date.now() - startTime;
    const totalEcocerts = results.length;
    const completedEcocerts = results.filter(r => r.status === 'completed').length;
    const failedEcocerts = results.filter(r => r.status === 'failed').length;
    const totalAttestations = results.reduce((sum, r) => sum + r.attestationsFound, 0);
    const totalUrls = results.reduce((sum, r) => sum + r.urlsExtracted, 0);
    const totalArchived = results.reduce((sum, r) => sum + r.successfullyArchived, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

    return {
      duration,
      totalEcocerts,
      completedEcocerts,
      failedEcocerts,
      successRate: totalEcocerts > 0 ? (completedEcocerts / totalEcocerts) * 100 : 0,
      totalAttestations,
      totalUrls,
      totalArchived,
      archivalRate: totalUrls > 0 ? (totalArchived / totalUrls) * 100 : 0,
      totalErrors,
      averageProcessingTime: totalEcocerts > 0 ? duration / totalEcocerts : 0,
      startTime: new Date(startTime),
      endTime: new Date()
    };
  }

  /**
   * Setup process signal handlers

   */
  private setupSignalHandlers(): void {
    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGHUP'];

    signals.forEach(signal => {
      process.on(signal, async () => {
        logger.info(`Received ${signal}, initiating graceful shutdown`);
        try {
          await this.shutdown();
          process.exit(0);
        } catch (error) {
          logger.error('Graceful shutdown failed', { error });
          process.exit(1);
        }
      });
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error });
      this.emit('error:uncaught', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection', { reason, promise });
      this.emit('error:unhandled-rejection', reason);
      process.exit(1);
    });
  }

  /**
   * Ensure application is initialized

   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new DatabaseError(
        'Application not initialized',
        'APP_NOT_INITIALIZED'
      );
    }
  }

  /**
   * Ensure application is not shutting down

   */
  private ensureNotShuttingDown(): void {
    if (this.isShuttingDown) {
      throw new DatabaseError(
        'Application is shutting down',
        'APP_SHUTTING_DOWN'
      );
    }
  }
}

/**
 * Processing summary interface

 */
export interface ProcessingSummary {
  duration: number;
  totalEcocerts: number;
  completedEcocerts: number;
  failedEcocerts: number;
  successRate: number;
  totalAttestations: number;
  totalUrls: number;
  totalArchived: number;
  archivalRate: number;
  totalErrors: number;
  averageProcessingTime: number;
  startTime: Date;
  endTime: Date;
}