import { AppConfig } from '../types/config';
export declare function loadConfig(): AppConfig;
export declare function getServiceConfig<K extends keyof AppConfig>(service: K, config?: AppConfig): AppConfig[K];
//# sourceMappingURL=environment.d.ts.map