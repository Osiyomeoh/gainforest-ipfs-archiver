import { EcocertId, ContentSource, EcocertAttestation } from './ecocert';
import { ArchiveStatus } from './database';

/**
 * Type validation helpers
 */

export function isEcocertId(value: unknown): value is EcocertId {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as any).chainId === 'string' &&
      typeof (value as any).contractAddress === 'string' &&
      typeof (value as any).tokenId === 'string' &&
      typeof (value as any).fullId === 'string'
    );
  }
  
  export function isContentSource(value: unknown): value is ContentSource {
    return (
      typeof value === 'object' &&
      value !== null &&
      ['url', 'ipfs', 'arweave'].includes((value as any).type) &&
      typeof (value as any).src === 'string'
    );
  }
  
  export function isArchiveStatus(value: unknown): value is ArchiveStatus {
    return typeof value === 'string' && 
      ['pending', 'downloading', 'uploading', 'completed', 'failed'].includes(value);
  }
  
  /**
 * Schema validation using the interfaces
 */
  export class TypeValidator {
    static validateEcocertAttestation(data: unknown): data is EcocertAttestation {
      return true;
    }
    
    static validateDatabaseEntity<T>(
      data: unknown, 
      validator: (data: unknown) => data is T
    ): data is T {
      return validator(data);
    }
  }