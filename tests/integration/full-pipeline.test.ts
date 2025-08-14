import { GainForestArchiver } from '../../src/app';
import { loadConfig } from '../../src/config/environment';
import { databaseService } from '../integration-setup';
import nock from 'nock';

describe('Full Pipeline Integration', () => {
  let archiver: GainForestArchiver;

  beforeEach(async () => {
    const config = loadConfig();
    archiver = new GainForestArchiver(config);

    nock('https://example.com')
      .get('/test.pdf')
      .reply(200, Buffer.from('PDF content'), {
        'content-type': 'application/pdf',
        'content-length': '11'
      });

    nock('https://drive.google.com')
      .get('/file/d/test123/view')
      .reply(200, Buffer.from('Google Drive content'), {
        'content-type': 'text/html',
        'content-length': '19'
      });

    nock('https://api.pinata.cloud')
      .post('/pinning/pinFileToIPFS')
      .reply(200, {
        IpfsHash: 'QmTestHash123456',
        PinSize: 1024,
        Timestamp: new Date().toISOString()
      });
  });

  afterEach(async () => {
    if (archiver) {
      await archiver.shutdown();
    }
    nock.cleanAll();
  });

  it('should process ecocerts end-to-end', async () => {
    await archiver.initialize();

    const ecocertIds = ['42220-0x16bA53B74c234C870c61EFC04cD418B8f2865959-123456789'];
    const { results, summary } = await archiver.processSpecificEcocerts(ecocertIds);

    expect(results).toHaveLength(1);
    expect(summary.totalEcocerts).toBe(1);

    const ecocerts = await databaseService.executeRaw(
      'SELECT * FROM ecocerts WHERE id = ?',
      [ecocertIds[0]]
    );
    expect(ecocerts).toHaveLength(1);

    const archivedContent = await databaseService.executeRaw(
      'SELECT * FROM archived_content WHERE ecocert_id = ?',
      [ecocertIds[0]]
    );
    expect(archivedContent.length).toBeGreaterThan(0);
  }, 30000);

  it('should handle network failures gracefully', async () => {
    await archiver.initialize();

    nock('https://example.com')
      .get('/failing-url.pdf')
      .reply(500, 'Internal Server Error');

    const ecocertIds = ['42220-0x16bA53B74c234C870c61EFC04cD418B8f2865959-failure-test'];
    const { results } = await archiver.processSpecificEcocerts(ecocertIds);

    expect(results[0].errors.length).toBeGreaterThan(0);
    expect(results[0].status).toBe('failed');
  });

  it('should retry failed operations', async () => {
    await archiver.initialize();

    const archiveId = await databaseService.insertArchivedContent({
      ecocert_id: '42220-0x16bA53B74c234C870c61EFC04cD418B8f2865959-retry-test',
      attestation_uid: 'test-attestation-uid',
      original_url: 'https://example.com/retry-test.pdf',
      content_type: 'application/pdf',
      ipfs_hash: '',
      ipfs_url: '',
      status: 'failed'
    });

    await databaseService.updateArchiveStatus(
        archiveId,
        'failed',
        'Initial failure for testing'
      );
   
      nock('https://example.com')
        .get('/retry-test.pdf')
        .reply(200, Buffer.from('Retry test content'), {
          'content-type': 'application/pdf',
          'content-length': '17'
        });
   
      const retryResult = await archiver.retryFailedArchives(10);
   
      expect(retryResult.attempted).toBe(1);
      expect(retryResult.successful).toBe(1);
      expect(retryResult.stillFailed).toBe(0);
   
      const updatedRecord = await databaseService.executeRaw(
        'SELECT status FROM archived_content WHERE id = ?',
        [archiveId]
      );
      expect(updatedRecord[0].status).toBe('completed');
    });
   
    it('should provide accurate statistics', async () => {
      await archiver.initialize();
   
      await databaseService.insertEcocert({
        id: 'stats-test-1',
        chain_id: '42220',
        contract_address: '0x123',
        token_id: '1',
        title: 'Stats Test 1'
      });
   
      await databaseService.insertEcocert({
        id: 'stats-test-2',
        chain_id: '42220',
        contract_address: '0x123',
        token_id: '2',
        title: 'Stats Test 2'
      });
   
      await databaseService.markEcocertProcessed('stats-test-1');
   
      const stats = await archiver.getArchivingStatistics();
   
      expect(stats.total_ecocerts).toBeGreaterThanOrEqual(2);
      expect(stats.processed_ecocerts).toBeGreaterThanOrEqual(1);
      expect(stats.systemHealth).toHaveProperty('database');
      expect(stats.lastUpdated).toBeInstanceOf(Date);
    });
   });