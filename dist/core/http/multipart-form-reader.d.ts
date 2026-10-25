import type { FastifyRequest } from 'fastify';
import type { MediaStorage, StoredFile } from '../storage/media-storage';
export interface MultipartForm {
    fields: Record<string, string>;
    /** Se vierem vários arquivos, vale o último (os anteriores são apagados). */
    file?: StoredFile;
}
export interface MultipartFormOptions {
    /** Mensagem do 400 para tipo não aceito. Padrão: "Tipo de arquivo não permitido: <tipo>". */
    rejectedTypeMessage?: (mimeType: string) => string;
    /** Tamanho máximo do arquivo; acima disso, 413 com `tooLargeMessage`. */
    maxFileBytes?: number;
    tooLargeMessage?: string;
}
/**
 * Lê um multipart/form-data gravando o arquivo no MediaStorage.
 * Se a leitura falhar no meio (tipo não permitido, arquivo grande demais,
 * limite do servidor...), o que já foi gravado é apagado antes de propagar o erro.
 */
export declare class MultipartFormReader {
    private readonly storage;
    private readonly allowedMimeTypes;
    private readonly options;
    constructor(storage: MediaStorage, allowedMimeTypes: ReadonlySet<string>, options?: MultipartFormOptions);
    read(req: FastifyRequest, folder: string): Promise<MultipartForm>;
}
//# sourceMappingURL=multipart-form-reader.d.ts.map