import PinataSDK from '@pinata/sdk';
import { createHash } from 'crypto';
import mime from 'mime-types';
import { Readable } from 'stream';
import { logger } from '../utils/logger';
import { PINATA_CONFIG, CONTENT_VALIDATION } from '../config/constants';
import {
  IPFSUploadResult,
  IPFSPinStatus,
  ContentMetadata,
  ValidationResult
} from '../types/ipfs';
import { IPFSError } from '../types/errors';

export class PinataIPFSService {
  private pinata!: PinataSDK;
  private isInitialized = false;

  constructor() {
    this.validateConfiguration();
    this.initializePinata();
  }

  /**
   * Validate Pinata configuration
   * Defense: Fails fast if configuration is invalid
   */
  private validateConfiguration(): void {
    if (!PINATA_CONFIG.apiKey && !PINATA_CONFIG.jwt) {
      throw new IPFSError(
        'Pinata API key or JWT is required',
        'PINATA_CONFIG_MISSING'
      );
    }

    if (!PINATA_CONFIG.gateway) {
      throw new IPFSError(
        'Pinata gateway URL is required',
        'PINATA_GATEWAY_MISSING'
      );
    }

    logger.info('Pinata configuration validated');
  }

  /**
   * Initialize Pinata SDK
   * Defense: Proper SDK initialization with error handling
   */
  private initializePinata(): void {
    try {
      if (PINATA_CONFIG.jwt) {
        this.pinata = new PinataSDK({ pinataJWTKey: PINATA_CONFIG.jwt });
      } else {
        this.pinata = new PinataSDK(
          PINATA_CONFIG.apiKey,
          PINATA_CONFIG.apiSecret
        );
      }

      this.isInitialized = true;
      logger.info('Pinata SDK initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize Pinata SDK', { error });
      throw new IPFSError(
        'Failed to initialize Pinata SDK',
        'PINATA_INIT_FAILED',
        { originalError: error }
      );
    }
  }

  /**
   * Test Pinata connection and authentication
   * Defense: Validates service availability before operations
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.pinata.testAuthentication();
      logger.debug('Pinata health check completed', { authenticated: result.authenticated });
      return result.authenticated;

    } catch (error) {
      logger.error('Pinata health check failed', { error });
      return false;
    }
  }

  /**
   * Upload content to IPFS via Pinata
   * Defense: Comprehensive upload with validation and error handling
   */
  async upload(
    content: Buffer, 
    filename: string,
    metadata?: Partial<ContentMetadata>
  ): Promise<IPFSUploadResult> {
    this.ensureInitialized();

    try {
      const validation = await this.validateContent(content, filename);
      if (!validation.isValid) {
        throw new IPFSError(
          `Content validation failed: ${validation.errors.join(', ')}`,
          'CONTENT_VALIDATION_FAILED',
          { filename, errors: validation.errors }
        );
      }

      const contentHash = this.generateContentHash(content);
      
      const uploadMetadata = {
        ...PINATA_CONFIG.pinataMetadata,
        name: `${filename}_${Date.now()}`,
        keyvalues: {
          ...PINATA_CONFIG.pinataMetadata.keyvalues,
          originalFilename: filename,
          contentHash,
          uploadedAt: new Date().toISOString(),
          fileSize: content.length.toString(),
          contentType: metadata?.contentType || mime.lookup(filename) || 'application/octet-stream'
        }
      };

      logger.info('Starting IPFS upload to Pinata', {
        filename,
        size: content.length,
        contentType: uploadMetadata.keyvalues.contentType
      });

      const uploadStartTime = Date.now();
      const result = await this.pinata.pinFileToIPFS(
        Readable.from(content),
        {
          pinataMetadata: uploadMetadata as any,
          pinataOptions: PINATA_CONFIG.pinataOptions as any
        }
      );

      const uploadDuration = Date.now() - uploadStartTime;

      const gatewayUrl = `${PINATA_CONFIG.gateway}/ipfs/${result.IpfsHash}`;

      const uploadResult: IPFSUploadResult = {
        hash: result.IpfsHash,
        size: content.length,
        url: gatewayUrl,
        uploadedAt: new Date()
      };

      logger.info('IPFS upload completed successfully', {
        filename,
        hash: result.IpfsHash,
        size: content.length,
        duration: uploadDuration,
        url: gatewayUrl
      });

      return uploadResult;

    } catch (error) {
      logger.error('IPFS upload failed', {
        filename,
        size: content.length,
        error: error instanceof Error ? error.message : String(error)
      });

      throw new IPFSError(
        `Failed to upload ${filename} to IPFS`,
        'IPFS_UPLOAD_FAILED',
        { filename, size: content.length, originalError: error }
      );
    }
  }

  /**
   * Pin existing content by hash
   * Defense: Ensures content persistence on Pinata
   */
  async pin(hash: string): Promise<void> {
    this.ensureInitialized();

    try {
      logger.info('Pinning content to Pinata', { hash });

      await this.pinata.pinByHash(hash, {
        pinataMetadata: {
          ...PINATA_CONFIG.pinataMetadata,
          name: `pinned_${hash}`,
          keyvalues: {
            ...PINATA_CONFIG.pinataMetadata.keyvalues,
            pinnedAt: new Date().toISOString(),
            pinType: 'manual'
          }
        } as any
      });

      logger.info('Content pinned successfully', { hash });

    } catch (error) {
      logger.error('Failed to pin content', { hash, error });
      throw new IPFSError(
        `Failed to pin content ${hash}`,
        'IPFS_PIN_FAILED',
        { hash, originalError: error }
      );
    }
  }

