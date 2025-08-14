/**
 * Pinata IPFS service configuration

 */
export const PINATA_CONFIG = {
    apiKey: process.env.PINATA_API_KEY || '',
    apiSecret: process.env.PINATA_API_SECRET || '',
    jwt: process.env.PINATA_JWT || '', // Preferred authentication method
    
    gateway: process.env.PINATA_GATEWAY || 'https://gateway.pinata.cloud',
    
    timeout: parseInt(process.env.PINATA_TIMEOUT || '60000'), // 60 seconds
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE_MB || '100') * 1024 * 1024, // 100MB
    
    pinataMetadata: {
      name: 'GainForest Archive',
      keyvalues: {
        project: 'gainforest-archiver',
        version: '1.0.0'
      }
    },
    
    pinataOptions: {
      cidVersion: 1, // Use CIDv1 for better compatibility
      wrapWithDirectory: false, // Keep individual file structure
      customPinPolicy: {
        regions: [
          { id: 'FRA1', desiredReplicationCount: 2 },
          { id: 'NYC1', desiredReplicationCount: 2 }
        ]
      }
    }
  } as const;
  
  /**
   * Content validation rules for Pinata uploads
   */
  export const CONTENT_VALIDATION = {
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
  } as const;