"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
    await knex.schema.createTable('ecocerts', (table) => {
        table.string('id', 255).primary();
        table.string('chain_id', 10).notNullable();
        table.string('contract_address', 42).notNullable();
        table.string('token_id', 100).notNullable();
        table.string('title', 500).nullable();
        table.text('description').nullable();
        table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
        table.timestamp('processed_at').nullable();
        table.integer('attestation_count').defaultTo(0);
        table.integer('archived_content_count').defaultTo(0);
        table.index(['chain_id', 'contract_address'], 'idx_ecocerts_chain_contract');
        table.index('created_at', 'idx_ecocerts_created');
        table.index('processed_at', 'idx_ecocerts_processed');
    });
    await knex.schema.createTable('attestations', (table) => {
        table.string('uid', 66).primary();
        table.string('ecocert_id', 255).notNullable();
        table.string('schema_uid', 66).notNullable();
        table.string('attester', 42).notNullable();
        table.jsonb('data').notNullable();
        table.bigInteger('creation_block_timestamp').nullable();
        table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
        table.integer('sources_count').defaultTo(0);
        table.foreign('ecocert_id')
            .references('ecocerts.id')
            .onDelete('CASCADE')
            .onUpdate('CASCADE');
        table.index('ecocert_id', 'idx_attestations_ecocert');
        table.index('schema_uid', 'idx_attestations_schema');
        table.index('attester', 'idx_attestations_attester');
        table.index('creation_block_timestamp', 'idx_attestations_timestamp');
    });
    await knex.schema.createTable('archived_content', (table) => {
        table.increments('id').primary();
        table.string('ecocert_id', 255).notNullable();
        table.string('attestation_uid', 66).notNullable();
        table.text('original_url').notNullable();
        table.string('content_type', 100).notNullable();
        table.string('file_extension', 10).nullable();
        table.string('ipfs_hash', 100).notNullable().unique();
        table.string('ipfs_url', 200).notNullable();
        table.bigInteger('file_size').nullable();
        table.string('content_hash', 64).nullable();
        table.timestamp('archived_at').defaultTo(knex.fn.now()).notNullable();
        table.enum('status', ['pending', 'downloading', 'uploading', 'completed', 'failed'])
            .defaultTo('pending')
            .notNullable();
        table.text('error_message').nullable();
        table.integer('retry_count').defaultTo(0);
        table.timestamp('last_retry_at').nullable();
        table.foreign('ecocert_id')
            .references('ecocerts.id')
            .onDelete('CASCADE')
            .onUpdate('CASCADE');
        table.foreign('attestation_uid')
            .references('attestations.uid')
            .onDelete('CASCADE')
            .onUpdate('CASCADE');
        table.index('ecocert_id', 'idx_archived_ecocert');
        table.index('ipfs_hash', 'idx_archived_ipfs_hash');
        table.index('status', 'idx_archived_status');
        table.index('archived_at', 'idx_archived_date');
        table.index(['status', 'retry_count'], 'idx_archived_retry');
        table.index('original_url', 'idx_archived_url');
    });
    await knex.schema.raw(`
    CREATE VIEW archiving_summary AS
    SELECT 
      e.id as ecocert_id,
      e.title,
      e.chain_id,
      COUNT(DISTINCT a.uid) as attestation_count,
      COUNT(DISTINCT ac.id) as total_archived_count,
      COUNT(DISTINCT CASE WHEN ac.status = 'completed' THEN ac.id END) as completed_count,
      COUNT(DISTINCT CASE WHEN ac.status = 'failed' THEN ac.id END) as failed_count,
      COUNT(DISTINCT CASE WHEN ac.status = 'pending' THEN ac.id END) as pending_count,
      e.processed_at
    FROM ecocerts e
    LEFT JOIN attestations a ON e.id = a.ecocert_id
    LEFT JOIN archived_content ac ON a.uid = ac.attestation_uid
    GROUP BY e.id, e.title, e.chain_id, e.processed_at
  `);
}
async function down(knex) {
    await knex.schema.raw('DROP VIEW IF EXISTS archiving_summary');
    await knex.schema.dropTableIfExists('archived_content');
    await knex.schema.dropTableIfExists('attestations');
    await knex.schema.dropTableIfExists('ecocerts');
}
//# sourceMappingURL=001_initial_schema.js.map