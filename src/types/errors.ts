/**
 * Application error categories
 * Used for error classification and handling
 */
export enum ErrorCategory {
    CONFIGURATION = 'configuration',
    DATABASE = 'database',
    NETWORK = 'network',
    VALIDATION = 'validation',
    IPFS = 'ipfs',
    PROCESSING = 'processing',
    SECURITY = 'security'
  }
  
  /**
   * Base application error
   * Extended by specific error types
   */
  export abstract class AppError extends Error {
    abstract readonly category: ErrorCategory;
    abstract readonly code: string;
    readonly timestamp: Date;
        readonly context?: Record<string, unknown> | undefined;

    constructor(message: string, context?: Record<string, unknown>) {
      super(message);
      this.name = this.constructor.name;
      this.timestamp = new Date();
      this.context = context;
    }
  }
  
  /**
   * Database operation errors
   */
  export class DatabaseError extends AppError {
    readonly category = ErrorCategory.DATABASE;
    
    constructor(
      message: string,
      readonly code: string,
      context?: Record<string, unknown>
    ) {
      super(message, context);
    }
  }
  
  /**
   * Content download/validation errors
   */
  export class ContentError extends AppError {
    readonly category = ErrorCategory.PROCESSING;
    
    constructor(
      message: string,
      readonly code: string,
      readonly url?: string,
      context?: Record<string, unknown>
    ) {
      super(message, { ...context, url });
    }
  }
  
  /**
   * IPFS operation errors
   */
  export class IPFSError extends AppError {
    readonly category = ErrorCategory.IPFS;
    
    constructor(
      message: string,
      readonly code: string,
      context?: Record<string, unknown>
    ) {
      super(message, context);
    }
  }
  
  /**
   * Result type for operations that can fail
   * Functional error handling approach
   */
  export type Result<T, E = AppError> = 
    | { success: true; data: T }
    | { success: false; error: E };
  
  /**
   * Async result type
   */
  export type AsyncResult<T, E = AppError> = Promise<Result<T, E>>;
  
  /**
   * Operation result with metrics
   * Used for monitoring and reporting
   */
  export interface OperationResult<T> {
    readonly data?: T;
    readonly success: boolean;
    readonly error?: AppError;
    readonly duration: number;
    readonly retryCount: number;
    readonly metadata?: Record<string, unknown>;
  }