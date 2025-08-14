import { DownloadResult } from '../types/ipfs';
export declare class ContentDownloader {
    private readonly downloadDirectory;
    private readonly maxFileSize;
    private readonly timeout;
    constructor();
    private ensureDownloadDirectory;
    downloadContent(url: string): Promise<DownloadResult>;
    private streamDownload;
    private validateUrl;
    private validateResponse;
    private generateMetadata;
    downloadBatch(urls: string[]): Promise<(DownloadResult | Error)[]>;
    cleanup(): Promise<void>;
}
//# sourceMappingURL=contentDownloader.d.ts.map