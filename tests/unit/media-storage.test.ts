import { describe, it, expect, vi } from 'vitest';
import { Readable } from 'stream';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { R2MediaStorage } from '../../src/core/storage/r2-media-storage';
import { LocalDiskMediaStorage } from '../../src/core/storage/media-storage';

const config = {
    endpoint: 'https://conta.r2.cloudflarestorage.com', bucket: 'midias', accessKeyId: 'k', secretAccessKey: 's',
    publicUrl: 'https://pub-123.r2.dev/',
};

describe('R2MediaStorage', () => {
    it('grava em api/<pasta>/ com tamanho e tipo, e devolve o endereço público', async () => {
        const client = { send: vi.fn(async () => ({})) };
        const stored = await new R2MediaStorage(config, client).save('bots/c1', 'Foto Loja.PNG', 'image/png', Readable.from([Buffer.from('abc'), Buffer.from('de')]));

        const command = client.send.mock.calls[0][0] as PutObjectCommand;
        expect(command).toBeInstanceOf(PutObjectCommand);
        expect(command.input).toMatchObject({ Bucket: 'midias', ContentType: 'image/png', ContentLength: 5 });
        expect(command.input.Key).toMatch(/^api\/bots\/c1\/\d+-[0-9a-f-]+\.png$/);
        expect(stored).toMatchObject({ size: 5, mimeType: 'image/png', originalName: 'Foto Loja.PNG' });
        expect(stored.url).toBe(`https://pub-123.r2.dev/${command.input.Key}`);
        expect(stored.path).toBe(stored.url);
    });

    it('apaga pelo endereço; ignora arquivos antigos do disco e de outros lugares', async () => {
        const client = { send: vi.fn(async () => ({})) };
        const storage = new R2MediaStorage(config, client);
        await storage.delete('https://pub-123.r2.dev/api/bots/c1/1-a.png');
        expect((client.send.mock.calls[0][0] as DeleteObjectCommand).input).toEqual({ Bucket: 'midias', Key: 'api/bots/c1/1-a.png' });

        await storage.delete('uploads/quick-messages/c1/x.png');
        await storage.delete('/uploads/avatars/u1/y.png');
        await storage.delete('https://outro-lugar.com/z.png');
        expect(client.send).toHaveBeenCalledTimes(1);
    });

    it('falha no envio propaga o erro (quem chamou decide o que fazer)', async () => {
        const client = { send: vi.fn(async () => { throw new Error('R2 fora'); }) };
        await expect(new R2MediaStorage(config, client).save('x', 'a.png', 'image/png', Readable.from([Buffer.from('a')]))).rejects.toThrow('R2 fora');
    });
});

describe('LocalDiskMediaStorage', () => {
    it('devolve a URL servida em /uploads e apaga tanto pelo path quanto pela URL', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kelmor-storage-'));
        const storage = new LocalDiskMediaStorage(root);

        const a = await storage.save('qm', 'a.txt', 'text/plain', Readable.from([Buffer.from('oi')]));
        expect(a.url).toBe(`/${a.path}`);
        expect(a.path).toMatch(/^uploads\/qm\//);

        const b = await storage.save('qm', 'b.txt', 'text/plain', Readable.from([Buffer.from('oi')]));
        await storage.delete(a.path);
        await storage.delete(b.url);
        await storage.delete('https://pub-123.r2.dev/api/x.png'); // de outro storage: ignorado
        await expect(fs.readdir(path.join(root, 'uploads', 'qm'))).resolves.toEqual([]);
        await fs.rm(root, { recursive: true, force: true });
    });
});
