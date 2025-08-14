export interface EcocertId {
    readonly chainId: string;
    readonly contractAddress: string;
    readonly tokenId: string;
    readonly fullId: string;
}
export interface ContentSource {
    readonly type: 'url' | 'ipfs' | 'arweave';
    readonly src: string;
    readonly description?: string;
}
export interface AttestationData {
    readonly title: string;
    readonly description: string;
    readonly chain_id: string;
    readonly token_id: string;
    readonly contract_address: string;
    readonly sources: readonly ContentSource[];
}
export interface EcocertAttestation {
    readonly uid: string;
    readonly schema_uid: string;
    readonly data: AttestationData;
    readonly attester: string;
    readonly creationBlockTimestamp: bigint;
}
export interface FullEcocert {
    readonly id: string;
    readonly chainId: string;
    readonly contractAddress: string;
    readonly tokenId: string;
    readonly title?: string;
    readonly description?: string;
    readonly createdAt: Date;
    readonly processedAt?: Date;
    readonly attestations: readonly EcocertAttestation[];
}
export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'retry';
export interface EcocertProcessingResult {
    readonly ecocertId: string;
    readonly status: ProcessingStatus;
    readonly attestationsFound: number;
    readonly urlsExtracted: number;
    readonly successfullyArchived: number;
    readonly errors: readonly string[];
    readonly processedAt: Date;
}
//# sourceMappingURL=ecocert.d.ts.map