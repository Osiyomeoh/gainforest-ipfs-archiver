import { Knex } from 'knex';

export interface DatabaseEnvironment {
  development: Knex.Config;
  test: Knex.Config;
  staging: Knex.Config;
  production: Knex.Config;
}

export const databaseConfig: DatabaseEnvironment = {
  development: {
    client: 'postgresql',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'gainforest_archiver_dev',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
    },
    pool: {
      min: 2,
      max: 10,
      acquireTimeoutMillis: 60000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    },
    migrations: {
      directory: './src/migrations',
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: './src/seeds'
    }
  },

  test: {
    client: 'postgresql',
    connection: {
      host: process.env.TEST_DB_HOST || 'localhost',
      port: Number(process.env.TEST_DB_PORT) || 5432,
      database: process.env.TEST_DB_NAME || 'gainforest_archiver_test',
      user: process.env.TEST_DB_USER || 'postgres',
      password: process.env.TEST_DB_PASSWORD || 'password',
    },
    pool: {
      min: 1,
      max: 5
    },
    migrations: {
      directory: './src/migrations'
    }
  },

  staging: {
    client: 'postgresql',
    connection: {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    },
    pool: {
      min: 5,
      max: 20,
      acquireTimeoutMillis: 60000,
    },
    migrations: {
      directory: './src/migrations'
    }
  },

  production: {
    client: 'postgresql',
    connection: {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    },
    pool: {
      min: 10,
      max: 50,
      acquireTimeoutMillis: 60000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      createRetryIntervalMillis: 200,
    },
    migrations: {
      directory: './src/migrations'
    },
    
    asyncStackTraces: false,
    debug: false,
  }
};