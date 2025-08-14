export interface IPFSUploadResult {
    readonly hash: string;
    readonly size: number;
    readonly url: string;
    readonly uploadedAt: Date;
}
export interface ContentMetadata {
    readonly originalUrl: string;
    readonly contentType: string;
    readonly fileSize: number;
    readonly fileExtension?: string;
    readonly contentHash: string;
    readonly downloadedAt: Date;
}
export interface DownloadResult {
    readonly content: Buffer;
    readonly metadata: ContentMetadata;
    readonly httpStatus: number;
    readonly headers: Record<string, string>;
}
export interface IPFSConfig {
    readonly endpoint: string;
    readonly gateway: string;
    readonly timeout: number;
    readonly apiKey?: string;
    readonly pinContent: boolean;
}
export interface ContentValidationRules {
    readonly maxFileSizeMB: number;
    readonly allowedMimeTypes: readonly string[];
    readonly allowedExtensions: readonly string[];
    readonly requireHttps: boolean;
    readonly maxRedirects: number;
    readonly scanForMalware: boolean;
}
export interface ValidationResult {
    readonly isValid: boolean;
    readonly errors: readonly string[];
    readonly warnings: readonly string[];
    readonly metadata?: Partial<ContentMetadata>;
}
export interface IPFSPinStatus {
    readonly hash: string;
    readonly isPinned: boolean;
    readonly pinDate?: Date;
    readonly nodeId?: string;
}
export declare enum ContentTypeCategory {
    IMAGE = "image",
    DOCUMENT = "document",
    VIDEO = "video",
    WEBPAGE = "webpage",
    ARCHIVE = "archive",
    OTHER = "other"
}
export interface ContentProcessor {
    readonly supportedTypes: readonly string[];
    readonly category: ContentTypeCategory;
    process(content: Buffer, metadata: ContentMetadata): Promise<ProcessedContent>;
}
export interface ProcessedContent {
    readonly content: Buffer;
    readonly metadata: ContentMetadata;
    readonly transformations: readonly string[];
    readonly optimizedSize?: number;
}
//# sourceMappingURL=ipfs.d.ts.map