import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DatabaseService } from '../src/services/database';

let postgresContainer: StartedPostgreSqlContainer;
let databaseService: DatabaseService;

beforeAll(async () => {
  postgresContainer = await new PostgreSqlContainer('postgres:15-alpine')
    .withDatabase('test_db')
    .withUsername('test_user')
    .withPassword('test_password')
    .start();

  process.env.TEST_DB_HOST = postgresContainer.getHost();
  process.env.TEST_DB_PORT = postgresContainer.getPort().toString();
  process.env.TEST_DB_NAME = 'test_db';
  process.env.TEST_DB_USER = 'test_user';
  process.env.TEST_DB_PASSWORD = 'test_password';

  databaseService = DatabaseService.getInstance();
  await databaseService.initialize();
}, 60000);

afterAll(async () => {
  if (databaseService) {
    await databaseService.destroy();
  }
  
  if (postgresContainer) {
    await postgresContainer.stop();
  }
}, 30000);

beforeEach(async () => {
  await databaseService.executeRaw(`
    TRUNCATE TABLE archived_content, attestations, ecocerts RESTART IDENTITY CASCADE
  `);
});

export { databaseService };