  /**
   * Check pin status of content
   * Defense: Monitors content persistence
   */
  async checkPinStatus(hash: string): Promise<IPFSPinStatus> {
    this.ensureInitialized();

    try {
      const pinList = await this.pinata.pinList({
        hashContains: hash,
        status: 'pinned',
        pageLimit: 1
      }) as any;

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

    } catch (error) {
      logger.error('Failed to check pin status', { hash, error });
      return {
        hash,
        isPinned: false
      };
    }
  }

  /**
   * Get detailed information about pinned content
   * Defense: Provides metadata for monitoring and debugging
   */
  async getPinInfo(hash: string): Promise<any> {
    this.ensureInitialized();

    try {
      const pinList = await this.pinata.pinList({
        hashContains: hash,
        pageLimit: 1
      }) as any;

      if (pinList.count === 0) {
        throw new IPFSError(
          `Content ${hash} not found on Pinata`,
          'CONTENT_NOT_FOUND',
          { hash }
        );
      }

      return pinList.rows[0];

    } catch (error) {
      logger.error('Failed to get pin info', { hash, error });
      throw new IPFSError(
        `Failed to get pin info for ${hash}`,
        'PIN_INFO_FAILED',
        { hash, originalError: error }
      );
    }
  }

  /**
   * Unpin content from Pinata
   * Defense: Controlled content removal with logging
   */
  async unpin(hash: string): Promise<void> {
    this.ensureInitialized();

    try {
      logger.warn('Unpinning content from Pinata', { hash });

      await this.pinata.unpin(hash);

      logger.warn('Content unpinned successfully', { hash });

    } catch (error) {
      logger.error('Failed to unpin content', { hash, error });
      throw new IPFSError(
        `Failed to unpin content ${hash}`,
        'IPFS_UNPIN_FAILED',
        { hash, originalError: error }
      );
    }
  }

  /**
   * Get usage statistics from Pinata
   * Defense: Monitors storage usage for cost management
   */
  async getUsageStats(): Promise<any> {
    this.ensureInitialized();

    try {
      const pinList = await this.pinata.pinList({ 
        status: 'pinned',
        pageLimit: 1000,
        pageOffset: 0
      }) as any;

      const stats = {
        totalPins: pinList.count,
        totalSize: pinList.rows.reduce((sum: number, pin: any) => sum + parseInt(pin.size), 0),
        lastUpdated: new Date()
      };

      logger.info('Pinata usage stats retrieved', stats);
      return stats;

    } catch (error) {
      logger.error('Failed to get usage stats', { error });
      throw new IPFSError(
        'Failed to get Pinata usage stats',
        'USAGE_STATS_FAILED',
        { originalError: error }
      );
    }
  }

  /**
   * Validate content before upload
   * Defense: Prevents uploading invalid or malicious content
   */
  private async validateContent(
    content: Buffer,
    filename: string
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    const maxFileSize = CONTENT_VALIDATION.maxFileSizeMB * 1024 * 1024;
    if (content.length > maxFileSize) {
      errors.push(
        `File size ${content.length} exceeds maximum ${maxFileSize}`
      );
    }

    const extension = filename.toLowerCase().match(/\.[^.]+$/)?.[0];
    if (extension && !CONTENT_VALIDATION.allowedExtensions.includes(extension as any)) {
      errors.push(`File extension ${extension} is not allowed`);
    }

    const detectedMimeType = mime.lookup(filename);
    if (CONTENT_VALIDATION.requireHttps && detectedMimeType) {
      if (!CONTENT_VALIDATION.allowedMimeTypes.includes(detectedMimeType as any)) {
        errors.push(`Content type ${detectedMimeType} is not allowed`);
      }
    }

    if (CONTENT_VALIDATION.scanForMalware) {
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

  /**
   * Generate SHA-256 hash of content
   * Defense: Content verification and deduplication
   */
  private generateContentHash(content: Buffer): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Ensure service is initialized
   * Defense: Prevents operations on uninitialized service
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new IPFSError(
        'Pinata IPFS service not initialized',
        'SERVICE_NOT_INITIALIZED'
      );
    }
  }

  /**
   * Batch upload multiple files
   * Defense: Efficient bulk operations with progress tracking
   */
  async uploadBatch(
    files: Array<{ content: Buffer; filename: string; metadata?: Partial<ContentMetadata> }>
  ): Promise<IPFSUploadResult[]> {
    this.ensureInitialized();

    const results: IPFSUploadResult[] = [];
    const errors: Error[] = [];

    logger.info('Starting batch upload to Pinata', { fileCount: files.length });

    const maxConcurrent = parseInt(process.env.MAX_CONCURRENT_UPLOADS || '3');
    
    for (let i = 0; i < files.length; i += maxConcurrent) {
      const batch = files.slice(i, i + maxConcurrent);
      
      const batchPromises = batch.map(async (file) => {
        try {
          const result = await this.upload(file.content, file.filename, file.metadata);
          results.push(result);
          return result;
        } catch (error) {
          errors.push(error as Error);
          logger.error('Batch upload item failed', {
            filename: file.filename,
            error: error instanceof Error ? error.message : String(error)
          });
          throw error;
        }
      });

      try {
        await Promise.all(batchPromises);
        logger.debug('Batch completed', { 
          batchIndex: Math.floor(i / maxConcurrent) + 1,
          filesInBatch: batch.length 
        });
      } catch (error) {
        logger.warn('Some files in batch failed', { 
          batchIndex: Math.floor(i / maxConcurrent) + 1 
        });
      }
    }

    logger.info('Batch upload completed', {
      totalFiles: files.length,
      successful: results.length,
      failed: errors.length
    });

    if (errors.length > 0 && results.length === 0) {
      throw new IPFSError(
        'All files in batch upload failed',
        'BATCH_UPLOAD_FAILED',
        { totalFiles: files.length, errors }
      );
    }

    return results;
  }
}