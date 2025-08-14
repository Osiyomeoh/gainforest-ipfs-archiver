import knex, { Knex } from 'knex';
import { databaseConfig } from '../config/database';
import { logger } from '../utils/logger';
import {
  EcocertEntity,
  ArchivedContentEntity,
  EcocertInsert,
  AttestationInsert,
  ArchivedContentInsert,
  ArchiveStatus,
  ArchivingStats
} from '../types/database';
import { DatabaseError } from '../types/errors';

export class DatabaseService {
  private db: Knex;
  private static instance: DatabaseService;
  private isInitialized = false;

  private constructor() {
    const environment = (process.env.NODE_ENV || 'development') as keyof typeof databaseConfig;
    this.db = knex(databaseConfig[environment]);
    
    this.setupConnectionHandlers();
  }

  /**
   * Singleton pattern for connection management
   * Defense: Ensures single connection pool across application
   */
  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * Setup database connection event handlers
   * Defense: Production monitoring and debugging capabilities
   */
  private setupConnectionHandlers(): void {
    this.db.on('query', (query) => {
      logger.debug('Database query executed', { 
        sql: query.sql.substring(0, 200),
        bindings: query.bindings,
        duration: query.duration || 0
      });
    });

    this.db.on('query-error', (error, query) => {
      logger.error('Database query failed', { 
        error: error.message,
        sql: query.sql.substring(0, 200),
        bindings: query.bindings
      });
    });

    this.db.on('query-response', (response, query) => {
      if (query.duration && query.duration > 1000) {
        logger.warn('Slow query detected', {
          sql: query.sql.substring(0, 200),
          duration: query.duration,
          rowCount: Array.isArray(response) ? response.length : 1
        });
      }
    });
  }

  /**
   * Initialize database connection and run migrations
   * Defense: Validates database state before operations
   */
  async initialize(): Promise<void> {
    try {
      await this.db.raw('SELECT 1 as test');
      logger.info('Database connection established');

      const migrationStatus = await this.db.migrate.currentVersion();
      logger.info('Current migration version', { version: migrationStatus });

      const [batchNo, migrationList] = await this.db.migrate.latest();
      if (migrationList.length > 0) {
        logger.info('Database migrations completed', { 
          batch: batchNo, 
          migrations: migrationList 
        });
      } else {
        logger.info('Database is up to date');
      }

      this.isInitialized = true;

    } catch (error) {
      logger.error('Database initialization failed', { error });
      throw new DatabaseError(
        'Failed to initialize database connection',
        'DB_INIT_FAILED',
        { originalError: error }
      );
    }
  }

  /**
   * Gracefully close database connection
   * Defense: Proper resource cleanup for production deployments
   */
  async destroy(): Promise<void> {
    try {
      await this.db.destroy();
      this.isInitialized = false;
      logger.info('Database connection closed');
    } catch (error) {
      logger.error('Error closing database connection', { error });
      throw new DatabaseError(
        'Failed to close database connection',
        'DB_CLOSE_FAILED',
        { originalError: error }
      );
    }
  }

  /**
   * Health check for monitoring systems
   * Defense: Essential for production monitoring and alerting
   */
  async healthCheck(): Promise<{ status: string; connection: boolean; latency?: number }> {
    try {
      const start = Date.now();
      await this.db.raw('SELECT 1 as health_check');
      const latency = Date.now() - start;

      return { 
        status: 'healthy', 
        connection: true, 
        latency 
      };
    } catch (error) {
      logger.error('Database health check failed', { error });
      return { 
        status: 'unhealthy', 
        connection: false 
      };
    }
  }

