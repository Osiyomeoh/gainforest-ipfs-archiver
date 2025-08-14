"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArchiverCLI = void 0;
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const table_1 = require("table");
const app_1 = require("./app");
const environment_1 = require("./config/environment");
class ArchiverCLI {
    constructor() {
        this.program = new commander_1.Command();
        this.setupCommands();
    }
    setupCommands() {
        this.program
            .name('gainforest-archiver')
            .description('GainForest IPFS Archiving Tool for Environmental Impact Evidence')
            .version('1.0.0');
        this.program
            .command('process-all')
            .description('Process all sample ecocerts and archive their content to IPFS')
            .option('-v, --verbose', 'Enable verbose output')
            .option('--dry-run', 'Show what would be processed without actually processing')
            .action(async (options) => {
            await this.handleCommand(() => this.processAllCommand(options));
        });
        this.program
            .command('process')
            .description('Process specific ecocerts by ID')
            .argument('<ecocert-ids...>', 'Ecocert IDs to process')
            .option('-v, --verbose', 'Enable verbose output')
            .option('--dry-run', 'Show what would be processed without actually processing')
            .action(async (ecocertIds, options) => {
            await this.handleCommand(() => this.processSpecificCommand(ecocertIds, options));
        });
        this.program
            .command('stats')
            .description('Show archiving statistics and system health')
            .option('--json', 'Output statistics in JSON format')
            .action(async (options) => {
            await this.handleCommand(() => this.statsCommand(options));
        });
        this.program
            .command('retry')
            .description('Retry failed archive operations')
            .option('-l, --limit <number>', 'Maximum number of failed archives to retry', '50')
            .option('-v, --verbose', 'Enable verbose output')
            .action(async (options) => {
            await this.handleCommand(() => this.retryCommand(options));
        });
        this.program
            .command('health')
            .description('Perform system health checks')
            .option('--json', 'Output health status in JSON format')
            .action(async (options) => {
            await this.handleCommand(() => this.healthCommand(options));
        });
        this.program
            .command('db')
            .description('Database management operations')
            .addCommand(new commander_1.Command('migrate')
            .description('Run database migrations')
            .action(async () => {
            await this.handleCommand(() => this.dbMigrateCommand());
        }))
            .addCommand(new commander_1.Command('reset')
            .description('Reset database (WARNING: Deletes all data)')
            .option('--confirm', 'Confirm the reset operation')
            .action(async (options) => {
            await this.handleCommand(() => this.dbResetCommand(options));
        }));
    }
    async run(argv = process.argv) {
        try {
            await this.program.parseAsync(argv);
        }
        catch (error) {
            console.error(chalk_1.default.red('CLI Error:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    }
    async handleCommand(commandHandler) {
        const spinner = (0, ora_1.default)('Initializing...').start();
        try {
            const config = (0, environment_1.loadConfig)();
            this.archiver = new app_1.GainForestArchiver(config);
            spinner.text = 'Initializing services...';
            await this.archiver.initialize();
            spinner.succeed('Services initialized successfully');
            await commandHandler();
        }
        catch (error) {
            spinner.fail('Command failed');
            console.error(chalk_1.default.red('Error:'), error instanceof Error ? error.message : String(error));
            if (process.env.NODE_ENV === 'development' && error instanceof Error) {
                console.error(chalk_1.default.gray(error.stack));
            }
            process.exit(1);
        }
        finally {
            if (this.archiver) {
                try {
                    await this.archiver.shutdown();
                }
                catch (shutdownError) {
                    console.error(chalk_1.default.yellow('Warning: Shutdown error:'), shutdownError instanceof Error ? shutdownError.message : String(shutdownError));
                }
            }
        }
    }
    async processAllCommand(options) {
        if (options.dryRun) {
            console.log(chalk_1.default.blue('DRY RUN MODE - No actual processing will occur'));
            const ecocertIds = this.archiver['ecocertService'].getSampleEcocertIds();
            console.log(chalk_1.default.cyan('Sample ecocerts that would be processed:'));
            ecocertIds.forEach((id, index) => {
                console.log(`  ${index + 1}. ${id}`);
            });
            return;
        }
        const spinner = (0, ora_1.default)('Processing all sample ecocerts...').start();
        try {
            const { results, summary } = await this.archiver.processAllEcocerts();
            spinner.succeed('Processing completed');
            this.displayProcessingResults(results, summary, options.verbose);
        }
        catch (error) {
            spinner.fail('Processing failed');
            throw error;
        }
    }
    async processSpecificCommand(ecocertIds, options) {
        if (options.dryRun) {
            console.log(chalk_1.default.blue('DRY RUN MODE - No actual processing will occur'));
            console.log(chalk_1.default.cyan('Ecocerts that would be processed:'));
            ecocertIds.forEach((id, index) => {
                console.log(`  ${index + 1}. ${id}`);
            });
            return;
        }
        const spinner = (0, ora_1.default)(`Processing ${ecocertIds.length} ecocerts...`).start();
        try {
            const { results, summary } = await this.archiver.processSpecificEcocerts(ecocertIds);
            spinner.succeed('Processing completed');
            this.displayProcessingResults(results, summary, options.verbose);
        }
        catch (error) {
            spinner.fail('Processing failed');
            throw error;
        }
    }
    async statsCommand(options) {
        const spinner = (0, ora_1.default)('Retrieving statistics...').start();
        try {
            const stats = await this.archiver.getArchivingStatistics();
            spinner.succeed('Statistics retrieved');
            if (options.json) {
                console.log(JSON.stringify(stats, null, 2));
                return;
            }
            console.log(chalk_1.default.bold.blue('\n📊 Archiving Statistics'));
            console.log('─'.repeat(50));
            const statsTable = [
                ['Metric', 'Value'],
                ['Total Ecocerts', stats.total_ecocerts.toString()],
                ['Processed Ecocerts', stats.processed_ecocerts.toString()],
                ['Total Attestations', stats.total_attestations.toString()],
                ['URLs Found', stats.total_urls_found.toString()],
                ['Successfully Archived', stats.successfully_archived.toString()],
                ['Failed Archives', stats.failed_archives.toString()],
                ['Pending Archives', stats.pending_archives.toString()],
                ['Average URLs per Ecocert', stats.average_urls_per_ecocert.toFixed(2)],
                ['Success Rate', `${stats.success_rate.toFixed(1)}%`],
                ['Last Updated', stats.lastUpdated.toISOString()]
            ];
            console.log((0, table_1.table)(statsTable, {
                border: {
                    topBody: '─',
                    topJoin: '┬',
                    topLeft: '┌',
                    topRight: '┐',
                    bottomBody: '─',
                    bottomJoin: '┴',
                    bottomLeft: '└',
                    bottomRight: '┘',
                    bodyLeft: '│',
                    bodyRight: '│',
                    bodyJoin: '│',
                    joinBody: '─',
                    joinLeft: '├',
                    joinRight: '┤',
                    joinJoin: '┼'
                }
            }));
            console.log(chalk_1.default.bold.blue('\n🏥 System Health'));
            console.log('─'.repeat(50));
            Object.entries(stats.systemHealth).forEach(([service, healthy]) => {
                const status = healthy ? chalk_1.default.green('✅ Healthy') : chalk_1.default.red('❌ Unhealthy');
                console.log(`${service.padEnd(15)} ${status}`);
            });
        }
        catch (error) {
            spinner.fail('Failed to retrieve statistics');
            throw error;
        }
    }
    async retryCommand(options) {
        const limit = parseInt(options.limit) || 50;
        const spinner = (0, ora_1.default)(`Retrying up to ${limit} failed archives...`).start();
        try {
            const result = await this.archiver.retryFailedArchives(limit);
            spinner.succeed('Retry operation completed');
            console.log(chalk_1.default.bold.blue('\n🔄 Retry Results'));
            console.log('─'.repeat(30));
            console.log(`Archives Attempted: ${chalk_1.default.cyan(result.attempted)}`);
            console.log(`Successfully Retried: ${chalk_1.default.green(result.successful)}`);
            console.log(`Still Failed: ${chalk_1.default.red(result.stillFailed)}`);
            if (result.attempted > 0) {
                const retrySuccessRate = (result.successful / result.attempted) * 100;
                console.log(`Retry Success Rate: ${chalk_1.default.yellow(retrySuccessRate.toFixed(1))}%`);
            }
        }
        catch (error) {
            spinner.fail('Retry operation failed');
            throw error;
        }
    }
    async healthCommand(options) {
        const spinner = (0, ora_1.default)('Performing health checks...').start();
        try {
            const healthChecks = await this.archiver.performHealthChecks();
            spinner.succeed('Health checks completed');
            if (options.json) {
                console.log(JSON.stringify(healthChecks, null, 2));
                return;
            }
            console.log(chalk_1.default.bold.blue('\n🏥 System Health Status'));
            console.log('─'.repeat(40));
            Object.entries(healthChecks).forEach(([service, healthy]) => {
                const icon = healthy ? '✅' : '❌';
                const status = healthy ? chalk_1.default.green('Healthy') : chalk_1.default.red('Unhealthy');
                console.log(`${icon} ${service.padEnd(15)} ${status}`);
            });
            const allHealthy = Object.values(healthChecks).every(h => h);
            if (allHealthy) {
                console.log(chalk_1.default.green('\n🎉 All systems operational!'));
            }
            else {
                console.log(chalk_1.default.red('\n⚠️  Some systems need attention'));
                process.exit(1);
            }
        }
        catch (error) {
            spinner.fail('Health checks failed');
            throw error;
        }
    }
    async dbMigrateCommand() {
        const spinner = (0, ora_1.default)('Running database migrations...').start();
        try {
            spinner.succeed('Database migrations completed');
            console.log(chalk_1.default.green('✅ Database is up to date'));
        }
        catch (error) {
            spinner.fail('Database migration failed');
            throw error;
        }
    }
    async dbResetCommand(options) {
        if (!options.confirm) {
            console.log(chalk_1.default.red('⚠️  WARNING: This will delete ALL data in the database!'));
            console.log(chalk_1.default.yellow('To confirm, run: db reset --confirm'));
            return;
        }
        const spinner = (0, ora_1.default)('Resetting database...').start();
        try {
            const dbService = this.archiver['databaseService'];
            await dbService['db'].migrate.rollback(undefined, true);
            spinner.text = 'Dropped all tables...';
            await dbService['db'].migrate.latest();
            spinner.text = 'Recreated database schema...';
            spinner.succeed('Database reset completed');
            console.log(chalk_1.default.green('✅ Database has been reset'));
            console.log(chalk_1.default.yellow('ℹ️  All previous data has been permanently deleted'));
        }
        catch (error) {
            spinner.fail('Database reset failed');
            throw error;
        }
    }
    displayProcessingResults(results, summary, verbose = false) {
        console.log(chalk_1.default.bold.blue('\n📋 Processing Results'));
        console.log('═'.repeat(80));
        console.log(chalk_1.default.bold.cyan('\n📊 Summary'));
        console.log('─'.repeat(40));
        const summaryTable = [
            ['Metric', 'Value'],
            ['Total Ecocerts', summary.totalEcocerts.toString()],
            ['Completed', `${summary.completedEcocerts} (${chalk_1.default.green(summary.successRate.toFixed(1) + '%')})`],
            ['Failed', `${summary.failedEcocerts} (${chalk_1.default.red(((summary.failedEcocerts / summary.totalEcocerts) * 100).toFixed(1) + '%')})`],
            ['Total Attestations', summary.totalAttestations.toString()],
            ['Total URLs Found', summary.totalUrls.toString()],
            ['Successfully Archived', `${summary.totalArchived} (${chalk_1.default.green(summary.archivalRate.toFixed(1) + '%')})`],
            ['Total Errors', summary.totalErrors.toString()],
            ['Processing Time', `${(summary.duration / 1000).toFixed(2)}s`],
            ['Average per Ecocert', `${(summary.averageProcessingTime / 1000).toFixed(2)}s`]
        ];
        console.log((0, table_1.table)(summaryTable, {
            border: {
                topBody: '─', topJoin: '┬', topLeft: '┌', topRight: '┐',
                bottomBody: '─', bottomJoin: '┴', bottomLeft: '└', bottomRight: '┘',
                bodyLeft: '│', bodyRight: '│', bodyJoin: '│',
                joinBody: '─', joinLeft: '├', joinRight: '┤', joinJoin: '┼'
            }
        }));
        if (verbose || results.some(r => r.status === 'failed')) {
            console.log(chalk_1.default.bold.cyan('\n📋 Detailed Results'));
            console.log('─'.repeat(80));
            const detailTable = [
                ['Ecocert ID', 'Status', 'Attestations', 'URLs', 'Archived', 'Errors']
            ];
            results.forEach(result => {
                const statusIcon = result.status === 'completed' ? '✅' : '❌';
                const statusText = result.status === 'completed' ?
                    chalk_1.default.green('Completed') : chalk_1.default.red('Failed');
                const shortId = result.ecocertId.split('-')[2].slice(-8) + '...';
                detailTable.push([
                    shortId,
                    `${statusIcon} ${statusText}`,
                    result.attestationsFound.toString(),
                    result.urlsExtracted.toString(),
                    result.successfullyArchived.toString(),
                    result.errors.length.toString()
                ]);
            });
            console.log((0, table_1.table)(detailTable, {
                border: {
                    topBody: '─', topJoin: '┬', topLeft: '┌', topRight: '┐',
                    bottomBody: '─', bottomJoin: '┴', bottomLeft: '└', bottomRight: '┘',
                    bodyLeft: '│', bodyRight: '│', bodyJoin: '│',
                    joinBody: '─', joinLeft: '├', joinRight: '┤', joinJoin: '┼'
                }
            }));
            const failedResults = results.filter(r => r.errors.length > 0);
            if (failedResults.length > 0) {
                console.log(chalk_1.default.bold.red('\n❌ Errors Encountered'));
                console.log('─'.repeat(60));
                failedResults.forEach(result => {
                    const shortId = result.ecocertId.split('-')[2].slice(-8) + '...';
                    console.log(`\n${chalk_1.default.red('•')} ${chalk_1.default.bold(shortId)}:`);
                    result.errors.forEach(error => {
                        console.log(`   ${chalk_1.default.red('-')} ${error}`);
                    });
                });
            }
        }
        if (summary.completedEcocerts === summary.totalEcocerts) {
            console.log(chalk_1.default.bold.green('\n🎉 All ecocerts processed successfully!'));
        }
        else if (summary.completedEcocerts > 0) {
            console.log(chalk_1.default.bold.yellow('\n⚠️  Processing completed with some failures'));
        }
        else {
            console.log(chalk_1.default.bold.red('\n💥 All ecocerts failed to process'));
        }
    }
}
exports.ArchiverCLI = ArchiverCLI;
//# sourceMappingURL=cli.js.map