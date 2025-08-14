import { EventEmitter } from 'events';
import { AppConfig } from './types/config';
import { EcocertProcessingResult } from './types/ecocert';
import { ArchivingStats } from './types/database';
export declare class GainForestArchiver extends EventEmitter {
    private _config;
    private databaseService;
    private ecocertService;
    private contentDownloader;
    private isInitialized;
    private isShuttingDown;
    private processingPromises;
    constructor(_config: AppConfig);
    initialize(): Promise<void>;
    performHealthChecks(): Promise<{
        [service: string]: boolean;
    }>;
    processAllEcocerts(): Promise<{
        results: EcocertProcessingResult[];
        summary: ProcessingSummary;
    }>;
    processSpecificEcocerts(ecocertIds: string[]): Promise<{
        results: EcocertProcessingResult[];
        summary: ProcessingSummary;
    }>;
    getArchivingStatistics(): Promise<ArchivingStats & {
        systemHealth: any;
        lastUpdated: Date;
    }>;
    retryFailedArchives(limit?: number): Promise<{
        attempted: number;
        successful: number;
        stillFailed: number;
    }>;
    private retryArchiveRecord;
    shutdown(): Promise<void>;
    private generateProcessingSummary;
    private setupSignalHandlers;
    private ensureInitialized;
    private ensureNotShuttingDown;
}
export interface ProcessingSummary {
    duration: number;
    totalEcocerts: number;
    completedEcocerts: number;
    failedEcocerts: number;
    successRate: number;
    totalAttestations: number;
    totalUrls: number;
    totalArchived: number;
    archivalRate: number;
    totalErrors: number;
    averageProcessingTime: number;
    startTime: Date;
    endTime: Date;
}
//# sourceMappingURL=app.d.ts.map