  /**
   * Insert single ecocert with conflict handling
   * Defense: Handles duplicate inserts gracefully
   */
  async insertEcocert(ecocert: EcocertInsert): Promise<void> {
    this.ensureInitialized();
    
    try {
      await this.db('ecocerts')
        .insert({
          ...ecocert,
          created_at: new Date(),
          attestation_count: 0,
          archived_content_count: 0
        })
        .onConflict('id')
        .ignore();

      logger.debug('Ecocert inserted', { ecocertId: ecocert.id });

    } catch (error) {
      logger.error('Failed to insert ecocert', { ecocertId: ecocert.id, error });
      throw new DatabaseError(
        `Failed to insert ecocert ${ecocert.id}`,
        'ECOCERT_INSERT_FAILED',
        { ecocertId: ecocert.id, originalError: error }
      );
    }
  }

  /**
   * Batch insert ecocerts for performance
   * Defense: Efficient bulk operations with transaction safety
   */
  async insertEcocertsBatch(ecocerts: EcocertInsert[]): Promise<void> {
    this.ensureInitialized();
    
    if (ecocerts.length === 0) return;

    try {
      await this.db.transaction(async (trx) => {
        const enrichedEcocerts = ecocerts.map(ecocert => ({
          ...ecocert,
          created_at: new Date(),
          attestation_count: 0,
          archived_content_count: 0
        }));

        await trx('ecocerts')
          .insert(enrichedEcocerts)
          .onConflict('id')
          .ignore();
      });

      logger.info('Ecocerts batch inserted', { 
        count: ecocerts.length,
        ids: ecocerts.map(e => e.id)
      });

    } catch (error) {
      logger.error('Failed to insert ecocerts batch', { 
        count: ecocerts.length, 
        error 
      });
      throw new DatabaseError(
        `Failed to insert batch of ${ecocerts.length} ecocerts`,
        'ECOCERT_BATCH_INSERT_FAILED',
        { count: ecocerts.length, originalError: error }
      );
    }
  }

  /**
   * Get unprocessed ecocerts with limit
   * Defense: Prevents memory issues with large datasets
   */
  async getUnprocessedEcocerts(limit: number = 100): Promise<readonly EcocertEntity[]> {
    this.ensureInitialized();
    
    try {
      const ecocerts = await this.db('ecocerts')
        .whereNull('processed_at')
        .orderBy('created_at', 'asc')
        .limit(Math.min(limit, 1000))
        .select('*');

      logger.debug('Retrieved unprocessed ecocerts', { 
        count: ecocerts.length,
        limit 
      });

      return ecocerts as readonly EcocertEntity[];

    } catch (error) {
      logger.error('Failed to get unprocessed ecocerts', { limit, error });
      throw new DatabaseError(
        'Failed to retrieve unprocessed ecocerts',
        'ECOCERT_QUERY_FAILED',
        { limit, originalError: error }
      );
    }
  }

  /**
   * Mark ecocert as processed
   * Defense: Atomic update with verification
   */
  async markEcocertProcessed(ecocertId: string): Promise<void> {
    this.ensureInitialized();
    
    try {
      const result = await this.db('ecocerts')
        .where('id', ecocertId)
        .update({ 
          processed_at: new Date() 
        });

      if (result === 0) {
        throw new DatabaseError(
          `Ecocert ${ecocertId} not found`,
          'ECOCERT_NOT_FOUND',
          { ecocertId }
        );
      }

      logger.debug('Ecocert marked as processed', { ecocertId });

    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      
      logger.error('Failed to mark ecocert as processed', { ecocertId, error });
      throw new DatabaseError(
        `Failed to mark ecocert ${ecocertId} as processed`,
        'ECOCERT_UPDATE_FAILED',
        { ecocertId, originalError: error }
      );
    }
  }

