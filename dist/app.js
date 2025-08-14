"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GainForestArchiver = void 0;
const events_1 = require("events");
const database_1 = require("./services/database");
const ecocertService_1 = require("./services/ecocertService");
const contentDownloader_1 = require("./services/contentDownloader");
const logger_1 = require("./utils/logger");
const errors_1 = require("./types/errors");
class GainForestArchiver extends events_1.EventEmitter {
    constructor(_config) {
        super();
        this._config = _config;
        this.isInitialized = false;
        this.isShuttingDown = false;
        this.processingPromises = new Set();
        this.databaseService = database_1.DatabaseService.getInstance();
        this.ecocertService = new ecocertService_1.EcocertService();
        this.contentDownloader = new contentDownloader_1.ContentDownloader();
        this.setupSignalHandlers();
        logger_1.logger.info('GainForest Archiver initialized', {
            environment: this._config.environment,
            version: process.env.npm_package_version || '1.0.0'
        });
    }
    async initialize() {
        if (this.isInitialized) {
            logger_1.logger.warn('Application already initialized');
            return;
        }
        try {
            logger_1.logger.info('Initializing GainForest Archiver services...');
            await this.databaseService.initialize();
            this.emit('service:database:ready');
            await this.ecocertService.initialize();
            this.emit('service:ecocert:ready');
            await this.performHealthChecks();
            this.isInitialized = true;
            this.emit('app:ready');
            logger_1.logger.info('GainForest Archiver initialization completed successfully');
        }
        catch (error) {
            logger_1.logger.error('Application initialization failed', { error });
            this.emit('app:error', error);
            throw error;
        }
    }
    async performHealthChecks() {
        const healthChecks = {
            database: false,
            ipfs: false
        };
        try {
            const dbHealth = await this.databaseService.healthCheck();
            healthChecks.database = dbHealth.connection;
            healthChecks.ipfs = true;
            logger_1.logger.info('Health checks completed', healthChecks);
            this.emit('health:check', healthChecks);
            return healthChecks;
        }
        catch (error) {
            logger_1.logger.error('Health check failed', { error });
            this.emit('health:error', error);
            throw error;
        }
    }
    async processAllEcocerts() {
        this.ensureInitialized();
        this.ensureNotShuttingDown();
        const startTime = Date.now();
        logger_1.logger.info('Starting processing of all sample ecocerts');
        try {
            const ecocertIds = this.ecocertService.getSampleEcocertIds();
            logger_1.logger.info('Retrieved sample ecocert IDs', { count: ecocertIds.length });
            const processingPromise = this.ecocertService.processBatch([...ecocertIds]);
            this.processingPromises.add(processingPromise);
            this.emit('processing:started', { ecocertIds });
            try {
                const results = await processingPromise;
                const summary = this.generateProcessingSummary(results, startTime);
                this.emit('processing:completed', { results, summary });
                logger_1.logger.info('All ecocerts processing completed', summary);
                return { results, summary };
            }
            finally {
                this.processingPromises.delete(processingPromise);
            }
        }
        catch (error) {
            logger_1.logger.error('Ecocert processing failed', { error });
            this.emit('processing:error', error);
            throw error;
        }
    }
    async processSpecificEcocerts(ecocertIds) {
        this.ensureInitialized();
        this.ensureNotShuttingDown();
        const validIds = [];
        const invalidIds = [];
        for (const id of ecocertIds) {
            try {
                this.ecocertService.parseEcocertId(id);
                validIds.push(id);
            }
            catch (error) {
                invalidIds.push(id);
                logger_1.logger.warn('Invalid ecocert ID provided', { id, error: error instanceof Error ? error.message : String(error) });
            }
        }
        if (invalidIds.length > 0) {
            this.emit('validation:error', { invalidIds });
        }
        if (validIds.length === 0) {
            throw new errors_1.DatabaseError('No valid ecocert IDs provided', 'NO_VALID_ECOCERTS');
        }
        const startTime = Date.now();
        logger_1.logger.info('Starting processing of specific ecocerts', {
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
                logger_1.logger.info('Specific ecocerts processing completed', summary);
                return { results, summary };
            }
            finally {
                this.processingPromises.delete(processingPromise);
            }
        }
        catch (error) {
            logger_1.logger.error('Specific ecocerts processing failed', { error });
            this.emit('processing:error', error);
            throw error;
        }
    }
    async getArchivingStatistics() {
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
        }
        catch (error) {
            logger_1.logger.error('Failed to get archiving statistics', { error });
            this.emit('stats:error', error);
            throw error;
        }
    }
    async retryFailedArchives(limit = 50) {
        this.ensureInitialized();
        this.ensureNotShuttingDown();
        logger_1.logger.info('Starting retry of failed archives', { limit });
        try {
            const failedArchives = await this.databaseService.getFailedArchives(limit);
            if (failedArchives.length === 0) {
                logger_1.logger.info('No failed archives found for retry');
                return { attempted: 0, successful: 0, stillFailed: 0 };
            }
            logger_1.logger.info('Found failed archives for retry', { count: failedArchives.length });
            let successful = 0;
            let stillFailed = 0;
            const archivesByEcocert = failedArchives.reduce((acc, archive) => {
                if (!acc[archive.ecocert_id]) {
                    acc[archive.ecocert_id] = [];
                }
                acc[archive.ecocert_id].push(archive);
                return acc;
            }, {});
            for (const [ecocertId, archives] of Object.entries(archivesByEcocert)) {
                logger_1.logger.info('Retrying failed archives for ecocert', {
                    ecocertId,
                    archiveCount: archives.length
                });
                for (const archive of archives) {
                    try {
                        await this.retryArchiveRecord(archive);
                        successful++;
                        logger_1.logger.info('Archive retry successful', {
                            archiveId: archive.id,
                            url: archive.original_url
                        });
                    }
                    catch (error) {
                        stillFailed++;
                        logger_1.logger.error('Archive retry failed', {
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
            logger_1.logger.info('Failed archives retry completed', result);
            this.emit('retry:completed', result);
            return result;
        }
        catch (error) {
            logger_1.logger.error('Failed archives retry process failed', { error });
            this.emit('retry:error', error);
            throw error;
        }
    }
    async retryArchiveRecord(archive) {
        await this.databaseService.updateArchiveStatus(archive.id, 'downloading');
        try {
            const downloadResult = await this.contentDownloader.downloadContent(archive.original_url);
            await this.databaseService.updateArchiveStatus(archive.id, 'uploading');
            const filename = `retry_${Date.now()}_${archive.id}${downloadResult.metadata.fileExtension || '.bin'}`;
            const ipfsService = new (require('./services/ipfs').PinataIPFSService)();
            const ipfsResult = await ipfsService.upload(downloadResult.content, filename, downloadResult.metadata);
            await this.databaseService.executeRaw(`UPDATE archived_content 
         SET status = ?, content_type = ?, file_extension = ?, 
             ipfs_hash = ?, ipfs_url = ?, file_size = ?, content_hash = ?,
             error_message = NULL
         WHERE id = ?`, [
                'completed',
                downloadResult.metadata.contentType,
                downloadResult.metadata.fileExtension,
                ipfsResult.hash,
                ipfsResult.url,
                downloadResult.metadata.fileSize,
                downloadResult.metadata.contentHash,
                archive.id
            ]);
        }
        catch (error) {
            await this.databaseService.updateArchiveStatus(archive.id, 'failed', `Retry failed: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
    async shutdown() {
        if (this.isShuttingDown) {
            logger_1.logger.warn('Shutdown already in progress');
            return;
        }
        this.isShuttingDown = true;
        logger_1.logger.info('Starting graceful shutdown...');
        try {
            this.emit('shutdown:started');
            if (this.processingPromises.size > 0) {
                logger_1.logger.info('Waiting for ongoing processing to complete', {
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
                    logger_1.logger.info('All processing completed before shutdown');
                }
                catch (error) {
                    logger_1.logger.warn('Shutdown timeout reached, forcing cleanup', { error: error instanceof Error ? error.message : String(error) });
                }
            }
            await this.contentDownloader.cleanup();
            await this.databaseService.destroy();
            this.emit('shutdown:completed');
            logger_1.logger.info('Graceful shutdown completed');
        }
        catch (error) {
            logger_1.logger.error('Error during shutdown', { error });
            this.emit('shutdown:error', error);
            throw error;
        }
    }
    generateProcessingSummary(results, startTime) {
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
    setupSignalHandlers() {
        const signals = ['SIGTERM', 'SIGINT', 'SIGHUP'];
        signals.forEach(signal => {
            process.on(signal, async () => {
                logger_1.logger.info(`Received ${signal}, initiating graceful shutdown`);
                try {
                    await this.shutdown();
                    process.exit(0);
                }
                catch (error) {
                    logger_1.logger.error('Graceful shutdown failed', { error });
                    process.exit(1);
                }
            });
        });
        process.on('uncaughtException', (error) => {
            logger_1.logger.error('Uncaught exception', { error });
            this.emit('error:uncaught', error);
            process.exit(1);
        });
        process.on('unhandledRejection', (reason, promise) => {
            logger_1.logger.error('Unhandled rejection', { reason, promise });
            this.emit('error:unhandled-rejection', reason);
            process.exit(1);
        });
    }
    ensureInitialized() {
        if (!this.isInitialized) {
            throw new errors_1.DatabaseError('Application not initialized', 'APP_NOT_INITIALIZED');
        }
    }
    ensureNotShuttingDown() {
        if (this.isShuttingDown) {
            throw new errors_1.DatabaseError('Application is shutting down', 'APP_SHUTTING_DOWN');
        }
    }
}
exports.GainForestArchiver = GainForestArchiver;
//# sourceMappingURL=app.js.map