import { EcocertAttestation, EcocertId, EcocertProcessingResult } from '../types/ecocert';
export declare class EcocertService {
    private ipfsService;
    private contentDownloader;
    private databaseService;
    constructor();
    initialize(): Promise<void>;
    parseEcocertId(ecocertId: string): EcocertId;
    getSampleEcocertIds(): readonly string[];
    fetchAttestations(ecocertId: string): Promise<readonly EcocertAttestation[]>;
    extractExternalUrls(attestations: readonly EcocertAttestation[]): readonly string[];
    processEcocert(ecocertId: string): Promise<EcocertProcessingResult>;
    private processUrl;
    private generateFilename;
    private getExtensionFromContentType;
    private isValidUrl;
    processBatch(ecocertIds: string[]): Promise<EcocertProcessingResult[]>;
}
//# sourceMappingURL=ecocertService.d.ts.map