  /**
   * Insert attestation with validation
   * Defense: Validates foreign key relationship exists
   */
  async insertAttestation(attestation: AttestationInsert): Promise<void> {
    this.ensureInitialized();
    
    try {
      await this.db.transaction(async (trx) => {
        const ecocertExists = await trx('ecocerts')
          .where('id', attestation.ecocert_id)
          .first();

        if (!ecocertExists) {
          throw new DatabaseError(
            `Ecocert ${attestation.ecocert_id} not found`,
            'ECOCERT_NOT_FOUND',
            { ecocertId: attestation.ecocert_id }
          );
        }

        await trx('attestations')
          .insert({
            ...attestation,
            created_at: new Date(),
            sources_count: attestation.data.sources?.length || 0
          })
          .onConflict('uid')
          .ignore();

        await trx('ecocerts')
          .where('id', attestation.ecocert_id)
          .increment('attestation_count', 1);
      });

      logger.debug('Attestation inserted', { 
        uid: attestation.uid,
        ecocertId: attestation.ecocert_id 
      });

    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      
      logger.error('Failed to insert attestation', { 
        uid: attestation.uid, 
        error 
      });
      throw new DatabaseError(
        `Failed to insert attestation ${attestation.uid}`,
        'ATTESTATION_INSERT_FAILED',
        { uid: attestation.uid, originalError: error }
      );
    }
  }

  /**
   * Insert archived content record
   * Defense: Returns generated ID for tracking
   */
  async insertArchivedContent(content: ArchivedContentInsert): Promise<number> {
    this.ensureInitialized();
    
    try {
      const [result] = await this.db.transaction(async (trx) => {
        const [insertedId] = await trx('archived_content')
          .insert({
            ...content,
            archived_at: new Date(),
            retry_count: 0,
            status: content.status || 'pending'
          })
          .returning('id');

        await trx('ecocerts')
          .where('id', content.ecocert_id)
          .increment('archived_content_count', 1);

        return [insertedId];
      });

      const id = typeof result === 'object' ? result.id : result;
      
      logger.debug('Archived content record created', { 
        id,
        ecocertId: content.ecocert_id,
        url: content.original_url 
      });

      return id;

    } catch (error) {
      logger.error('Failed to insert archived content', { 
        ecocertId: content.ecocert_id,
        url: content.original_url,
        error 
      });
      throw new DatabaseError(
        'Failed to insert archived content record',
        'ARCHIVED_CONTENT_INSERT_FAILED',
        { 
          ecocertId: content.ecocert_id,
          url: content.original_url,
          originalError: error 
        }
      );
    }
  }

  /**
   * Update archive status with error handling
   * Defense: Tracks retry attempts and error messages
   */
  async updateArchiveStatus(
    id: number, 
    status: ArchiveStatus, 
    errorMessage?: string
  ): Promise<void> {
    this.ensureInitialized();
    
    try {
      const updateData: Partial<ArchivedContentEntity> = { status };
      
      if (status === 'failed' && errorMessage) {
        updateData.error_message = errorMessage;
        updateData.last_retry_at = new Date();
        
        await this.db('archived_content')
          .where('id', id)
          .increment('retry_count', 1);
      }
      
      if (status === 'completed') {
        await this.db('archived_content')
          .where('id', id)
          .update({ error_message: null });
      }

      const result = await this.db('archived_content')
        .where('id', id)
        .update(updateData);

      if (result === 0) {
        throw new DatabaseError(
          `Archived content record ${id} not found`,
          'ARCHIVED_CONTENT_NOT_FOUND',
          { id }
        );
      }

      logger.debug('Archive status updated', { 
        id, 
        status, 
        hasError: !!errorMessage 
      });

    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      
      logger.error('Failed to update archive status', { id, status, error });
      throw new DatabaseError(
        `Failed to update archive status for record ${id}`,
        'ARCHIVE_STATUS_UPDATE_FAILED',
        { id, status, originalError: error }
      );
    }
  }

  /**
   * Get failed archives for retry processing
   * Defense: Limits retry attempts and respects retry delays
   */
  async getFailedArchives(limit: number = 50): Promise<readonly ArchivedContentEntity[]> {
    this.ensureInitialized();
    
    try {
      const maxRetries = 3;
      const retryDelayMinutes = 5;
      
      const failedArchives = await this.db('archived_content')
        .where('status', 'failed')
        .where('retry_count', '<', maxRetries)
        .where(function() {
          this.whereNull('last_retry_at')
            .orWhere(
              'last_retry_at', 
              '<', 
              new Date(Date.now() - retryDelayMinutes * 60 * 1000)
            );
        })
        .orderBy('last_retry_at', 'asc')
        .limit(Math.min(limit, 200))
        .select('*');

      logger.debug('Retrieved failed archives for retry', { 
        count: failedArchives.length,
        limit 
      });

      return failedArchives as readonly ArchivedContentEntity[];

    } catch (error) {
      logger.error('Failed to get failed archives', { limit, error });
      throw new DatabaseError(
        'Failed to retrieve failed archives',
        'FAILED_ARCHIVES_QUERY_FAILED',
        { limit, originalError: error }
      );
    }
  }

