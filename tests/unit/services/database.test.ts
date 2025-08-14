import { DatabaseService } from '../../../src/services/database';
import { EcocertInsert, AttestationInsert, ArchivedContentInsert } from '../../../src/types/database';
import { DatabaseError } from '../../../src/types/errors';

jest.mock('knex', () => {
  return jest.fn(() => ({
    schema: {
      createTable: jest.fn().mockReturnThis(),
      dropTable: jest.fn().mockReturnThis(),
    },
    migrate: {
      latest: jest.fn().mockResolvedValue([1, ['001_initial_schema.ts']]),
      currentVersion: jest.fn().mockResolvedValue('001'),
      rollback: jest.fn().mockResolvedValue([1, ['001_initial_schema.ts']])
    },
    raw: jest.fn().mockResolvedValue({ rows: [{ test: 1 }] }),
    on: jest.fn(),
    destroy: jest.fn().mockResolvedValue(undefined),
    transaction: jest.fn((callback) => callback({
      insert: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      onConflict: jest.fn().mockReturnThis(),
      ignore: jest.fn().mockResolvedValue(undefined),
      returning: jest.fn().mockResolvedValue([{ id: 1 }]),
      increment: jest.fn().mockResolvedValue(1)
    })),
    insert: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    whereNull: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue({ id: 1 }),
    update: jest.fn().mockResolvedValue(1),
    onConflict: jest.fn().mockReturnThis(),
    ignore: jest.fn().mockResolvedValue(undefined),
    returning: jest.fn().mockResolvedValue([{ id: 1 }]),
    count: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockResolvedValue([
      { status: 'completed', count: '5' },
      { status: 'failed', count: '2' }
    ])
  }));
});

describe('DatabaseService', () => {
  let databaseService: DatabaseService;

  beforeEach(() => {
    jest.clearAllMocks();
    databaseService = DatabaseService.getInstance();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await expect(databaseService.initialize()).resolves.not.toThrow();
    });

    it('should handle initialization errors', async () => {
      const mockError = new Error('Connection failed');
      databaseService['db'].raw = jest.fn().mockRejectedValue(mockError);

      await expect(databaseService.initialize()).rejects.toThrow(DatabaseError);
    });
  });

  describe('health check', () => {
    it('should return healthy status when database is accessible', async () => {
      const result = await databaseService.healthCheck();
      
      expect(result).toEqual({
        status: 'healthy',
        connection: true,
        latency: expect.any(Number)
      });
    });

    it('should return unhealthy status when database is not accessible', async () => {
      databaseService['db'].raw = jest.fn().mockRejectedValue(new Error('Connection lost'));

      const result = await databaseService.healthCheck();
      
      expect(result).toEqual({
        status: 'unhealthy',
        connection: false
      });
    });
  });

  describe('ecocert operations', () => {
    const mockEcocert: EcocertInsert = {
      id: '42220-0x123-456',
      chain_id: '42220',
      contract_address: '0x123',
      token_id: '456',
      title: 'Test Ecocert',
      description: 'Test Description'
    };

    it('should insert ecocert successfully', async () => {
      await expect(databaseService.insertEcocert(mockEcocert)).resolves.not.toThrow();
    });

    it('should handle ecocert insert errors', async () => {
      databaseService['db'].insert = jest.fn(() => {
        throw new Error('Insert failed');
      });

      await expect(databaseService.insertEcocert(mockEcocert)).rejects.toThrow(DatabaseError);
    });

    it('should get unprocessed ecocerts', async () => {
      const mockEcocerts = [mockEcocert];
      databaseService['db'].whereNull = jest.fn().mockReturnThis();
      databaseService['db'].orderBy = jest.fn().mockReturnThis();
      databaseService['db'].limit = jest.fn().mockReturnThis();
      databaseService['db'].select = jest.fn().mockResolvedValue(mockEcocerts);

      const result = await databaseService.getUnprocessedEcocerts(10);
      
      expect(result).toEqual(mockEcocerts);
    });

    it('should mark ecocert as processed', async () => {
      databaseService['db'].where = jest.fn().mockReturnThis();
      databaseService['db'].update = jest.fn().mockResolvedValue(1);

      await expect(databaseService.markEcocertProcessed('test-id')).resolves.not.toThrow();
    });

    it('should throw error when marking non-existent ecocert as processed', async () => {
      databaseService['db'].where = jest.fn().mockReturnThis();
      databaseService['db'].update = jest.fn().mockResolvedValue(0);

      await expect(databaseService.markEcocertProcessed('non-existent')).rejects.toThrow(DatabaseError);
    });
  });

  describe('archiving statistics', () => {
    it('should calculate archiving statistics correctly', async () => {
      const mockPromiseAll = jest.spyOn(Promise, 'all').mockResolvedValue([
        { total: '10', processed: '8' },
        { total: '15' },
        [
          { status: 'completed', count: '12' },
          { status: 'failed', count: '3' }
        ],
        { total_urls: '15', ecocerts_with_content: '8' }
      ]);

      const stats = await databaseService.getArchivingStats();

      expect(stats).toEqual({
        total_ecocerts: 10,
        processed_ecocerts: 8,
        total_attestations: 15,
        total_urls_found: 15,
        successfully_archived: 12,
        failed_archives: 3,
        pending_archives: 0,
        average_urls_per_ecocert: 1.5,
        success_rate: 80
      });

      mockPromiseAll.mockRestore();
    });
  });
});