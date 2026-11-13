import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Readable } from 'stream';
import { uniqueFileName, type MediaStorage, type StoredFile } from './media-storage';

/** O que usamos do cliente S3 (o R2 fala o protocolo do S3). */
export interface ObjectStoreClient {
    send(command: PutObjectCommand | DeleteObjectCommand): Promise<unknown>;
}

export interface R2Config {
    endpoint: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    /** Endereço público do bucket (ex.: https://pub-xxx.r2.dev). */
    publicUrl: string;
    /** Pasta raiz dos arquivos da API no bucket, para não misturar com os da api-baileys. */
    prefix?: string;
}

/**
 * Grava no Cloudflare R2 — o mesmo bucket que a api-baileys usa para as mídias
 * do WhatsApp. Os arquivos ficam acessíveis pelo endereço público de qualquer
 * instância da API e sobrevivem aos deploys.
 */
export class R2MediaStorage implements MediaStorage {
    private readonly publicUrl: string;
    private readonly prefix: string;

    constructor(
        private readonly config: R2Config,
        private readonly client: ObjectStoreClient = new S3Client({
            region: 'auto',
            endpoint: config.endpoint,
            credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
        }),
    ) {
        this.publicUrl = config.publicUrl.replace(/\/+$/, '');
        this.prefix = (config.prefix ?? 'api').replace(/^\/+|\/+$/g, '');
    }

    async save(folder: string, originalName: string, mimeType: string, content: Readable): Promise<StoredFile> {
        // Upload com tamanho conhecido: o S3 recusa stream sem Content-Length (arquivos vão até 25 MB)
        const body = await toBuffer(content);
        const key = [this.prefix, folder.replace(/^\/+|\/+$/g, ''), uniqueFileName(originalName)].filter(Boolean).join('/');
        await this.client.send(new PutObjectCommand({
            Bucket: this.config.bucket, Key: key, Body: body, ContentType: mimeType, ContentLength: body.length,
        }));
        const url = `${this.publicUrl}/${key.split('/').map(encodeURIComponent).join('/')}`;
        return { path: url, url, size: body.length, mimeType, originalName };
    }

    async delete(reference: string): Promise<void> {
        if (!reference.startsWith(`${this.publicUrl}/`)) return; // arquivo antigo do disco ou de outro storage
        const key = reference.slice(this.publicUrl.length + 1).split('/').map(decodeURIComponent).join('/');
        await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key })).catch(() => {});
    }
}

async function toBuffer(content: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of content) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks);
}
