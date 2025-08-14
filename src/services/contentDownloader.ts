import axios from 'axios';
import { createWriteStream, promises as fs } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import mime from 'mime-types';
import { logger } from '../utils/logger';
import { ContentMetadata, DownloadResult } from '../types/ipfs';
import { ContentError } from '../types/errors';

export class ContentDownloader {
  private readonly downloadDirectory: string;
  private readonly maxFileSize: number;
  private readonly timeout: number;

  constructor() {
    this.downloadDirectory = process.env.DOWNLOAD_DIRECTORY || './temp/downloads';
    this.maxFileSize = parseInt(process.env.MAX_FILE_SIZE_MB || '100') * 1024 * 1024;
    this.timeout = parseInt(process.env.REQUEST_TIMEOUT_MS || '30000');
    
    this.ensureDownloadDirectory();
  }

  /**
   * Ensure download directory exists
   * Defense: Creates necessary directories for file operations
   */
  private async ensureDownloadDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.downloadDirectory, { recursive: true });
      logger.debug('Download directory ensured', { path: this.downloadDirectory });
    } catch (error) {
      logger.error('Failed to create download directory', { 
        path: this.downloadDirectory, 
        error 
      });
      throw new ContentError(
        'Failed to create download directory',
        'DOWNLOAD_DIR_FAILED',
        undefined,
        { path: this.downloadDirectory, originalError: error }
      );
    }
  }

  /**
   * Download content from URL
   * Defense: Comprehensive download with validation and streaming
   */
  async downloadContent(url: string): Promise<DownloadResult> {
    try {
      logger.info('Starting content download', { url });

      this.validateUrl(url);

      const tempFilename = `download_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const tempPath = join(this.downloadDirectory, tempFilename);

      const response = await axios({
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
        await fs.unlink(tempPath);
      } catch (cleanupError) {
        logger.warn('Failed to cleanup temp file', { 
          path: tempPath, 
          error: cleanupError 
        });
      }

      logger.info('Content download completed', {
        url,
        size: content.length,
        contentType: metadata.contentType
      });

      return {
        content,
        metadata,
        httpStatus: response.status,
        headers: response.headers as Record<string, string>
      };

    } catch (error) {
      logger.error('Content download failed', { url, error: error instanceof Error ? error.message : String(error) });
      
      if (error instanceof ContentError) {
        throw error;
      }

      throw new ContentError(
        `Failed to download content from ${url}`,
        'DOWNLOAD_FAILED',
        url,
        { originalError: error }
      );
    }
  }

  /**
   * Stream download with size limits
   * Defense: Prevents memory exhaustion with large files
   */
  private async streamDownload(
    response: any,
    tempPath: string,
    url: string
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const writer = createWriteStream(tempPath);
      let downloadedSize = 0;

      response.data.on('data', (chunk: Buffer) => {
        downloadedSize += chunk.length;
        
        if (downloadedSize > this.maxFileSize) {
          writer.destroy();
          reject(new ContentError(
            `File size exceeds limit of ${this.maxFileSize} bytes`,
            'FILE_TOO_LARGE',
            url,
            { downloadedSize, maxSize: this.maxFileSize }
          ));
          return;
        }
      });

      response.data.on('error', (error: Error) => {
        writer.destroy();
        reject(new ContentError(
          'Download stream error',
          'STREAM_ERROR',
          url,
          { originalError: error }
        ));
      });

      writer.on('error', (error: Error) => {
        reject(new ContentError(
          'File write error',
          'WRITE_ERROR',
          url,
          { tempPath, originalError: error }
        ));
      });

      writer.on('finish', async () => {
        try {
          const content = await fs.readFile(tempPath);
          resolve(content);
        } catch (error) {
          reject(new ContentError(
            'Failed to read downloaded file',
            'READ_ERROR',
            url,
            { tempPath, originalError: error }
          ));
        }
      });

      response.data.pipe(writer);
    });
  }

  /**
   * Validate URL before download
   * Defense: Prevents downloading from malicious or invalid URLs
   */
  private validateUrl(url: string): void {
    try {
      const parsedUrl = new URL(url);
      
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new ContentError(
          `Unsupported protocol: ${parsedUrl.protocol}`,
          'INVALID_PROTOCOL',
          url
        );
      }

      if (process.env.NODE_ENV === 'production' && parsedUrl.protocol !== 'https:') {
        throw new ContentError(
          'HTTPS required in production',
          'HTTPS_REQUIRED',
          url
        );
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
        throw new ContentError(
          'Private/local addresses not allowed',
          'PRIVATE_ADDRESS_BLOCKED',
          url
        );
      }

    } catch (error) {
      if (error instanceof ContentError) {
        throw error;
      }
      
      throw new ContentError(
        `Invalid URL: ${url}`,
        'INVALID_URL',
        url,
        { originalError: error }
      );
    }
  }

  /**
   * Validate HTTP response
   * Defense: Ensures response is suitable for archiving
   */
  private validateResponse(response: any, url: string): void {
    const contentLength = response.headers['content-length'];
    if (contentLength && parseInt(contentLength) > this.maxFileSize) {
      throw new ContentError(
        `Content-Length ${contentLength} exceeds maximum ${this.maxFileSize}`,
        'CONTENT_TOO_LARGE',
        url,
        { contentLength: parseInt(contentLength), maxSize: this.maxFileSize }
      );
    }

    const contentType = response.headers['content-type'];
    if (!contentType) {
      logger.warn('No content-type header', { url });
    }

    logger.debug('Response validated', {
      url,
      status: response.status,
      contentType,
      contentLength
    });
  }

  /**
   * Generate content metadata
   * Defense: Comprehensive metadata for tracking and verification
   */
  private generateMetadata(
    url: string,
    response: any,
    content: Buffer
  ): ContentMetadata {
    const contentType = response.headers['content-type'] || 
                      mime.lookup(url) || 
                      'application/octet-stream';
    
    let fileExtension: string | undefined;
    const urlExtension = url.match(/\.([^./?#]+)(?:[?#]|$)/)?.[1];
    if (urlExtension) {
      fileExtension = `.${urlExtension.toLowerCase()}`;
    } else {
      fileExtension = mime.extension(contentType.split(';')[0]) || undefined;
      if (fileExtension) {
        fileExtension = `.${fileExtension}`;
      }
    }

    const contentHash = createHash('sha256').update(content).digest('hex');

    return {
      originalUrl: url,
      contentType: contentType.split(';')[0],
      fileSize: content.length,
      ...(fileExtension && { fileExtension }),
      contentHash,
      downloadedAt: new Date()
    };
  }

  /**
   * Download multiple URLs concurrently
   * Defense: Efficient batch processing with error isolation
   */
  async downloadBatch(urls: string[]): Promise<(DownloadResult | Error)[]> {
    const maxConcurrent = parseInt(process.env.MAX_CONCURRENT_DOWNLOADS || '5');
    const results: (DownloadResult | Error)[] = [];

    logger.info('Starting batch download', { 
      urlCount: urls.length,
      maxConcurrent 
    });

    for (let i = 0; i < urls.length; i += maxConcurrent) {
      const batch = urls.slice(i, i + maxConcurrent);
      
      const batchPromises = batch.map(async (url) => {
        try {
          return await this.downloadContent(url);
        } catch (error) {
          logger.error('Batch download item failed', { url, error: error instanceof Error ? error.message : String(error) });
          return error instanceof Error ? error : new Error(String(error));
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      logger.debug('Download batch completed', {
        batchIndex: Math.floor(i / maxConcurrent) + 1,
        urlsInBatch: batch.length,
        successful: batchResults.filter(r => !(r instanceof Error)).length,
        failed: batchResults.filter(r => r instanceof Error).length
      });
    }

    const successful = results.filter(r => !(r instanceof Error)).length;
    const failed = results.filter(r => r instanceof Error).length;

    logger.info('Batch download completed', {
      totalUrls: urls.length,
      successful,
      failed,
      successRate: (successful / urls.length) * 100
    });

    return results;
  }

  /**
   * Cleanup temporary files
   * Defense: Prevents disk space issues
   */
  async cleanup(): Promise<void> {
    try {
      const files = await fs.readdir(this.downloadDirectory);
      const oldFiles = files.filter(file => {
        const match = file.match(/^download_(\d+)_/);
        if (!match) return false;
        
        const timestamp = parseInt(match[1]);
        const age = Date.now() - timestamp;
        const maxAge = 60 * 60 * 1000;
        return age > maxAge;
      });
 
      for (const file of oldFiles) {
        const filePath = join(this.downloadDirectory, file);
        try {
          await fs.unlink(filePath);
          logger.debug('Cleaned up old temp file', { file });
        } catch (error) {
          logger.warn('Failed to cleanup temp file', { file, error });
        }
      }
 
      if (oldFiles.length > 0) {
        logger.info('Cleanup completed', { filesRemoved: oldFiles.length });
      }
 
    } catch (error) {
      logger.error('Cleanup process failed', { error });
    }
  }
 }