"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONTENT_VALIDATION = exports.PINATA_CONFIG = void 0;
exports.PINATA_CONFIG = {
    apiKey: process.env.PINATA_API_KEY || '',
    apiSecret: process.env.PINATA_API_SECRET || '',
    jwt: process.env.PINATA_JWT || '',
    gateway: process.env.PINATA_GATEWAY || 'https://gateway.pinata.cloud',
    timeout: parseInt(process.env.PINATA_TIMEOUT || '60000'),
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE_MB || '100') * 1024 * 1024,
    pinataMetadata: {
        name: 'GainForest Archive',
        keyvalues: {
            project: 'gainforest-archiver',
            version: '1.0.0'
        }
    },
    pinataOptions: {
        cidVersion: 1,
        wrapWithDirectory: false,
        customPinPolicy: {
            regions: [
                { id: 'FRA1', desiredReplicationCount: 2 },
                { id: 'NYC1', desiredReplicationCount: 2 }
            ]
        }
    }
};
exports.CONTENT_VALIDATION = {
    allowedMimeTypes: [
        'application/pdf',
        'text/html',
        'text/plain',
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'video/mp4',
        'application/json',
        'text/csv'
    ],
    allowedExtensions: [
        '.pdf', '.html', '.htm', '.txt', '.json', '.csv',
        '.jpg', '.jpeg', '.png', '.gif', '.webp',
        '.mp4', '.mov'
    ],
    maxFileSizeMB: parseInt(process.env.MAX_FILE_SIZE_MB || '100'),
    requireHttps: process.env.REQUIRE_HTTPS !== 'false',
    maxRedirects: parseInt(process.env.MAX_REDIRECTS || '5'),
    scanForMalware: process.env.SCAN_FOR_MALWARE !== 'false'
};
//# sourceMappingURL=constants.js.map