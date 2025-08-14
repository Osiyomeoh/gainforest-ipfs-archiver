"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EcocertService = void 0;
const sampleEcocerts_1 = require("../data/sampleEcocerts");
const mockAttestations_1 = require("../data/mockAttestations");
const ipfs_1 = require("./ipfs");
const contentDownloader_1 = require("./contentDownloader");
const database_1 = require("./database");
const logger_1 = require("../utils/logger");
class EcocertService {
    constructor() {
        this.ipfsService = new ipfs_1.PinataIPFSService();
        this.contentDownloader = new contentDownloader_1.ContentDownloader();
        this.databaseService = database_1.DatabaseService.getInstance();
    }
    async initialize() {
        logger_1.logger.info('Initializing EcocertService');
        const ipfsHealthy = await this.ipfsService.healthCheck();
        if (!ipfsHealthy) {
            throw new Error('IPFS service is not available');
        }
        await this.databaseService.initialize();
        logger_1.logger.info('EcocertService initialized successfully');
    }
    parseEcocertId(ecocertId) {
        const parts = ecocertId.split('-');
        if (parts.length !== 3) {
            throw new Error(`Invalid ecocert ID format: ${ecocertId}`);
        }
        if (!/^\d+$/.test(parts[0])) {
            throw new Error(`Invalid chain ID in ecocert ID: ${parts[0]}`);
        }
        if (!/^0x[a-fA-F0-9]{40}$/.test(parts[1])) {
            throw new Error(`Invalid contract address in ecocert ID: ${parts[1]}`);
        }
        if (!/^\d+$/.test(parts[2])) {
            throw new Error(`Invalid token ID in ecocert ID: ${parts[2]}`);
        }
        return {
            chainId: parts[0],
            contractAddress: parts[1],
            tokenId: parts[2],
            fullId: ecocertId
        };
    }
    getSampleEcocertIds() {
        return Object.freeze([...sampleEcocerts_1.SAMPLE_ECOCERT_IDS]);
    }
    async fetchAttestations(ecocertId) {
        try {
            this.parseEcocertId(ecocertId);
            await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
            const attestations = mockAttestations_1.MOCK_ATTESTATIONS[ecocertId] || [];
            logger_1.logger.debug('Fetched attestations', {
                ecocertId,
                attestationCount: attestations.length
            });
            return Object.freeze(attestations);
        }
        catch (error) {
            logger_1.logger.error('Failed to fetch attestations', { ecocertId, error });
            throw error;
        }
    }
    extractExternalUrls(attestations) {
        const urls = new Set();
        for (const attestation of attestations) {
            for (const source of attestation.data.sources) {
                if (source.type === 'url' && this.isValidUrl(source.src)) {
                    urls.add(source.src);
                }
            }
        }
        const urlArray = Array.from(urls);
        logger_1.logger.debug('Extracted URLs from attestations', {
            attestationCount: attestations.length,
            urlCount: urlArray.length,
            urls: urlArray
        });
        return Object.freeze(urlArray);
    }
    async processEcocert(ecocertId) {
        const startTime = Date.now();
        const errors = [];
        let attestationsFound = 0;
        let urlsExtracted = 0;
        let successfullyArchived = 0;
        try {
            logger_1.logger.info('Starting ecocert processing', { ecocertId });
            const parsedId = this.parseEcocertId(ecocertId);
            await this.databaseService.insertEcocert({
                id: ecocertId,
                chain_id: parsedId.chainId,
                contract_address: parsedId.contractAddress,
                token_id: parsedId.tokenId,
                title: `Ecocert ${parsedId.tokenId.slice(-8)}`,
                description: 'Environmental impact proof of concept'
            });
            const attestations = await this.fetchAttestations(ecocertId);
            attestationsFound = attestations.length;
            if (attestations.length === 0) {
                logger_1.logger.warn('No attestations found for ecocert', { ecocertId });
                await this.databaseService.markEcocertProcessed(ecocertId);
                return {
                    ecocertId,
                    status: 'completed',
                    attestationsFound: 0,
                    urlsExtracted: 0,
                    successfullyArchived: 0,
                    errors: ['No attestations found'],
                    processedAt: new Date()
                };
            }
            for (const attestation of attestations) {
                try {
                    await this.databaseService.insertAttestation({
                        uid: attestation.uid,
                        ecocert_id: ecocertId,
                        schema_uid: attestation.schema_uid,
                        attester: attestation.attester,
                        data: attestation.data,
                        creation_block_timestamp: attestation.creationBlockTimestamp
                    });
                }
                catch (error) {
                    logger_1.logger.error('Failed to store attestation', {
                        uid: attestation.uid,
                        error: error instanceof Error ? error.message : String(error)
                    });
                    errors.push(`Failed to store attestation ${attestation.uid}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
            const urls = this.extractExternalUrls(attestations);
            urlsExtracted = urls.length;
            if (urls.length === 0) {
                logger_1.logger.warn('No URLs found in attestations', { ecocertId });
                await this.databaseService.markEcocertProcessed(ecocertId);
                return {
                    ecocertId,
                    status: 'completed',
                    attestationsFound,
                    urlsExtracted: 0,
                    successfullyArchived: 0,
                    errors: ['No URLs found in attestations'],
                    processedAt: new Date()
                };
            }
            for (const url of urls) {
                try {
                    await this.processUrl(ecocertId, attestations[0].uid, url);
                    successfullyArchived++;
                }
                catch (error) {
                    const errorMessage = `Failed to process URL ${url}: ${error instanceof Error ? error.message : String(error)}`;
                    logger_1.logger.error('URL processing failed', { url, ecocertId, error });
                    errors.push(errorMessage);
                }
            }
            await this.databaseService.markEcocertProcessed(ecocertId);
            const duration = Date.now() - startTime;
            const status = errors.length === 0 ? 'completed' :
                successfullyArchived > 0 ? 'completed' : 'failed';
            logger_1.logger.info('Ecocert processing completed', {
                ecocertId,
                status,
                attestationsFound,
                urlsExtracted,
                successfullyArchived,
                errorCount: errors.length,
                duration
            });
            return {
                ecocertId,
                status,
                attestationsFound,
                urlsExtracted,
                successfullyArchived,
                errors: Object.freeze(errors),
                processedAt: new Date()
            };
        }
        catch (error) {
            logger_1.logger.error('Ecocert processing failed', { ecocertId, error });
            errors.push(`Processing failed: ${error instanceof Error ? error.message : String(error)}`);
            return {
                ecocertId,
                status: 'failed',
                attestationsFound,
                urlsExtracted,
                successfullyArchived,
                errors: Object.freeze(errors),
                processedAt: new Date()
            };
        }
    }
    async processUrl(ecocertId, attestationUid, url) {
        logger_1.logger.info('Processing URL', { ecocertId, url });
        const archiveId = await this.databaseService.insertArchivedContent({
            ecocert_id: ecocertId,
            attestation_uid: attestationUid,
            original_url: url,
            content_type: 'unknown',
            ipfs_hash: '',
            ipfs_url: '',
            status: 'pending'
        });
        try {
            await this.databaseService.updateArchiveStatus(archiveId, 'downloading');
            const downloadResult = await this.contentDownloader.downloadContent(url);
            logger_1.logger.info('Content downloaded successfully', {
                url,
                size: downloadResult.content.length,
                contentType: downloadResult.metadata.contentType
            });
            await this.databaseService.updateArchiveStatus(archiveId, 'uploading');
            const filename = this.generateFilename(url, downloadResult.metadata.contentType);
            const ipfsResult = await this.ipfsService.upload(downloadResult.content, filename, downloadResult.metadata);
            logger_1.logger.info('Content uploaded to IPFS', {
                url,
                ipfsHash: ipfsResult.hash,
                ipfsUrl: ipfsResult.url
            });
            await this.databaseService.executeRaw(`UPDATE archived_content 
         SET status = ?, content_type = ?, file_extension = ?, 
             ipfs_hash = ?, ipfs_url = ?, file_size = ?, content_hash = ?
         WHERE id = ?`, [
                'completed',
                downloadResult.metadata.contentType,
                downloadResult.metadata.fileExtension,
                ipfsResult.hash,
                ipfsResult.url,
                downloadResult.metadata.fileSize,
                downloadResult.metadata.contentHash,
                archiveId
            ]);
            logger_1.logger.info('URL processing completed successfully', {
                url,
                ecocertId,
                ipfsHash: ipfsResult.hash
            });
        }
        catch (error) {
            logger_1.logger.error('URL processing failed', { url, ecocertId, error });
            await this.databaseService.updateArchiveStatus(archiveId, 'failed', error instanceof Error ? error.message : String(error));
            throw error;
        }
    }
    generateFilename(url, contentType) {
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;
            const pathParts = pathname.split('/');
            let filename = pathParts[pathParts.length - 1] || 'content';
            filename = filename.split('?')[0].split('#')[0];
            if (!filename.includes('.')) {
                const extension = this.getExtensionFromContentType(contentType);
                filename += extension;
            }
            filename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
            const timestamp = Date.now();
            const parts = filename.split('.');
            if (parts.length > 1) {
                const extension = parts.pop();
                const base = parts.join('.');
                filename = `${base}_${timestamp}.${extension}`;
            }
            else {
                filename = `${filename}_${timestamp}`;
            }
            return filename;
        }
        catch (error) {
            const timestamp = Date.now();
            const extension = this.getExtensionFromContentType(contentType);
            return `content_${timestamp}${extension}`;
        }
    }
    getExtensionFromContentType(contentType) {
        const typeMap = {
            'text/html': '.html',
            'application/pdf': '.pdf',
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/gif': '.gif',
            'video/mp4': '.mp4',
            'application/json': '.json',
            'text/plain': '.txt',
            'text/csv': '.csv'
        };
        const baseType = contentType.split(';')[0].toLowerCase();
        return typeMap[baseType] || '.bin';
    }
    isValidUrl(url) {
        try {
            const urlObj = new URL(url);
            return ['http:', 'https:'].includes(urlObj.protocol);
        }
        catch {
            return false;
        }
    }
    async processBatch(ecocertIds) {
        const maxConcurrent = parseInt(process.env.MAX_CONCURRENT_ECOCERTS || '2');
        const results = [];
        logger_1.logger.info('Starting ecocert batch processing', {
            ecocertCount: ecocertIds.length,
            maxConcurrent
        });
        for (let i = 0; i < ecocertIds.length; i += maxConcurrent) {
            const batch = ecocertIds.slice(i, i + maxConcurrent);
            const batchPromises = batch.map(ecocertId => this.processEcocert(ecocertId));
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
            logger_1.logger.info('Batch processing completed', {
                batchIndex: Math.floor(i / maxConcurrent) + 1,
                ecocartsInBatch: batch.length,
                completed: batchResults.filter(r => r.status === 'completed').length,
                failed: batchResults.filter(r => r.status === 'failed').length
            });
        }
        const summary = {
            total: results.length,
            completed: results.filter(r => r.status === 'completed').length,
            failed: results.filter(r => r.status === 'failed').length,
            totalUrls: results.reduce((sum, r) => sum + r.urlsExtracted, 0),
            totalArchived: results.reduce((sum, r) => sum + r.successfullyArchived, 0)
        };
        logger_1.logger.info('Batch processing summary', summary);
        return results;
    }
}
exports.EcocertService = EcocertService;
//# sourceMappingURL=ecocertService.js.map