import { SAMPLE_ECOCERT_IDS } from '../data/sampleEcocerts';
import { MOCK_ATTESTATIONS } from '../data/mockAttestations';
import { EcocertAttestation, EcocertId, ProcessingStatus, EcocertProcessingResult } from '../types/ecocert';
import { PinataIPFSService } from './ipfs';
import { ContentDownloader } from './contentDownloader';
import { DatabaseService } from './database';
import { logger } from '../utils/logger';


export class EcocertService {
  private ipfsService: PinataIPFSService;
  private contentDownloader: ContentDownloader;
  private databaseService: DatabaseService;

  constructor() {
    this.ipfsService = new PinataIPFSService();
    this.contentDownloader = new ContentDownloader();
    this.databaseService = DatabaseService.getInstance();
  }

  /**
   * Initialize all services
   * Defense: Ensures all dependencies are ready before processing
   */
  async initialize(): Promise<void> {
    logger.info('Initializing EcocertService');

    const ipfsHealthy = await this.ipfsService.healthCheck();
    if (!ipfsHealthy) {
      throw new Error('IPFS service is not available');
    }

    await this.databaseService.initialize();

    logger.info('EcocertService initialized successfully');
  }

  /**
   * Parse ecocert ID into components
   * Defense: Validates format and extracts components safely
   */
  parseEcocertId(ecocertId: string): EcocertId {
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

  /**
   * Get all sample ecocert IDs
   * Defense: Returns immutable copy to prevent external modification
   */
  getSampleEcocertIds(): readonly string[] {
    return Object.freeze([...SAMPLE_ECOCERT_IDS]);
  }

  /**
   * Fetch attestations for an ecocert (using mock data)
   * Defense: Simulates API with realistic delay and error handling
   */
  async fetchAttestations(ecocertId: string): Promise<readonly EcocertAttestation[]> {
    try {
      this.parseEcocertId(ecocertId);

      await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

      const attestations = MOCK_ATTESTATIONS[ecocertId] || [];

      logger.debug('Fetched attestations', {
        ecocertId,
        attestationCount: attestations.length
      });

      return Object.freeze(attestations);

    } catch (error) {
      logger.error('Failed to fetch attestations', { ecocertId, error });
      throw error;
    }
  }

  /**
   * Extract all external URLs from attestations
   * Defense: Validates and deduplicates URLs
   */
  extractExternalUrls(attestations: readonly EcocertAttestation[]): readonly string[] {
    const urls = new Set<string>();

    for (const attestation of attestations) {
      for (const source of attestation.data.sources) {
        if (source.type === 'url' && this.isValidUrl(source.src)) {
          urls.add(source.src);
        }
      }
    }

    const urlArray = Array.from(urls);
    logger.debug('Extracted URLs from attestations', {
      attestationCount: attestations.length,
      urlCount: urlArray.length,
      urls: urlArray
    });

    return Object.freeze(urlArray);
  }

  /**
   * Process complete ecocert archiving pipeline
   * Defense: Comprehensive processing with detailed error handling and progress tracking
   */
  async processEcocert(ecocertId: string): Promise<EcocertProcessingResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let attestationsFound = 0;
    let urlsExtracted = 0;
    let successfullyArchived = 0;

    try {
      logger.info('Starting ecocert processing', { ecocertId });

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
        logger.warn('No attestations found for ecocert', { ecocertId });
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
        } catch (error) {
          logger.error('Failed to store attestation', {
            uid: attestation.uid,
            error: error instanceof Error ? error.message : String(error)
          });
          errors.push(`Failed to store attestation ${attestation.uid}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      const urls = this.extractExternalUrls(attestations);
      urlsExtracted = urls.length;

      if (urls.length === 0) {
        logger.warn('No URLs found in attestations', { ecocertId });
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
        } catch (error) {
          const errorMessage = `Failed to process URL ${url}: ${error instanceof Error ? error.message : String(error)}`;
          logger.error('URL processing failed', { url, ecocertId, error });
          errors.push(errorMessage);
        }
      }

      await this.databaseService.markEcocertProcessed(ecocertId);

      const duration = Date.now() - startTime;
      const status: ProcessingStatus = errors.length === 0 ? 'completed' : 
                                     successfullyArchived > 0 ? 'completed' : 'failed';

      logger.info('Ecocert processing completed', {
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

    } catch (error) {
      logger.error('Ecocert processing failed', { ecocertId, error });
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

  /**
   * Process individual URL - download and upload to IPFS
   * Defense: Complete error handling with database tracking
   */
  private async processUrl(ecocertId: string, attestationUid: string, url: string): Promise<void> {
    logger.info('Processing URL', { ecocertId, url });

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
      
      logger.info('Content downloaded successfully', {
        url,
        size: downloadResult.content.length,
        contentType: downloadResult.metadata.contentType
      });

      await this.databaseService.updateArchiveStatus(archiveId, 'uploading');

      const filename = this.generateFilename(url, downloadResult.metadata.contentType);

      const ipfsResult = await this.ipfsService.upload(
        downloadResult.content,
        filename,
        downloadResult.metadata
      );

      logger.info('Content uploaded to IPFS', {
        url,
        ipfsHash: ipfsResult.hash,
        ipfsUrl: ipfsResult.url
      });

      await this.databaseService.executeRaw(
        `UPDATE archived_content 
         SET status = ?, content_type = ?, file_extension = ?, 
             ipfs_hash = ?, ipfs_url = ?, file_size = ?, content_hash = ?
         WHERE id = ?`,
        [
          'completed',
          downloadResult.metadata.contentType,
          downloadResult.metadata.fileExtension,
          ipfsResult.hash,
          ipfsResult.url,
          downloadResult.metadata.fileSize,
          downloadResult.metadata.contentHash,
          archiveId
        ]
      );

      logger.info('URL processing completed successfully', {
        url,
        ecocertId,
        ipfsHash: ipfsResult.hash
      });

    } catch (error) {
      logger.error('URL processing failed', { url, ecocertId, error });
      
      await this.databaseService.updateArchiveStatus(
        archiveId, 
        'failed', 
        error instanceof Error ? error.message : String(error)
      );

      throw error;
    }
  }

  /**
   * Generate appropriate filename for IPFS
   * Defense: Creates meaningful, safe filenames
   */
  private generateFilename(url: string, contentType: string): string {
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
      } else {
        filename = `${filename}_${timestamp}`;
      }
      
      return filename;
      
    } catch (error) {
      const timestamp = Date.now();
      const extension = this.getExtensionFromContentType(contentType);
      return `content_${timestamp}${extension}`;
    }
  }

  /**
   * Get file extension from content type
   * Defense: Maps content types to appropriate extensions
   */
  private getExtensionFromContentType(contentType: string): string {
    const typeMap: Record<string, string> = {
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

  /**
   * Validate URL format
   * Defense: Basic URL validation before processing
   */
  private isValidUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return ['http:', 'https:'].includes(urlObj.protocol);
    } catch {
      return false;
    }
  }

  /**
   * Process batch of ecocerts
   * Defense: Efficient batch processing with controlled concurrency
   */
  async processBatch(ecocertIds: string[]): Promise<EcocertProcessingResult[]> {
    const maxConcurrent = parseInt(process.env.MAX_CONCURRENT_ECOCERTS || '2');
    const results: EcocertProcessingResult[] = [];

    logger.info('Starting ecocert batch processing', {
      ecocertCount: ecocertIds.length,
      maxConcurrent
    });

    for (let i = 0; i < ecocertIds.length; i += maxConcurrent) {
      const batch = ecocertIds.slice(i, i + maxConcurrent);
      
      const batchPromises = batch.map(ecocertId => this.processEcocert(ecocertId));
      const batchResults = await Promise.all(batchPromises);
      
      results.push(...batchResults);

      logger.info('Batch processing completed', {
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

    logger.info('Batch processing summary', summary);
    return results;
  }
}