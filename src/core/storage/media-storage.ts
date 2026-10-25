import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
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
export class LocalDiskMediaStorage implements MediaStorage {
    constructor(private readonly root: string = process.cwd()) {}

    async save(folder: string, originalName: string, mimeType: string, content: Readable): Promise<StoredFile> {
        const fileName = `${Date.now()}-${crypto.randomUUID()}${path.extname(originalName).toLowerCase()}`;
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
        return { path: relativePath, size, mimeType, originalName };
    }

    async delete(filePath: string): Promise<void> {
        await fs.unlink(path.join(this.root, filePath)).catch(() => {});
    }
}
