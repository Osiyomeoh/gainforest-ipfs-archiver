import 'dotenv/config';
import { ArchiverCLI } from './cli';
import { GainForestArchiver } from './app';
import { loadConfig } from './config/environment';
import { logger } from './utils/logger';

/**
 * Main entry point for the application

 */
async function main(): Promise<void> {
  try {
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });

    const config = loadConfig();
    logger.info('Configuration loaded successfully', {
      environment: config.environment,
      nodeEnv: process.env.NODE_ENV
    });

    const isCliMode = process.argv.length > 2;

    if (isCliMode) {
      logger.info('Starting CLI mode');
      const cli = new ArchiverCLI();
      await cli.run();
    } else {
      logger.info('Starting programmatic mode');
      const archiver = new GainForestArchiver(config);
      
      await archiver.initialize();
      logger.info('Archiver initialized, ready for operations');
      
      const { summary } = await archiver.processAllEcocerts();
      logger.info('Processing completed', summary);
      
      await archiver.shutdown();
    }

  } catch (error) {
    logger.error('Application startup failed', { error });
    console.error('Fatal error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error in main:', error);
    process.exit(1);
  });
}

export { GainForestArchiver, ArchiverCLI };
export * from './types/ecocert';
export * from './types/database';
export * from './types/ipfs';