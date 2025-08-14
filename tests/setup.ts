import { logger } from '../src/utils/logger';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  

  process.env.TEST_DB_NAME = 'gainforest_archiver_test';
  
  process.env.PINATA_API_KEY = 'test_api_key';
  process.env.PINATA_API_SECRET = 'test_api_secret';
  
  process.env.REQUEST_TIMEOUT_MS = '5000';
  process.env.MAX_RETRY_ATTEMPTS = '1';
});

afterAll(async () => {
  await new Promise(resolve => setTimeout(resolve, 100));
});

global.console = {
  ...console,
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: process.env.DEBUG_TESTS ? console.error : jest.fn(),
};