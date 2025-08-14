export declare enum ErrorCategory {
    CONFIGURATION = "configuration",
    DATABASE = "database",
    NETWORK = "network",
    VALIDATION = "validation",
    IPFS = "ipfs",
    PROCESSING = "processing",
    SECURITY = "security"
}
export declare abstract class AppError extends Error {
    abstract readonly category: ErrorCategory;
    abstract readonly code: string;
    readonly timestamp: Date;
    readonly context?: Record<string, unknown> | undefined;
    constructor(message: string, context?: Record<string, unknown>);
}
export declare class DatabaseError extends AppError {
    readonly code: string;
    readonly category = ErrorCategory.DATABASE;
    constructor(message: string, code: string, context?: Record<string, unknown>);
}
export declare class ContentError extends AppError {
    readonly code: string;
    readonly url?: string | undefined;
    readonly category = ErrorCategory.PROCESSING;
    constructor(message: string, code: string, url?: string | undefined, context?: Record<string, unknown>);
}
export declare class IPFSError extends AppError {
    readonly code: string;
    readonly category = ErrorCategory.IPFS;
    constructor(message: string, code: string, context?: Record<string, unknown>);
}
export type Result<T, E = AppError> = {
    success: true;
    data: T;
} | {
    success: false;
    error: E;
};
export type AsyncResult<T, E = AppError> = Promise<Result<T, E>>;
export interface OperationResult<T> {
    readonly data?: T;
    readonly success: boolean;
    readonly error?: AppError;
    readonly duration: number;
    readonly retryCount: number;
    readonly metadata?: Record<string, unknown>;
}
//# sourceMappingURL=errors.d.ts.map