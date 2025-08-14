/**
 * IPFS upload result
 */
export interface IPFSUploadResult {
    readonly hash: string;
    readonly size: number;
    readonly url: string;
    readonly uploadedAt: Date;
  }
  
  /**
 * Content metadata before IPFS upload
 */
  export interface ContentMetadata {
    readonly originalUrl: string;
    readonly contentType: string;
    readonly fileSize: number;
    readonly fileExtension?: string;
    readonly contentHash: string;
    readonly downloadedAt: Date;
  }
  
  /**
   * Content download result
   * Includes both content and metadata
   */
  export interface DownloadResult {
    readonly content: Buffer;
    readonly metadata: ContentMetadata;
    readonly httpStatus: number;
    readonly headers: Record<string, string>;
  }
  
  /**
 * IPFS configuration
 */
  export interface IPFSConfig {
    readonly endpoint: string;
    readonly gateway: string;
    readonly timeout: number;
    readonly apiKey?: string;
    readonly pinContent: boolean;
  }
  
  /**
 * Content validation rules
 */
  export interface ContentValidationRules {
    readonly maxFileSizeMB: number;
    readonly allowedMimeTypes: readonly string[];
    readonly allowedExtensions: readonly string[];
    readonly requireHttps: boolean;
    readonly maxRedirects: number;
    readonly scanForMalware: boolean;
  }
  
  /**
   * Validation result
   * Returned by content validator
   */
  export interface ValidationResult {
    readonly isValid: boolean;
    readonly errors: readonly string[];
    readonly warnings: readonly string[];
    readonly metadata?: Partial<ContentMetadata>;
  }
  
  /**
 * IPFS pin status
 */
  export interface IPFSPinStatus {
    readonly hash: string;
    readonly isPinned: boolean;
    readonly pinDate?: Date;
    readonly nodeId?: string;
  }
  
  /**
 * Content type classification
 */
  export enum ContentTypeCategory {
    IMAGE = 'image',
    DOCUMENT = 'document',
    VIDEO = 'video',
    WEBPAGE = 'webpage',
    ARCHIVE = 'archive',
    OTHER = 'other'
  }
  
  /**
   * Content processor interface
   * Different processors for different content types
   */
  export interface ContentProcessor {
    readonly supportedTypes: readonly string[];
    readonly category: ContentTypeCategory;
    process(content: Buffer, metadata: ContentMetadata): Promise<ProcessedContent>;
  }
  
  /**
 * Processed content result
 */
  export interface ProcessedContent {
    readonly content: Buffer;
    readonly metadata: ContentMetadata;
    readonly transformations: readonly string[];
    readonly optimizedSize?: number;
  }