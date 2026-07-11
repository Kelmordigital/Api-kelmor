export declare class GraphApiError extends Error {
    readonly status: number;
    readonly metaError?: unknown | undefined;
    constructor(message: string, status: number, metaError?: unknown | undefined);
    /** 400/401 da Meta = token/sessão inválidos → conexão precisa ser refeita */
    get isAuthError(): boolean;
}
export declare function graphGet<T = any>(path: string, token: string): Promise<T>;
export declare function graphPost<T = any>(path: string, token: string, body: unknown): Promise<T>;
export declare function graphDelete<T = any>(path: string, token: string): Promise<T>;
/** Baixa um binário autenticado (URLs temporárias de mídia da lookaside.fbsbx.com). */
export declare function graphDownloadBinary(url: string, token: string): Promise<{
    buffer: Buffer;
    contentType: string;
}>;
//# sourceMappingURL=graph-api.client.d.ts.map