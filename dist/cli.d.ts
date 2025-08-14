export declare class ArchiverCLI {
    private program;
    private archiver;
    constructor();
    private setupCommands;
    run(argv?: string[]): Promise<void>;
    private handleCommand;
    private processAllCommand;
    private processSpecificCommand;
    private statsCommand;
    private retryCommand;
    private healthCommand;
    private dbMigrateCommand;
    private dbResetCommand;
    private displayProcessingResults;
}
//# sourceMappingURL=cli.d.ts.map