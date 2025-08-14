"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypeValidator = void 0;
exports.isEcocertId = isEcocertId;
exports.isContentSource = isContentSource;
exports.isArchiveStatus = isArchiveStatus;
function isEcocertId(value) {
    return (typeof value === 'object' &&
        value !== null &&
        typeof value.chainId === 'string' &&
        typeof value.contractAddress === 'string' &&
        typeof value.tokenId === 'string' &&
        typeof value.fullId === 'string');
}
function isContentSource(value) {
    return (typeof value === 'object' &&
        value !== null &&
        ['url', 'ipfs', 'arweave'].includes(value.type) &&
        typeof value.src === 'string');
}
function isArchiveStatus(value) {
    return typeof value === 'string' &&
        ['pending', 'downloading', 'uploading', 'completed', 'failed'].includes(value);
}
class TypeValidator {
    static validateEcocertAttestation(_data) {
        return true;
    }
    static validateDatabaseEntity(data, validator) {
        return validator(data);
    }
}
exports.TypeValidator = TypeValidator;
//# sourceMappingURL=validation.js.map