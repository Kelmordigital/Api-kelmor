import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { Readable } from 'stream';

/** Arquivo já gravado. */
export interface StoredFile {
    /** Referência a guardar no banco e a passar para `delete`. */
    path: string;
    /** Endereço para abrir o arquivo (relativo à API, como /uploads/..., ou absoluto). */
    url: string;
    size: number;
    mimeType: string;
    /** Nome do arquivo como veio do usuário. */
    originalName: string;
}

/** Onde os uploads ficam. Trocar disco por S3/R2 é uma nova implementação. */
export interface MediaStorage {
    save(folder: string, originalName: string, mimeType: string, content: Readable): Promise<StoredFile>;
    /**
     * Idempotente: apagar um arquivo que não existe não é erro. Aceita o `path`
     * ou a `url`; referências de outro storage são ignoradas.
     */
    delete(reference: string): Promise<void>;
}

/** Nome único preservando a extensão original. */
export function uniqueFileName(originalName: string): string {
    return `${Date.now()}-${crypto.randomUUID()}${path.extname(originalName).toLowerCase()}`;
}

/**
 * Grava em <root>/uploads/<folder>/, que o server expõe em /uploads. Só serve
 * com uma única instância da API: o disco do pod não é compartilhado e some
 * a cada deploy.
 */
export class LocalDiskMediaStorage implements MediaStorage {
    constructor(private readonly root: string = process.cwd()) {}

    async save(folder: string, originalName: string, mimeType: string, content: Readable): Promise<StoredFile> {
        const fileName = uniqueFileName(originalName);
        const relativePath = path.posix.join('uploads', folder, fileName);
        const fullPath = path.join(this.root, relativePath);

        await fs.mkdir(path.dirname(fullPath), { recursive: true });

        let size = 0;
        content.on('data', (chunk: Buffer) => { size += chunk.length; });
        try {
            await pipeline(content, createWriteStream(fullPath));
        } catch (err) {
            await this.delete(relativePath);
            throw err;
        }
        return { path: relativePath, url: `/${relativePath}`, size, mimeType, originalName };
    }

    async delete(reference: string): Promise<void> {
        if (/^https?:\/\//i.test(reference)) return;
        await fs.unlink(path.join(this.root, reference.replace(/^\/+/, ''))).catch(() => {});
    }
}
