"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentDownloader = void 0;
const axios_1 = __importDefault(require("axios"));
const fs_1 = require("fs");
const path_1 = require("path");
const crypto_1 = require("crypto");
const mime_types_1 = __importDefault(require("mime-types"));
const logger_1 = require("../utils/logger");
const errors_1 = require("../types/errors");
class ContentDownloader {
    constructor() {
        this.downloadDirectory = process.env.DOWNLOAD_DIRECTORY || './temp/downloads';
        this.maxFileSize = parseInt(process.env.MAX_FILE_SIZE_MB || '100') * 1024 * 1024;
        this.timeout = parseInt(process.env.REQUEST_TIMEOUT_MS || '30000');
        this.ensureDownloadDirectory();
    }
    async ensureDownloadDirectory() {
        try {
            await fs_1.promises.mkdir(this.downloadDirectory, { recursive: true });
            logger_1.logger.debug('Download directory ensured', { path: this.downloadDirectory });
        }
        catch (error) {
            logger_1.logger.error('Failed to create download directory', {
                path: this.downloadDirectory,
                error
            });
            throw new errors_1.ContentError('Failed to create download directory', 'DOWNLOAD_DIR_FAILED', undefined, { path: this.downloadDirectory, originalError: error });
        }
    }
    async downloadContent(url) {
        try {
            logger_1.logger.info('Starting content download', { url });
            this.validateUrl(url);
            const tempFilename = `download_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const tempPath = (0, path_1.join)(this.downloadDirectory, tempFilename);
            const response = await (0, axios_1.default)({
                method: 'GET',
                url,
                responseType: 'stream',
                timeout: this.timeout,
                validateStatus: (status) => status >= 200 && status < 300,
                headers: {
                    'User-Agent': 'GainForest-Archiver/1.0'
                }
            });
            this.validateResponse(response, url);
            const content = await this.streamDownload(response, tempPath, url);
            const metadata = this.generateMetadata(url, response, content);
            try {
                await fs_1.promises.unlink(tempPath);
            }
            catch (cleanupError) {
                logger_1.logger.warn('Failed to cleanup temp file', {
                    path: tempPath,
                    error: cleanupError
                });
            }
            logger_1.logger.info('Content download completed', {
                url,
                size: content.length,
                contentType: metadata.contentType
            });
            return {
                content,
                metadata,
                httpStatus: response.status,
                headers: response.headers
            };
        }
        catch (error) {
            logger_1.logger.error('Content download failed', { url, error: error instanceof Error ? error.message : String(error) });
            if (error instanceof errors_1.ContentError) {
                throw error;
            }
            throw new errors_1.ContentError(`Failed to download content from ${url}`, 'DOWNLOAD_FAILED', url, { originalError: error });
        }
    }
    async streamDownload(response, tempPath, url) {
        return new Promise((resolve, reject) => {
            const writer = (0, fs_1.createWriteStream)(tempPath);
            let downloadedSize = 0;
            response.data.on('data', (chunk) => {
                downloadedSize += chunk.length;
                if (downloadedSize > this.maxFileSize) {
                    writer.destroy();
                    reject(new errors_1.ContentError(`File size exceeds limit of ${this.maxFileSize} bytes`, 'FILE_TOO_LARGE', url, { downloadedSize, maxSize: this.maxFileSize }));
                    return;
                }
            });
            response.data.on('error', (error) => {
                writer.destroy();
                reject(new errors_1.ContentError('Download stream error', 'STREAM_ERROR', url, { originalError: error }));
            });
            writer.on('error', (error) => {
                reject(new errors_1.ContentError('File write error', 'WRITE_ERROR', url, { tempPath, originalError: error }));
            });
            writer.on('finish', async () => {
                try {
                    const content = await fs_1.promises.readFile(tempPath);
                    resolve(content);
                }
                catch (error) {
                    reject(new errors_1.ContentError('Failed to read downloaded file', 'READ_ERROR', url, { tempPath, originalError: error }));
                }
            });
            response.data.pipe(writer);
        });
    }
    validateUrl(url) {
        try {
            const parsedUrl = new URL(url);
            if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
                throw new errors_1.ContentError(`Unsupported protocol: ${parsedUrl.protocol}`, 'INVALID_PROTOCOL', url);
            }
            if (process.env.NODE_ENV === 'production' && parsedUrl.protocol !== 'https:') {
                throw new errors_1.ContentError('HTTPS required in production', 'HTTPS_REQUIRED', url);
            }
            const hostname = parsedUrl.hostname.toLowerCase();
            const privatePatterns = [
                /^localhost$/,
                /^127\./,
                /^10\./,
                /^172\.(1[6-9]|2[0-9]|3[01])\./,
                /^192\.168\./,
                /^169\.254\./,
                /^::1$/,
                /^fc00:/
            ];
            if (privatePatterns.some(pattern => pattern.test(hostname))) {
                throw new errors_1.ContentError('Private/local addresses not allowed', 'PRIVATE_ADDRESS_BLOCKED', url);
            }
        }
        catch (error) {
            if (error instanceof errors_1.ContentError) {
                throw error;
            }
            throw new errors_1.ContentError(`Invalid URL: ${url}`, 'INVALID_URL', url, { originalError: error });
        }
    }
    validateResponse(response, url) {
        const contentLength = response.headers['content-length'];
        if (contentLength && parseInt(contentLength) > this.maxFileSize) {
            throw new errors_1.ContentError(`Content-Length ${contentLength} exceeds maximum ${this.maxFileSize}`, 'CONTENT_TOO_LARGE', url, { contentLength: parseInt(contentLength), maxSize: this.maxFileSize });
        }
        const contentType = response.headers['content-type'];
        if (!contentType) {
            logger_1.logger.warn('No content-type header', { url });
        }
        logger_1.logger.debug('Response validated', {
            url,
            status: response.status,
            contentType,
            contentLength
        });
    }
    generateMetadata(url, response, content) {
        const contentType = response.headers['content-type'] ||
            mime_types_1.default.lookup(url) ||
            'application/octet-stream';
        let fileExtension;
        const urlExtension = url.match(/\.([^./?#]+)(?:[?#]|$)/)?.[1];
        if (urlExtension) {
            fileExtension = `.${urlExtension.toLowerCase()}`;
        }
        else {
            fileExtension = mime_types_1.default.extension(contentType.split(';')[0]) || undefined;
            if (fileExtension) {
                fileExtension = `.${fileExtension}`;
            }
        }
        const contentHash = (0, crypto_1.createHash)('sha256').update(content).digest('hex');
        return {
            originalUrl: url,
            contentType: contentType.split(';')[0],
            fileSize: content.length,
            ...(fileExtension && { fileExtension }),
            contentHash,
            downloadedAt: new Date()
        };
    }
    async downloadBatch(urls) {
        const maxConcurrent = parseInt(process.env.MAX_CONCURRENT_DOWNLOADS || '5');
        const results = [];
        logger_1.logger.info('Starting batch download', {
            urlCount: urls.length,
            maxConcurrent
        });
        for (let i = 0; i < urls.length; i += maxConcurrent) {
            const batch = urls.slice(i, i + maxConcurrent);
            const batchPromises = batch.map(async (url) => {
                try {
                    return await this.downloadContent(url);
                }
                catch (error) {
                    logger_1.logger.error('Batch download item failed', { url, error: error instanceof Error ? error.message : String(error) });
                    return error instanceof Error ? error : new Error(String(error));
                }
            });
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
            logger_1.logger.debug('Download batch completed', {
                batchIndex: Math.floor(i / maxConcurrent) + 1,
                urlsInBatch: batch.length,
                successful: batchResults.filter(r => !(r instanceof Error)).length,
                failed: batchResults.filter(r => r instanceof Error).length
            });
        }
        const successful = results.filter(r => !(r instanceof Error)).length;
        const failed = results.filter(r => r instanceof Error).length;
        logger_1.logger.info('Batch download completed', {
            totalUrls: urls.length,
            successful,
            failed,
            successRate: (successful / urls.length) * 100
        });
        return results;
    }
    async cleanup() {
        try {
            const files = await fs_1.promises.readdir(this.downloadDirectory);
            const oldFiles = files.filter(file => {
                const match = file.match(/^download_(\d+)_/);
                if (!match)
                    return false;
                const timestamp = parseInt(match[1]);
                const age = Date.now() - timestamp;
                const maxAge = 60 * 60 * 1000;
                return age > maxAge;
            });
            for (const file of oldFiles) {
                const filePath = (0, path_1.join)(this.downloadDirectory, file);
                try {
                    await fs_1.promises.unlink(filePath);
                    logger_1.logger.debug('Cleaned up old temp file', { file });
                }
                catch (error) {
                    logger_1.logger.warn('Failed to cleanup temp file', { file, error });
                }
            }
            if (oldFiles.length > 0) {
                logger_1.logger.info('Cleanup completed', { filesRemoved: oldFiles.length });
            }
        }
        catch (error) {
            logger_1.logger.error('Cleanup process failed', { error });
        }
    }
}
exports.ContentDownloader = ContentDownloader;
//# sourceMappingURL=contentDownloader.js.map