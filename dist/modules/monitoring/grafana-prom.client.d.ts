/** Consultas PromQL por métrica exposta ao painel Super Admin. */
export declare const METRICS: {
    readonly cpu: readonly [{
        readonly name: "cpu";
        readonly expr: "100 - (avg(rate(node_cpu_seconds_total{mode=\"idle\"}[5m])) * 100)";
    }];
    readonly ram: readonly [{
        readonly name: "ram";
        readonly expr: "100 * (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)";
    }];
    readonly sessions: readonly [{
        readonly name: "sessions";
        readonly expr: "whatsapp_sessions_connected";
    }];
    readonly sessions_by_connection: readonly [{
        readonly name: "sessions_by_connection";
        readonly expr: "whatsapp_sessions_by_connection";
    }];
    readonly http: readonly [{
        readonly name: "req_per_min";
        readonly expr: "sum(rate(http_requests_total[5m])) * 60";
    }, {
        readonly name: "err_per_min";
        readonly expr: "sum(rate(http_requests_total{status_code=~\"5..\"}[5m])) * 60";
    }];
};
export declare const RANGES: {
    readonly '1h': {
        readonly seconds: 3600;
        readonly step: 60;
    };
    readonly '24h': {
        readonly seconds: 86400;
        readonly step: 300;
    };
    readonly '7d': {
        readonly seconds: 604800;
        readonly step: 3600;
    };
};
export type MetricKey = keyof typeof METRICS;
export type RangeKey = keyof typeof RANGES;
export type MetricPoint = {
    t: number;
    v: number;
};
export type MetricSeries = {
    name: string;
    points: MetricPoint[];
};
export type MetricHistory = {
    metric: MetricKey;
    range: RangeKey;
    series: MetricSeries[];
};
export declare function _clearCacheForTests(): void;
export declare function fetchMetricHistory(metric: MetricKey, range: RangeKey): Promise<MetricHistory>;
//# sourceMappingURL=grafana-prom.client.d.ts.map