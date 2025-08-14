import { EcocertService } from '../../../src/services/ecocertService';
import { PinataIPFSService } from '../../../src/services/ipfs';
import { ContentDownloader } from '../../../src/services/contentDownloader';
import { DatabaseService } from '../../../src/services/database';

jest.mock('../../../src/services/ipfs');
jest.mock('../../../src/services/contentDownloader');
jest.mock('../../../src/services/database');

describe('EcocertService', () => {
  let ecocertService: EcocertService;
  let mockIpfsService: jest.Mocked<PinataIPFSService>;
  let mockContentDownloader: jest.Mocked<ContentDownloader>;
  let mockDatabaseService: jest.Mocked<DatabaseService>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockIpfsService = {
      healthCheck: jest.fn().mockResolvedValue(true),
      upload: jest.fn().mockResolvedValue({
        hash: 'QmTestHash',
        size: 1024,
        url: 'https://gateway.pinata.cloud/ipfs/QmTestHash',
        uploadedAt: new Date()
      })
    } as any;

    mockContentDownloader = {
      downloadContent: jest.fn().mockResolvedValue({
        content: Buffer.from('test content'),
        metadata: {
          originalUrl: 'https://example.com/test.pdf',
          contentType: 'application/pdf',
          fileSize: 1024,
          fileExtension: '.pdf',
          contentHash: 'abc123',
          downloadedAt: new Date()
        },
        httpStatus: 200,
        headers: { 'content-type': 'application/pdf' }
      })
    } as any;

    mockDatabaseService = {
      getInstance: jest.fn().mockReturnThis(),
      initialize: jest.fn().mockResolvedValue(undefined),
      insertEcocert: jest.fn().mockResolvedValue(undefined),
      insertAttestation: jest.fn().mockResolvedValue(undefined),
      insertArchivedContent: jest.fn().mockResolvedValue(1),
      updateArchiveStatus: jest.fn().mockResolvedValue(undefined),
      markEcocertProcessed: jest.fn().mockResolvedValue(undefined),
      executeRaw: jest.fn().mockResolvedValue(undefined)
    } as any;

    (PinataIPFSService as jest.Mock).mockImplementation(() => mockIpfsService);
    (ContentDownloader as jest.Mock).mockImplementation(() => mockContentDownloader);
    (DatabaseService.getInstance as jest.Mock).mockReturnValue(mockDatabaseService);

    ecocertService = new EcocertService();
  });

  describe('ecocert ID parsing', () => {
    it('should parse valid ecocert ID correctly', () => {
      const ecocertId = '42220-0x16bA53B74c234C870c61EFC04cD418B8f2865959-123456789';
      const result = ecocertService.parseEcocertId(ecocertId);

      expect(result).toEqual({
        chainId: '42220',
        contractAddress: '0x16bA53B74c234C870c61EFC04cD418B8f2865959',
        tokenId: '123456789',
        fullId: ecocertId
      });
    });

    it('should throw error for invalid ecocert ID format', () => {
      const invalidId = 'invalid-id';
      
      expect(() => ecocertService.parseEcocertId(invalidId)).toThrow('Invalid ecocert ID format');
    });

    it('should validate chain ID format', () => {
      const invalidId = 'abc-0x16bA53B74c234C870c61EFC04cD418B8f2865959-123456789';
      
      expect(() => ecocertService.parseEcocertId(invalidId)).toThrow('Invalid chain ID');
    });

    it('should validate contract address format', () => {
      const invalidId = '42220-invalid-address-123456789';
      
      expect(() => ecocertService.parseEcocertId(invalidId)).toThrow('Invalid contract address');
    });
  });

  describe('URL extraction', () => {
    it('should extract URLs from attestations', () => {
      const attestations = [
        {
          uid: 'test-uid',
          schema_uid: 'schema-uid',
          data: {
            title: 'Test',
            description: 'Test desc',
            chain_id: '42220',
            token_id: '123',
            contract_address: '0x123',
            sources: [
              { type: 'url', src: 'https://example.com/file1.pdf' },
              { type: 'url', src: 'https://example.com/file2.jpg' },
              { type: 'ipfs', src: 'QmHash123' } // Should be filtered out
            ]
          },
          attester: '0x456',
          creationBlockTimestamp: BigInt(1640000000)
        }
      ] as any;

      const urls = ecocertService.extractExternalUrls(attestations);

      expect(urls).toEqual([
        'https://example.com/file1.pdf',
        'https://example.com/file2.jpg'
      ]);
    });

    it('should deduplicate URLs', () => {
      const attestations = [
        {
          uid: 'test-uid-1',
          data: {
            sources: [
              { type: 'url', src: 'https://example.com/file.pdf' },
              { type: 'url', src: 'https://example.com/file.pdf' } // Duplicate
            ]
          }
        },
        {
          uid: 'test-uid-2',
          data: {
            sources: [
              { type: 'url', src: 'https://example.com/file.pdf' } // Duplicate across attestations
            ]
          }
        }
      ] as any;

      const urls = ecocertService.extractExternalUrls(attestations);

      expect(urls).toEqual(['https://example.com/file.pdf']);
    });

    it('should filter out invalid URLs', () => {
      const attestations = [
        {
          data: {
            sources: [
              { type: 'url', src: 'https://example.com/valid.pdf' },
              { type: 'url', src: 'invalid-url' },
              { type: 'url', src: 'ftp://example.com/file.txt' } // Unsupported protocol
            ]
          }
        }
      ] as any;

      const urls = ecocertService.extractExternalUrls(attestations);

      expect(urls).toEqual(['https://example.com/valid.pdf']);
    });
  });

  describe('ecocert processing', () => {
    beforeEach(async () => {
      await ecocertService.initialize();
    });

    it('should process ecocert successfully', async () => {
      const ecocertId = '42220-0x16bA53B74c234C870c61EFC04cD418B8f2865959-123456789';
      
      jest.spyOn(ecocertService, 'fetchAttestations').mockResolvedValue([
        {
          uid: 'test-attestation',
          schema_uid: 'schema',
          data: {
            title: 'Test Attestation',
            description: 'Test description',
            chain_id: '42220',
            token_id: '123456789',
            contract_address: '0x16bA53B74c234C870c61EFC04cD418B8f2865959',
            sources: [
              { type: 'url', src: 'https://example.com/test.pdf' }
            ]
          },
          attester: '0x123',
          creationBlockTimestamp: BigInt(1640000000)
        }
      ] as any);

      const result = await ecocertService.processEcocert(ecocertId);

      expect(result).toMatchObject({
        ecocertId,
        status: 'completed',
        attestationsFound: 1,
        urlsExtracted: 1,
        successfullyArchived: 1,
        errors: [],
        processedAt: expect.any(Date)
      });

      expect(mockDatabaseService.insertEcocert).toHaveBeenCalled();
      expect(mockDatabaseService.insertAttestation).toHaveBeenCalled();
      expect(mockDatabaseService.insertArchivedContent).toHaveBeenCalled();
      expect(mockDatabaseService.markEcocertProcessed).toHaveBeenCalledWith(ecocertId);
    });

    it('should handle ecocerts with no attestations', async () => {
      const ecocertId = '42220-0x16bA53B74c234C870c61EFC04cD418B8f2865959-123456789';
      
      jest.spyOn(ecocertService, 'fetchAttestations').mockResolvedValue([]);

      const result = await ecocertService.processEcocert(ecocertId);

      expect(result).toMatchObject({
        ecocertId,
        status: 'completed',
        attestationsFound: 0,
        urlsExtracted: 0,
        successfullyArchived: 0,
        errors: ['No attestations found']
      });
    });

    it('should handle processing errors gracefully', async () => {
      const ecocertId = '42220-0x16bA53B74c234C870c61EFC04cD418B8f2865959-123456789';
      
      mockDatabaseService.insertEcocert.mockRejectedValue(new Error('Database error'));

      const result = await ecocertService.processEcocert(ecocertId);

      expect(result.status).toBe('failed');
      expect(result.errors).toContain(expect.stringContaining('Database error'));
    });
  });

  describe('batch processing', () => {
    it('should process multiple ecocerts', async () => {
      await ecocertService.initialize();
      
      const ecocertIds = [
        '42220-0x16bA53B74c234C870c61EFC04cD418B8f2865959-1',
        '42220-0x16bA53B74c234C870c61EFC04cD418B8f2865959-2'
      ];

      jest.spyOn(ecocertService, 'processEcocert').mockResolvedValue({
        ecocertId: 'test',
        status: 'completed',
        attestationsFound: 1,
        urlsExtracted: 1,
        successfullyArchived: 1,
        errors: [],
        processedAt: new Date()
      });

      const results = await ecocertService.processBatch(ecocertIds);

      expect(results).toHaveLength(2);
      expect(ecocertService.processEcocert).toHaveBeenCalledTimes(2);
    });
  });
});