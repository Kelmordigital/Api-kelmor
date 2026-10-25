"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MultipartFormReader = void 0;
const http_errors_1 = require("../errors/http-errors");
/**
 * Lê um multipart/form-data gravando o arquivo no MediaStorage.
 * Se a leitura falhar no meio (tipo não permitido, arquivo grande demais,
 * limite do servidor...), o que já foi gravado é apagado antes de propagar o erro.
 */
class MultipartFormReader {
    storage;
    allowedMimeTypes;
    options;
    constructor(storage, allowedMimeTypes, options = {}) {
        this.storage = storage;
        this.allowedMimeTypes = allowedMimeTypes;
        this.options = options;
    }
    async read(req, folder) {
        const form = { fields: {} };
        try {
            for await (const part of req.parts()) {
                if (part.type === 'file') {
                    if (!this.allowedMimeTypes.has(part.mimetype)) {
                        part.file.resume();
                        throw new http_errors_1.BadRequestError(this.options.rejectedTypeMessage?.(part.mimetype) ?? `Tipo de arquivo não permitido: ${part.mimetype}`);
                    }
                    const previous = form.file;
                    form.file = await this.storage.save(folder, part.filename, part.mimetype, part.file);
                    if (previous)
                        await this.storage.delete(previous.path);
                    if (this.options.maxFileBytes !== undefined && form.file.size > this.options.maxFileBytes) {
                        throw new http_errors_1.PayloadTooLargeError(this.options.tooLargeMessage ?? 'Arquivo grande demais');
                    }
                }
                else {
                    form.fields[part.fieldname] = String(part.value);
                }
            }
        }
        catch (err) {
            if (form.file)
                await this.storage.delete(form.file.path);
            throw err;
        }
        return form;
    }
}
exports.MultipartFormReader = MultipartFormReader;
//# sourceMappingURL=multipart-form-reader.js.map