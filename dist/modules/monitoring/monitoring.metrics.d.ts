import { Registry, Counter, Histogram, Gauge } from 'prom-client';
export declare const metricsRegistry: Registry<"text/plain; version=0.0.4; charset=utf-8">;
export declare const httpRequestsTotal: Counter<"method" | "route" | "status_code">;
export declare const httpRequestDuration: Histogram<"method" | "route">;
export declare const whatsappSessionsConnected: Gauge<string>;
export declare const whatsappSessionsByConnection: Gauge<"connection_id" | "connection_name">;
export declare function recordHttpRequest(method: string, route: string, statusCode: number, durationMs: number): void;
//# sourceMappingURL=monitoring.metrics.d.ts.map