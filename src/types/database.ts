import { AttestationData } from './ecocert';

export interface EcocertEntity {
    id: string;                    
    chain_id: string;              
    contract_address: string;      
    token_id: string;              
    title?: string;                
    description?: string;          
    created_at: Date;             
    processed_at?: Date;           
    attestation_count: number;     
    archived_content_count: number; 
  }
  
  export interface AttestationEntity {
    uid: string;
    ecocert_id: string;
    schema_uid: string;
    attester: string;
    data: AttestationData;
    creation_block_timestamp?: bigint;
    created_at: Date;
    sources_count: number;
  }
  
  export interface ArchivedContentEntity {
    id: number;
    ecocert_id: string;
    attestation_uid: string;
    original_url: string;
    content_type: string;
    file_extension?: string;
    ipfs_hash: string;
    ipfs_url: string;
    file_size?: bigint;
    content_hash?: string;
    archived_at: Date;
    status: ArchiveStatus;
    error_message?: string;
    retry_count: number;
    last_retry_at?: Date;
  }
  
  export type ArchiveStatus = 
    | 'pending'
    | 'downloading'
    | 'uploading'
    | 'completed'
    | 'failed';
  
  export type EcocertInsert = Omit<EcocertEntity, 'created_at' | 'attestation_count' | 'archived_content_count'>;
  export type AttestationInsert = Omit<AttestationEntity, 'created_at' | 'sources_count'>;
  export type ArchivedContentInsert = Omit<ArchivedContentEntity, 'id' | 'archived_at' | 'retry_count' | 'last_retry_at'>;
  
  export interface EcocertFilter {
    chainId?: string;
    contractAddress?: string;
    processed?: boolean;
    createdAfter?: Date;
    createdBefore?: Date;
  }
  
  export interface ArchivedContentFilter {
    ecocertId?: string;
    status?: ArchiveStatus;
    contentType?: string;
    hasErrors?: boolean;
    needsRetry?: boolean;
  }
  
  export interface ArchivingStats {
    total_ecocerts: number;
    processed_ecocerts: number;
    total_attestations: number;
    total_urls_found: number;
    successfully_archived: number;
    failed_archives: number;
    pending_archives: number;
    average_urls_per_ecocert: number;
    success_rate: number;
  }
  
  export interface ArchivingSummary {
    ecocert_id: string;
    title?: string;
    chain_id: string;
    attestation_count: number;
    total_archived_count: number;
    completed_count: number;
    failed_count: number;
    pending_count: number;
    processed_at?: Date;
  }