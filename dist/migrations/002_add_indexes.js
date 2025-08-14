"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
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
async function down(knex) {
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
//# sourceMappingURL=002_add_indexes.js.map