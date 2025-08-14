import { EcocertId, ContentSource, EcocertAttestation } from './ecocert';
import { ArchiveStatus } from './database';
export declare function isEcocertId(value: unknown): value is EcocertId;
export declare function isContentSource(value: unknown): value is ContentSource;
export declare function isArchiveStatus(value: unknown): value is ArchiveStatus;
export declare class TypeValidator {
    static validateEcocertAttestation(_data: unknown): _data is EcocertAttestation;
    static validateDatabaseEntity<T>(data: unknown, validator: (data: unknown) => data is T): data is T;
}
//# sourceMappingURL=validation.d.ts.map