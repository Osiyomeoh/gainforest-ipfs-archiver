"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArchiverCLI = exports.GainForestArchiver = void 0;
require("dotenv/config");
const cli_1 = require("./cli");
Object.defineProperty(exports, "ArchiverCLI", { enumerable: true, get: function () { return cli_1.ArchiverCLI; } });
const app_1 = require("./app");
Object.defineProperty(exports, "GainForestArchiver", { enumerable: true, get: function () { return app_1.GainForestArchiver; } });
const environment_1 = require("./config/environment");
const logger_1 = require("./utils/logger");
async function main() {
    try {
        process.on('uncaughtException', (error) => {
            console.error('Uncaught Exception:', error);
            process.exit(1);
        });
        process.on('unhandledRejection', (reason, promise) => {
            console.error('Unhandled Rejection at:', promise, 'reason:', reason);
            process.exit(1);
        });
        const config = (0, environment_1.loadConfig)();
        logger_1.logger.info('Configuration loaded successfully', {
            environment: config.environment,
            nodeEnv: process.env.NODE_ENV
        });
        const isCliMode = process.argv.length > 2;
        if (isCliMode) {
            logger_1.logger.info('Starting CLI mode');
            const cli = new cli_1.ArchiverCLI();
            await cli.run();
        }
        else {
            logger_1.logger.info('Starting programmatic mode');
            const archiver = new app_1.GainForestArchiver(config);
            await archiver.initialize();
            logger_1.logger.info('Archiver initialized, ready for operations');
            const { summary } = await archiver.processAllEcocerts();
            logger_1.logger.info('Processing completed', summary);
            await archiver.shutdown();
        }
    }
    catch (error) {
        logger_1.logger.error('Application startup failed', { error });
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
__exportStar(require("./types/ecocert"), exports);
__exportStar(require("./types/database"), exports);
__exportStar(require("./types/ipfs"), exports);
//# sourceMappingURL=main.js.map