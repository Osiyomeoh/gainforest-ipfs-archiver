"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PinataIPFSService = void 0;
const sdk_1 = __importDefault(require("@pinata/sdk"));
const crypto_1 = require("crypto");
const mime_types_1 = __importDefault(require("mime-types"));
const stream_1 = require("stream");
const logger_1 = require("../utils/logger");
const constants_1 = require("../config/constants");
const errors_1 = require("../types/errors");
class PinataIPFSService {
    constructor() {
        this.isInitialized = false;
        this.validateConfiguration();
        this.initializePinata();
    }
    validateConfiguration() {
        if (!constants_1.PINATA_CONFIG.apiKey && !constants_1.PINATA_CONFIG.jwt) {
            throw new errors_1.IPFSError('Pinata API key or JWT is required', 'PINATA_CONFIG_MISSING');
        }
        if (!constants_1.PINATA_CONFIG.gateway) {
            throw new errors_1.IPFSError('Pinata gateway URL is required', 'PINATA_GATEWAY_MISSING');
        }
        logger_1.logger.info('Pinata configuration validated');
    }
    initializePinata() {
        try {
            if (constants_1.PINATA_CONFIG.jwt) {
                this.pinata = new sdk_1.default({ pinataJWTKey: constants_1.PINATA_CONFIG.jwt });
            }
            else {
                this.pinata = new sdk_1.default(constants_1.PINATA_CONFIG.apiKey, constants_1.PINATA_CONFIG.apiSecret);
            }
            this.isInitialized = true;
            logger_1.logger.info('Pinata SDK initialized successfully');
        }
        catch (error) {
            logger_1.logger.error('Failed to initialize Pinata SDK', { error });
            throw new errors_1.IPFSError('Failed to initialize Pinata SDK', 'PINATA_INIT_FAILED', { originalError: error });
        }
    }
    async healthCheck() {
        try {
            const result = await this.pinata.testAuthentication();
            logger_1.logger.debug('Pinata health check completed', { authenticated: result.authenticated });
            return result.authenticated;
        }
        catch (error) {
            logger_1.logger.error('Pinata health check failed', { error });
            return false;
        }
    }
    async upload(content, filename, metadata) {
        this.ensureInitialized();
        try {
            const validation = await this.validateContent(content, filename);
            if (!validation.isValid) {
                throw new errors_1.IPFSError(`Content validation failed: ${validation.errors.join(', ')}`, 'CONTENT_VALIDATION_FAILED', { filename, errors: validation.errors });
            }
            const contentHash = this.generateContentHash(content);
            const uploadMetadata = {
                ...constants_1.PINATA_CONFIG.pinataMetadata,
                name: `${filename}_${Date.now()}`,
                keyvalues: {
                    ...constants_1.PINATA_CONFIG.pinataMetadata.keyvalues,
                    originalFilename: filename,
                    contentHash,
                    uploadedAt: new Date().toISOString(),
                    fileSize: content.length.toString(),
                    contentType: metadata?.contentType || mime_types_1.default.lookup(filename) || 'application/octet-stream'
                }
            };
            logger_1.logger.info('Starting IPFS upload to Pinata', {
                filename,
                size: content.length,
                contentType: uploadMetadata.keyvalues.contentType
            });
            const uploadStartTime = Date.now();
            const result = await this.pinata.pinFileToIPFS(stream_1.Readable.from(content), {
                pinataMetadata: uploadMetadata,
                pinataOptions: constants_1.PINATA_CONFIG.pinataOptions
            });
            const uploadDuration = Date.now() - uploadStartTime;
            const gatewayUrl = `${constants_1.PINATA_CONFIG.gateway}/ipfs/${result.IpfsHash}`;
            const uploadResult = {
                hash: result.IpfsHash,
                size: content.length,
                url: gatewayUrl,
                uploadedAt: new Date()
            };
            logger_1.logger.info('IPFS upload completed successfully', {
                filename,
                hash: result.IpfsHash,
                size: content.length,
                duration: uploadDuration,
                url: gatewayUrl
            });
            return uploadResult;
        }
        catch (error) {
            logger_1.logger.error('IPFS upload failed', {
                filename,
                size: content.length,
                error: error instanceof Error ? error.message : String(error)
            });
            throw new errors_1.IPFSError(`Failed to upload ${filename} to IPFS`, 'IPFS_UPLOAD_FAILED', { filename, size: content.length, originalError: error });
        }
    }
    async pin(hash) {
        this.ensureInitialized();
        try {
            logger_1.logger.info('Pinning content to Pinata', { hash });
            await this.pinata.pinByHash(hash, {
                pinataMetadata: {
                    ...constants_1.PINATA_CONFIG.pinataMetadata,
                    name: `pinned_${hash}`,
                    keyvalues: {
                        ...constants_1.PINATA_CONFIG.pinataMetadata.keyvalues,
                        pinnedAt: new Date().toISOString(),
                        pinType: 'manual'
                    }
                }
            });
            logger_1.logger.info('Content pinned successfully', { hash });
        }
        catch (error) {
            logger_1.logger.error('Failed to pin content', { hash, error });
            throw new errors_1.IPFSError(`Failed to pin content ${hash}`, 'IPFS_PIN_FAILED', { hash, originalError: error });
        }
    }
    async checkPinStatus(hash) {
        this.ensureInitialized();
        try {
            const pinList = await this.pinata.pinList({
                hashContains: hash,
                status: 'pinned',
                pageLimit: 1
            });
            const isPinned = pinList.count > 0;
            const pinInfo = pinList.rows[0];
            return {
                hash,
                isPinned,
                ...(isPinned && pinInfo.date_pinned && {
                    pinDate: new Date(pinInfo.date_pinned),
                    nodeId: 'pinata'
                })
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to check pin status', { hash, error });
            return {
                hash,
                isPinned: false
            };
        }
    }
    async getPinInfo(hash) {
        this.ensureInitialized();
        try {
            const pinList = await this.pinata.pinList({
                hashContains: hash,
                pageLimit: 1
            });
            if (pinList.count === 0) {
                throw new errors_1.IPFSError(`Content ${hash} not found on Pinata`, 'CONTENT_NOT_FOUND', { hash });
            }
            return pinList.rows[0];
        }
        catch (error) {
            logger_1.logger.error('Failed to get pin info', { hash, error });
            throw new errors_1.IPFSError(`Failed to get pin info for ${hash}`, 'PIN_INFO_FAILED', { hash, originalError: error });
        }
    }
    async unpin(hash) {
        this.ensureInitialized();
        try {
            logger_1.logger.warn('Unpinning content from Pinata', { hash });
            await this.pinata.unpin(hash);
            logger_1.logger.warn('Content unpinned successfully', { hash });
        }
        catch (error) {
            logger_1.logger.error('Failed to unpin content', { hash, error });
            throw new errors_1.IPFSError(`Failed to unpin content ${hash}`, 'IPFS_UNPIN_FAILED', { hash, originalError: error });
        }
    }
    async getUsageStats() {
        this.ensureInitialized();
        try {
            const pinList = await this.pinata.pinList({
                status: 'pinned',
                pageLimit: 1000,
                pageOffset: 0
            });
            const stats = {
                totalPins: pinList.count,
                totalSize: pinList.rows.reduce((sum, pin) => sum + parseInt(pin.size), 0),
                lastUpdated: new Date()
            };
            logger_1.logger.info('Pinata usage stats retrieved', stats);
            return stats;
        }
        catch (error) {
            logger_1.logger.error('Failed to get usage stats', { error });
            throw new errors_1.IPFSError('Failed to get Pinata usage stats', 'USAGE_STATS_FAILED', { originalError: error });
        }
    }
    async validateContent(content, filename) {
        const errors = [];
        const warnings = [];
        const maxFileSize = constants_1.CONTENT_VALIDATION.maxFileSizeMB * 1024 * 1024;
        if (content.length > maxFileSize) {
            errors.push(`File size ${content.length} exceeds maximum ${maxFileSize}`);
        }
        const extension = filename.toLowerCase().match(/\.[^.]+$/)?.[0];
        if (extension && !constants_1.CONTENT_VALIDATION.allowedExtensions.includes(extension)) {
            errors.push(`File extension ${extension} is not allowed`);
        }
        const detectedMimeType = mime_types_1.default.lookup(filename);
        if (constants_1.CONTENT_VALIDATION.requireHttps && detectedMimeType) {
            if (!constants_1.CONTENT_VALIDATION.allowedMimeTypes.includes(detectedMimeType)) {
                errors.push(`Content type ${detectedMimeType} is not allowed`);
            }
        }
        if (constants_1.CONTENT_VALIDATION.scanForMalware) {
            const contentString = content.toString('utf8', 0, Math.min(1024, content.length));
            const suspiciousPatterns = ['<script', 'javascript:', 'eval(', 'document.write'];
            for (const pattern of suspiciousPatterns) {
                if (contentString.toLowerCase().includes(pattern)) {
                    warnings.push(`Suspicious content pattern detected: ${pattern}`);
                }
            }
        }
        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            metadata: {
                originalUrl: '',
                contentType: detectedMimeType || 'application/octet-stream',
                fileSize: content.length,
                ...(extension && { fileExtension: extension }),
                contentHash: this.generateContentHash(content),
                downloadedAt: new Date()
            }
        };
    }
    generateContentHash(content) {
        return (0, crypto_1.createHash)('sha256').update(content).digest('hex');
    }
    ensureInitialized() {
        if (!this.isInitialized) {
            throw new errors_1.IPFSError('Pinata IPFS service not initialized', 'SERVICE_NOT_INITIALIZED');
        }
    }
    async uploadBatch(files) {
        this.ensureInitialized();
        const results = [];
        const errors = [];
        logger_1.logger.info('Starting batch upload to Pinata', { fileCount: files.length });
        const maxConcurrent = parseInt(process.env.MAX_CONCURRENT_UPLOADS || '3');
        for (let i = 0; i < files.length; i += maxConcurrent) {
            const batch = files.slice(i, i + maxConcurrent);
            const batchPromises = batch.map(async (file) => {
                try {
                    const result = await this.upload(file.content, file.filename, file.metadata);
                    results.push(result);
                    return result;
                }
                catch (error) {
                    errors.push(error);
                    logger_1.logger.error('Batch upload item failed', {
                        filename: file.filename,
                        error: error instanceof Error ? error.message : String(error)
                    });
                    throw error;
                }
            });
            try {
                await Promise.all(batchPromises);
                logger_1.logger.debug('Batch completed', {
                    batchIndex: Math.floor(i / maxConcurrent) + 1,
                    filesInBatch: batch.length
                });
            }
            catch (error) {
                logger_1.logger.warn('Some files in batch failed', {
                    batchIndex: Math.floor(i / maxConcurrent) + 1
                });
            }
        }
        logger_1.logger.info('Batch upload completed', {
            totalFiles: files.length,
            successful: results.length,
            failed: errors.length
        });
        if (errors.length > 0 && results.length === 0) {
            throw new errors_1.IPFSError('All files in batch upload failed', 'BATCH_UPLOAD_FAILED', { totalFiles: files.length, errors });
        }
        return results;
    }
}
exports.PinataIPFSService = PinataIPFSService;
//# sourceMappingURL=ipfs.js.map