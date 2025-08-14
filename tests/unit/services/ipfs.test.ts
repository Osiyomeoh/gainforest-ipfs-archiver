import nock from 'nock';
import { PinataIPFSService } from '../../../src/services/ipfs';
import { IPFSError } from '../../../src/types/errors';

jest.mock('@pinata/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    testAuthentication: jest.fn().mockResolvedValue({ authenticated: true }),
    pinFileToIPFS: jest.fn().mockResolvedValue({
      IpfsHash: 'QmTestHash123',
      PinSize: 1024,
      Timestamp: '2023-01-01T00:00:00.000Z'
    }),
    pinByHash: jest.fn().mockResolvedValue(undefined),
    unpin: jest.fn().mockResolvedValue(undefined),
    pinList: jest.fn().mockResolvedValue({
      count: 1,
      rows: [{
        ipfs_pin_hash: 'QmTestHash123',
        size: 1024,
        date_pinned: '2023-01-01T00:00:00.000Z',
        metadata: { name: 'test-file' }
      }]
    }),
    userPinPolicy: jest.fn().mockResolvedValue({
      regions: [{ id: 'FRA1', desiredReplicationCount: 2 }]
    })
  }));
});

describe('PinataIPFSService', () => {
  let ipfsService: PinataIPFSService;

  beforeEach(() => {
    jest.clearAllMocks();
    ipfsService = new PinataIPFSService();
  });

  describe('initialization', () => {
    it('should initialize with valid configuration', () => {
      expect(ipfsService).toBeInstanceOf(PinataIPFSService);
    });

    it('should throw error with invalid configuration', () => {
      const originalApiKey = process.env.PINATA_API_KEY;
      delete process.env.PINATA_API_KEY;
      delete process.env.PINATA_JWT;

      expect(() => new PinataIPFSService()).toThrow(IPFSError);

      process.env.PINATA_API_KEY = originalApiKey;
    });
  });

  describe('health check', () => {
    it('should return true when Pinata is accessible', async () => {
      const result = await ipfsService.healthCheck();
      expect(result).toBe(true);
    });

    it('should return false when Pinata is not accessible', async () => {
      ipfsService['pinata'].testAuthentication = jest.fn().mockRejectedValue(new Error('Network error'));

      const result = await ipfsService.healthCheck();
      expect(result).toBe(false);
    });
  });

  describe('content upload', () => {
    const testContent = Buffer.from('test content');
    const testFilename = 'test.txt';

    it('should upload content successfully', async () => {
      const result = await ipfsService.upload(testContent, testFilename);

      expect(result).toEqual({
        hash: 'QmTestHash123',
        size: testContent.length,
        url: expect.stringContaining('QmTestHash123'),
        uploadedAt: expect.any(Date)
      });
    });

    it('should validate content before upload', async () => {
      const largeContent = Buffer.alloc(200 * 1024 * 1024);

      await expect(ipfsService.upload(largeContent, 'large.bin')).rejects.toThrow(IPFSError);
    });

    it('should handle upload errors', async () => {
      ipfsService['pinata'].pinFileToIPFS = jest.fn().mockRejectedValue(new Error('Upload failed'));

      await expect(ipfsService.upload(testContent, testFilename)).rejects.toThrow(IPFSError);
    });

    it('should reject malicious content', async () => {
      const maliciousContent = Buffer.from('<script>alert("xss")</script>');

      await expect(ipfsService.upload(maliciousContent, 'malicious.html')).rejects.toThrow(IPFSError);
    });
  });

  describe('pin operations', () => {
    const testHash = 'QmTestHash123';

    it('should pin content successfully', async () => {
      await expect(ipfsService.pin(testHash)).resolves.not.toThrow();
    });

    it('should check pin status', async () => {
      const status = await ipfsService.checkPinStatus(testHash);

      expect(status).toEqual({
        hash: testHash,
        isPinned: true,
        pinDate: expect.any(Date),
        nodeId: 'pinata'
      });
    });

    it('should unpin content', async () => {
      await expect(ipfsService.unpin(testHash)).resolves.not.toThrow();
    });
  });

  describe('batch operations', () => {
    it('should upload multiple files successfully', async () => {
      const files = [
        { content: Buffer.from('content1'), filename: 'file1.txt' },
        { content: Buffer.from('content2'), filename: 'file2.txt' }
      ];

      const results = await ipfsService.uploadBatch(files);

      expect(results).toHaveLength(2);
      expect(results[0]).toHaveProperty('hash');
      expect(results[1]).toHaveProperty('hash');
    });

    it('should handle partial batch failures', async () => {
      ipfsService['pinata'].pinFileToIPFS = jest.fn()
        .mockResolvedValueOnce({ IpfsHash: 'QmHash1', PinSize: 100 })
        .mockRejectedValueOnce(new Error('Upload failed'));

      const files = [
        { content: Buffer.from('content1'), filename: 'file1.txt' },
        { content: Buffer.from('content2'), filename: 'file2.txt' }
      ];

      const results = await ipfsService.uploadBatch(files);

      expect(results).toHaveLength(1);
    });
  });
});