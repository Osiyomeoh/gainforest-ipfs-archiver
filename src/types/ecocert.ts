/**
 * Parsed components of an ecocert ID
 * Format: ${chainId}-${contractAddress}-${tokenId}
 */
export interface EcocertId {
    readonly chainId: string;        
    readonly contractAddress: string; 
    readonly tokenId: string;        
    readonly fullId: string;         
  }
  
  /**
   * Content source from attestation data
   * Based on the sources field structure we analyzed
   */
  export interface ContentSource {
    readonly type: 'url' | 'ipfs' | 'arweave'; 
    readonly src: string;                       
    readonly description?: string;              
  }
  
  /**
   * Attestation data structure from EAS
   * Matches the GraphQL response format we analyzed
   */
  export interface AttestationData {
    readonly title: string;
    readonly description: string;
    readonly chain_id: string;
    readonly token_id: string;
    readonly contract_address: string;
    readonly sources: readonly ContentSource[];
  }
  
  /**
   * Complete EAS attestation record
   * Maps to our attestations database table
   */
  export interface EcocertAttestation {
    readonly uid: string;                   
    readonly schema_uid: string;             
    readonly data: AttestationData;          
    readonly attester: string;              
    readonly creationBlockTimestamp: bigint; 
  }
  
  /**
   * Complete ecocert with all related data
   * Used for processing and business logic
   */
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
  
  /**
   * Processing status for tracking progress
   */
  export type ProcessingStatus = 
    | 'pending'      
    | 'processing'   
    | 'completed'    
    | 'failed'       
    | 'retry';       
  
  /**
   * Ecocert processing result
   * Used for batch processing and reporting
   */
  export interface EcocertProcessingResult {
    readonly ecocertId: string;
    readonly status: ProcessingStatus;
    readonly attestationsFound: number;
    readonly urlsExtracted: number;
    readonly successfullyArchived: number;
    readonly errors: readonly string[];
    readonly processedAt: Date;
  }