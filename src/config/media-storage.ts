import { env } from './env';
import { LocalDiskMediaStorage, type MediaStorage } from '../core/storage/media-storage';
import { R2MediaStorage } from '../core/storage/r2-media-storage';

/**
 * Onde a API guarda as mídias enviadas: no R2 quando configurado (produção,
 * várias instâncias), senão no disco local (desenvolvimento e testes).
 */
function createMediaStorage(): MediaStorage {
    const { R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL } = env;
    if (R2_ENDPOINT && R2_BUCKET && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_PUBLIC_URL) {
        return new R2MediaStorage({
            endpoint: R2_ENDPOINT, bucket: R2_BUCKET, accessKeyId: R2_ACCESS_KEY_ID,
            secretAccessKey: R2_SECRET_ACCESS_KEY, publicUrl: R2_PUBLIC_URL,
        });
    }
    if (env.NODE_ENV === 'production') {
        console.warn('[storage] R2 não configurado: mídias vão para o disco do pod e somem no próximo deploy.');
    }
    return new LocalDiskMediaStorage();
}

export const mediaStorage = createMediaStorage();
