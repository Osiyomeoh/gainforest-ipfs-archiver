"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IPFSError = exports.ContentError = exports.DatabaseError = exports.AppError = exports.ErrorCategory = void 0;
var ErrorCategory;
(function (ErrorCategory) {
    ErrorCategory["CONFIGURATION"] = "configuration";
    ErrorCategory["DATABASE"] = "database";
    ErrorCategory["NETWORK"] = "network";
    ErrorCategory["VALIDATION"] = "validation";
    ErrorCategory["IPFS"] = "ipfs";
    ErrorCategory["PROCESSING"] = "processing";
    ErrorCategory["SECURITY"] = "security";
})(ErrorCategory || (exports.ErrorCategory = ErrorCategory = {}));
class AppError extends Error {
    constructor(message, context) {
        super(message);
        this.name = this.constructor.name;
        this.timestamp = new Date();
        this.context = context;
    }
}
exports.AppError = AppError;
class DatabaseError extends AppError {
    constructor(message, code, context) {
        super(message, context);
        this.code = code;
        this.category = ErrorCategory.DATABASE;
    }
}
exports.DatabaseError = DatabaseError;
class ContentError extends AppError {
    constructor(message, code, url, context) {
        super(message, { ...context, url });
        this.code = code;
        this.url = url;
        this.category = ErrorCategory.PROCESSING;
    }
}
exports.ContentError = ContentError;
class IPFSError extends AppError {
    constructor(message, code, context) {
        super(message, context);
        this.code = code;
        this.category = ErrorCategory.IPFS;
    }
}
exports.IPFSError = IPFSError;
//# sourceMappingURL=errors.js.map