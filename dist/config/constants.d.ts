export declare const PINATA_CONFIG: {
    readonly apiKey: string;
    readonly apiSecret: string;
    readonly jwt: string;
    readonly gateway: string;
    readonly timeout: number;
    readonly maxFileSize: number;
    readonly pinataMetadata: {
        readonly name: "GainForest Archive";
        readonly keyvalues: {
            readonly project: "gainforest-archiver";
            readonly version: "1.0.0";
        };
    };
    readonly pinataOptions: {
        readonly cidVersion: 1;
        readonly wrapWithDirectory: false;
        readonly customPinPolicy: {
            readonly regions: readonly [{
                readonly id: "FRA1";
                readonly desiredReplicationCount: 2;
            }, {
                readonly id: "NYC1";
                readonly desiredReplicationCount: 2;
            }];
        };
    };
};
export declare const CONTENT_VALIDATION: {
    readonly allowedMimeTypes: readonly ["application/pdf", "text/html", "text/plain", "image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "application/json", "text/csv"];
    readonly allowedExtensions: readonly [".pdf", ".html", ".htm", ".txt", ".json", ".csv", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".mov"];
    readonly maxFileSizeMB: number;
    readonly requireHttps: boolean;
    readonly maxRedirects: number;
    readonly scanForMalware: boolean;
};
//# sourceMappingURL=constants.d.ts.map