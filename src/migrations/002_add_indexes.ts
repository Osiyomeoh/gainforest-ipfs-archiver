import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('ecocerts', (table) => {
    table.index(['chain_id', 'contract_address']);
    table.index(['processed_at']);
    table.index(['created_at']);
  });

  await knex.schema.alterTable('attestations', (table) => {
    table.index(['ecocert_id']);
    table.index(['attester']);
    table.index(['created_at']);
  });

  await knex.schema.alterTable('archived_content', (table) => {
    table.index(['ecocert_id']);
    table.index(['status']);
    table.index(['original_url']);
    table.index(['archived_at']);
    table.index(['last_retry_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('archived_content', (table) => {
    table.dropIndex(['last_retry_at']);
    table.dropIndex(['archived_at']);
    table.dropIndex(['original_url']);
    table.dropIndex(['status']);
    table.dropIndex(['ecocert_id']);
  });

  await knex.schema.alterTable('attestations', (table) => {
    table.dropIndex(['created_at']);
    table.dropIndex(['attester']);
    table.dropIndex(['ecocert_id']);
  });

  await knex.schema.alterTable('ecocerts', (table) => {
    table.dropIndex(['created_at']);
    table.dropIndex(['processed_at']);
    table.dropIndex(['chain_id', 'contract_address']);
  });
}
