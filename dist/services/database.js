"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseService = void 0;
const knex_1 = __importDefault(require("knex"));
const database_1 = require("../config/database");
const logger_1 = require("../utils/logger");
const errors_1 = require("../types/errors");
class DatabaseService {
    constructor() {
        this.isInitialized = false;
        const environment = (process.env.NODE_ENV || 'development');
        this.db = (0, knex_1.default)(database_1.databaseConfig[environment]);
        this.setupConnectionHandlers();
    }
    static getInstance() {
        if (!DatabaseService.instance) {
            DatabaseService.instance = new DatabaseService();
        }
        return DatabaseService.instance;
    }
    setupConnectionHandlers() {
        this.db.on('query', (query) => {
            logger_1.logger.debug('Database query executed', {
                sql: query.sql.substring(0, 200),
                bindings: query.bindings,
                duration: query.duration || 0
            });
        });
        this.db.on('query-error', (error, query) => {
            logger_1.logger.error('Database query failed', {
                error: error.message,
                sql: query.sql.substring(0, 200),
                bindings: query.bindings
            });
        });
        this.db.on('query-response', (response, query) => {
            if (query.duration && query.duration > 1000) {
                logger_1.logger.warn('Slow query detected', {
                    sql: query.sql.substring(0, 200),
                    duration: query.duration,
                    rowCount: Array.isArray(response) ? response.length : 1
                });
            }
        });
    }
    async initialize() {
        try {
            await this.db.raw('SELECT 1 as test');
            logger_1.logger.info('Database connection established');
            const migrationStatus = await this.db.migrate.currentVersion();
            logger_1.logger.info('Current migration version', { version: migrationStatus });
            const [batchNo, migrationList] = await this.db.migrate.latest();
            if (migrationList.length > 0) {
                logger_1.logger.info('Database migrations completed', {
                    batch: batchNo,
                    migrations: migrationList
                });
            }
            else {
                logger_1.logger.info('Database is up to date');
            }
            this.isInitialized = true;
        }
        catch (error) {
            logger_1.logger.error('Database initialization failed', { error });
            throw new errors_1.DatabaseError('Failed to initialize database connection', 'DB_INIT_FAILED', { originalError: error });
        }
    }
    async destroy() {
        try {
            await this.db.destroy();
            this.isInitialized = false;
            logger_1.logger.info('Database connection closed');
        }
        catch (error) {
            logger_1.logger.error('Error closing database connection', { error });
            throw new errors_1.DatabaseError('Failed to close database connection', 'DB_CLOSE_FAILED', { originalError: error });
        }
    }
    async healthCheck() {
        try {
            const start = Date.now();
            await this.db.raw('SELECT 1 as health_check');
            const latency = Date.now() - start;
            return {
                status: 'healthy',
                connection: true,
                latency
            };
        }
        catch (error) {
            logger_1.logger.error('Database health check failed', { error });
            return {
                status: 'unhealthy',
                connection: false
            };
        }
    }
    async insertEcocert(ecocert) {
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
            logger_1.logger.debug('Ecocert inserted', { ecocertId: ecocert.id });
        }
        catch (error) {
            logger_1.logger.error('Failed to insert ecocert', { ecocertId: ecocert.id, error });
            throw new errors_1.DatabaseError(`Failed to insert ecocert ${ecocert.id}`, 'ECOCERT_INSERT_FAILED', { ecocertId: ecocert.id, originalError: error });
        }
    }
    async insertEcocertsBatch(ecocerts) {
        this.ensureInitialized();
        if (ecocerts.length === 0)
            return;
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
            logger_1.logger.info('Ecocerts batch inserted', {
                count: ecocerts.length,
                ids: ecocerts.map(e => e.id)
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to insert ecocerts batch', {
                count: ecocerts.length,
                error
            });
            throw new errors_1.DatabaseError(`Failed to insert batch of ${ecocerts.length} ecocerts`, 'ECOCERT_BATCH_INSERT_FAILED', { count: ecocerts.length, originalError: error });
        }
    }
    async getUnprocessedEcocerts(limit = 100) {
        this.ensureInitialized();
        try {
            const ecocerts = await this.db('ecocerts')
                .whereNull('processed_at')
                .orderBy('created_at', 'asc')
                .limit(Math.min(limit, 1000))
                .select('*');
            logger_1.logger.debug('Retrieved unprocessed ecocerts', {
                count: ecocerts.length,
                limit
            });
            return ecocerts;
        }
        catch (error) {
            logger_1.logger.error('Failed to get unprocessed ecocerts', { limit, error });
            throw new errors_1.DatabaseError('Failed to retrieve unprocessed ecocerts', 'ECOCERT_QUERY_FAILED', { limit, originalError: error });
        }
    }
    async markEcocertProcessed(ecocertId) {
        this.ensureInitialized();
        try {
            const result = await this.db('ecocerts')
                .where('id', ecocertId)
                .update({
                processed_at: new Date()
            });
            if (result === 0) {
                throw new errors_1.DatabaseError(`Ecocert ${ecocertId} not found`, 'ECOCERT_NOT_FOUND', { ecocertId });
            }
            logger_1.logger.debug('Ecocert marked as processed', { ecocertId });
        }
        catch (error) {
            if (error instanceof errors_1.DatabaseError)
                throw error;
            logger_1.logger.error('Failed to mark ecocert as processed', { ecocertId, error });
            throw new errors_1.DatabaseError(`Failed to mark ecocert ${ecocertId} as processed`, 'ECOCERT_UPDATE_FAILED', { ecocertId, originalError: error });
        }
    }
    async insertAttestation(attestation) {
        this.ensureInitialized();
        try {
            await this.db.transaction(async (trx) => {
                const ecocertExists = await trx('ecocerts')
                    .where('id', attestation.ecocert_id)
                    .first();
                if (!ecocertExists) {
                    throw new errors_1.DatabaseError(`Ecocert ${attestation.ecocert_id} not found`, 'ECOCERT_NOT_FOUND', { ecocertId: attestation.ecocert_id });
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
            logger_1.logger.debug('Attestation inserted', {
                uid: attestation.uid,
                ecocertId: attestation.ecocert_id
            });
        }
        catch (error) {
            if (error instanceof errors_1.DatabaseError)
                throw error;
            logger_1.logger.error('Failed to insert attestation', {
                uid: attestation.uid,
                error
            });
            throw new errors_1.DatabaseError(`Failed to insert attestation ${attestation.uid}`, 'ATTESTATION_INSERT_FAILED', { uid: attestation.uid, originalError: error });
        }
    }
    async insertArchivedContent(content) {
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
            logger_1.logger.debug('Archived content record created', {
                id,
                ecocertId: content.ecocert_id,
                url: content.original_url
            });
            return id;
        }
        catch (error) {
            logger_1.logger.error('Failed to insert archived content', {
                ecocertId: content.ecocert_id,
                url: content.original_url,
                error
            });
            throw new errors_1.DatabaseError('Failed to insert archived content record', 'ARCHIVED_CONTENT_INSERT_FAILED', {
                ecocertId: content.ecocert_id,
                url: content.original_url,
                originalError: error
            });
        }
    }
    async updateArchiveStatus(id, status, errorMessage) {
        this.ensureInitialized();
        try {
            const updateData = { status };
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
                throw new errors_1.DatabaseError(`Archived content record ${id} not found`, 'ARCHIVED_CONTENT_NOT_FOUND', { id });
            }
            logger_1.logger.debug('Archive status updated', {
                id,
                status,
                hasError: !!errorMessage
            });
        }
        catch (error) {
            if (error instanceof errors_1.DatabaseError)
                throw error;
            logger_1.logger.error('Failed to update archive status', { id, status, error });
            throw new errors_1.DatabaseError(`Failed to update archive status for record ${id}`, 'ARCHIVE_STATUS_UPDATE_FAILED', { id, status, originalError: error });
        }
    }
    async getFailedArchives(limit = 50) {
        this.ensureInitialized();
        try {
            const maxRetries = 3;
            const retryDelayMinutes = 5;
            const failedArchives = await this.db('archived_content')
                .where('status', 'failed')
                .where('retry_count', '<', maxRetries)
                .where(function () {
                this.whereNull('last_retry_at')
                    .orWhere('last_retry_at', '<', new Date(Date.now() - retryDelayMinutes * 60 * 1000));
            })
                .orderBy('last_retry_at', 'asc')
                .limit(Math.min(limit, 200))
                .select('*');
            logger_1.logger.debug('Retrieved failed archives for retry', {
                count: failedArchives.length,
                limit
            });
            return failedArchives;
        }
        catch (error) {
            logger_1.logger.error('Failed to get failed archives', { limit, error });
            throw new errors_1.DatabaseError('Failed to retrieve failed archives', 'FAILED_ARCHIVES_QUERY_FAILED', { limit, originalError: error });
        }
    }
    async getArchivingStats() {
        this.ensureInitialized();
        try {
            const [ecocertStats, attestationStats, archiveStatusStats, overallStats] = await Promise.all([
                this.db('ecocerts')
                    .select(this.db.raw('COUNT(*) as total'), this.db.raw('COUNT(processed_at) as processed'))
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
                    .select(this.db.raw('COUNT(*) as total_urls'), this.db.raw('COUNT(DISTINCT ecocert_id) as ecocerts_with_content'))
                    .first()
            ]);
            const statusCounts = archiveStatusStats.reduce((acc, row) => {
                acc[row.status] = parseInt(String(row.count));
                return acc;
            }, {});
            const totalUrls = parseInt(overallStats.total_urls) || 0;
            const successfullyArchived = statusCounts.completed || 0;
            const failedArchives = statusCounts.failed || 0;
            const pendingArchives = Number(statusCounts.pending || 0) +
                Number(statusCounts.downloading || 0) +
                Number(statusCounts.uploading || 0);
            const stats = {
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
            logger_1.logger.debug('Archiving statistics calculated', stats);
            return stats;
        }
        catch (error) {
            logger_1.logger.error('Failed to calculate archiving statistics', { error });
            throw new errors_1.DatabaseError('Failed to calculate archiving statistics', 'STATS_CALCULATION_FAILED', { originalError: error });
        }
    }
    ensureInitialized() {
        if (!this.isInitialized) {
            throw new errors_1.DatabaseError('Database service not initialized', 'DB_NOT_INITIALIZED');
        }
    }
    async executeRaw(sql, bindings) {
        this.ensureInitialized();
        try {
            logger_1.logger.debug('Executing raw SQL', {
                sql: sql.substring(0, 200),
                bindingCount: bindings?.length || 0
            });
            const result = await this.db.raw(sql, bindings || []);
            return result.rows || result;
        }
        catch (error) {
            logger_1.logger.error('Raw SQL execution failed', { sql, error });
            throw new errors_1.DatabaseError('Raw SQL execution failed', 'RAW_SQL_FAILED', { sql, originalError: error });
        }
    }
}
exports.DatabaseService = DatabaseService;
//# sourceMappingURL=database.js.map