import { EcocertEntity, ArchivedContentEntity, EcocertInsert, AttestationInsert, ArchivedContentInsert, ArchiveStatus, ArchivingStats } from '../types/database';
export declare class DatabaseService {
    private db;
    private static instance;
    private isInitialized;
    private constructor();
    static getInstance(): DatabaseService;
    private setupConnectionHandlers;
    initialize(): Promise<void>;
    destroy(): Promise<void>;
    healthCheck(): Promise<{
        status: string;
        connection: boolean;
        latency?: number;
    }>;
    insertEcocert(ecocert: EcocertInsert): Promise<void>;
    insertEcocertsBatch(ecocerts: EcocertInsert[]): Promise<void>;
    getUnprocessedEcocerts(limit?: number): Promise<readonly EcocertEntity[]>;
    markEcocertProcessed(ecocertId: string): Promise<void>;
    insertAttestation(attestation: AttestationInsert): Promise<void>;
    insertArchivedContent(content: ArchivedContentInsert): Promise<number>;
    updateArchiveStatus(id: number, status: ArchiveStatus, errorMessage?: string): Promise<void>;
    getFailedArchives(limit?: number): Promise<readonly ArchivedContentEntity[]>;
    getArchivingStats(): Promise<ArchivingStats>;
    private ensureInitialized;
    executeRaw<T = any>(sql: string, bindings?: any[]): Promise<T>;
}
//# sourceMappingURL=database.d.ts.map