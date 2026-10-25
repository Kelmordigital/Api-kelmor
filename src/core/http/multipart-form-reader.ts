import type { FastifyRequest } from 'fastify';
import { BadRequestError, PayloadTooLargeError } from '../errors/http-errors';
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
export class MultipartFormReader {
    constructor(
        private readonly storage: MediaStorage,
        private readonly allowedMimeTypes: ReadonlySet<string>,
        private readonly options: MultipartFormOptions = {},
    ) {}

    async read(req: FastifyRequest, folder: string): Promise<MultipartForm> {
        const form: MultipartForm = { fields: {} };
        try {
            for await (const part of req.parts()) {
                if (part.type === 'file') {
                    if (!this.allowedMimeTypes.has(part.mimetype)) {
                        part.file.resume();
                        throw new BadRequestError(this.options.rejectedTypeMessage?.(part.mimetype) ?? `Tipo de arquivo não permitido: ${part.mimetype}`);
                    }
                    const previous = form.file;
                    form.file = await this.storage.save(folder, part.filename, part.mimetype, part.file);
                    if (previous) await this.storage.delete(previous.path);
                    if (this.options.maxFileBytes !== undefined && form.file.size > this.options.maxFileBytes) {
                        throw new PayloadTooLargeError(this.options.tooLargeMessage ?? 'Arquivo grande demais');
                    }
                } else {
                    form.fields[part.fieldname] = String(part.value);
                }
            }
        } catch (err) {
            if (form.file) await this.storage.delete(form.file.path);
            throw err;
        }
        return form;
    }
}