  /**
   * Get comprehensive archiving statistics
   * Defense: Provides production monitoring metrics
   */
  async getArchivingStats(): Promise<ArchivingStats> {
    this.ensureInitialized();
    
    try {
      const [
        ecocertStats,
        attestationStats,
        archiveStatusStats,
        overallStats
      ] = await Promise.all([
        this.db('ecocerts')
          .select(
            this.db.raw('COUNT(*) as total'),
            this.db.raw('COUNT(processed_at) as processed')
          )
          .first(),

        this.db('attestations')
          .count('* as total')
          .first()
          .then(result => result || { total: 0 }),

        this.db('archived_content')
          .select('status')
          .count('* as count')
          .groupBy('status'),

        this.db('archived_content')
          .select(
            this.db.raw('COUNT(*) as total_urls'),
            this.db.raw('COUNT(DISTINCT ecocert_id) as ecocerts_with_content')
          )
          .first()
      ]);

      const statusCounts = archiveStatusStats.reduce((acc, row) => {
        acc[row.status] = parseInt(String(row.count));
        return acc;
      }, {} as Record<string, number>);

      const totalUrls = parseInt(overallStats.total_urls) || 0;
      const successfullyArchived = statusCounts.completed || 0;
      const failedArchives = statusCounts.failed || 0;
      const pendingArchives = Number(statusCounts.pending || 0) + 
                            Number(statusCounts.downloading || 0) + 
                            Number(statusCounts.uploading || 0);

      const stats: ArchivingStats = {
        total_ecocerts: parseInt(ecocertStats.total) || 0,
        processed_ecocerts: parseInt(ecocertStats.processed) || 0,
        total_attestations: parseInt(String(attestationStats.total)) || 0,
        total_urls_found: totalUrls,
        successfully_archived: Number(successfullyArchived),
        failed_archives: Number(failedArchives),
        pending_archives: Number(pendingArchives),
        average_urls_per_ecocert: totalUrls > 0 && ecocertStats.total > 0 
          ? totalUrls / parseInt(ecocertStats.total) 
          : 0,
        success_rate: totalUrls > 0 
          ? (Number(successfullyArchived) / totalUrls) * 100 
          : 0
      };

      logger.debug('Archiving statistics calculated', stats);
      return stats;

    } catch (error) {
      logger.error('Failed to calculate archiving statistics', { error });
      throw new DatabaseError(
        'Failed to calculate archiving statistics',
        'STATS_CALCULATION_FAILED',
        { originalError: error }
      );
    }
  }

  /**
   * Ensure database is initialized before operations
   * Defense: Prevents operations on uninitialized connection
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new DatabaseError(
        'Database service not initialized',
        'DB_NOT_INITIALIZED'
      );
    }
  }

  /**
   * Execute raw SQL with logging
   * Defense: Controlled raw SQL access with monitoring
   */
  async executeRaw<T = any>(sql: string, bindings?: any[]): Promise<T> {
    this.ensureInitialized();
    
    try {
      logger.debug('Executing raw SQL', { 
        sql: sql.substring(0, 200),
        bindingCount: bindings?.length || 0
      });

      const result = await this.db.raw(sql, bindings || []);
      return result.rows || result;

    } catch (error) {
      logger.error('Raw SQL execution failed', { sql, error });
      throw new DatabaseError(
        'Raw SQL execution failed',
        'RAW_SQL_FAILED',
        { sql, originalError: error }
      );
    }
  }
}