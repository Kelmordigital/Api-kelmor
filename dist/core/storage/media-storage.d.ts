import type { Readable } from 'stream';
/** Arquivo já gravado. `path` é relativo à raiz e servido em /<path>. */
export interface StoredFile {
    path: string;
    size: number;
    mimeType: string;
    /** Nome do arquivo como veio do usuário. */
    originalName: string;
}
/** Onde os uploads ficam. Trocar disco por S3/Spaces é uma nova implementação. */
export interface MediaStorage {
    save(folder: string, originalName: string, mimeType: string, content: Readable): Promise<StoredFile>;
    /** Idempotente: apagar um arquivo que não existe não é erro. */
    delete(filePath: string): Promise<void>;
}
/** Grava em <root>/uploads/<folder>/, que o server expõe em /uploads. */
export declare class LocalDiskMediaStorage implements MediaStorage {
    private readonly root;
    constructor(root?: string);
    save(folder: string, originalName: string, mimeType: string, content: Readable): Promise<StoredFile>;
    delete(filePath: string): Promise<void>;
}
//# sourceMappingURL=media-storage.d.ts.map