import { IPFSUploadResult, IPFSPinStatus, ContentMetadata } from '../types/ipfs';
export declare class PinataIPFSService {
    private pinata;
    private isInitialized;
    constructor();
    private validateConfiguration;
    private initializePinata;
    healthCheck(): Promise<boolean>;
    upload(content: Buffer, filename: string, metadata?: Partial<ContentMetadata>): Promise<IPFSUploadResult>;
    pin(hash: string): Promise<void>;
    checkPinStatus(hash: string): Promise<IPFSPinStatus>;
    getPinInfo(hash: string): Promise<any>;
    unpin(hash: string): Promise<void>;
    getUsageStats(): Promise<any>;
    private validateContent;
    private generateContentHash;
    private ensureInitialized;
    uploadBatch(files: Array<{
        content: Buffer;
        filename: string;
        metadata?: Partial<ContentMetadata>;
    }>): Promise<IPFSUploadResult[]>;
}
//# sourceMappingURL=ipfs.d.ts.map