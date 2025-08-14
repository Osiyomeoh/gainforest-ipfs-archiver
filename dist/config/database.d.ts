import { Knex } from 'knex';
export interface DatabaseEnvironment {
    development: Knex.Config;
    test: Knex.Config;
    staging: Knex.Config;
    production: Knex.Config;
}
export declare const databaseConfig: DatabaseEnvironment;
//# sourceMappingURL=database.d.ts.map