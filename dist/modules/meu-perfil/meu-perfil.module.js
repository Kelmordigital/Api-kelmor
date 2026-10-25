"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.meuPerfilRouter = exports.meuPerfilService = void 0;
const client_1 = require("../../database/client");
const media_storage_1 = require("../../core/storage/media-storage");
const multipart_form_reader_1 = require("../../core/http/multipart-form-reader");
const meu_perfil_repository_1 = require("./meu-perfil.repository");
const meu_perfil_service_1 = require("./meu-perfil.service");
const meu_perfil_controller_1 = require("./meu-perfil.controller");
const meu_perfil_routes_1 = require("./meu-perfil.routes");
const meu_perfil_dto_1 = require("./meu-perfil.dto");
/** Composição do módulo: único lugar que escolhe as implementações concretas. */
const storage = new media_storage_1.LocalDiskMediaStorage();
exports.meuPerfilService = new meu_perfil_service_1.MeuPerfilService(new meu_perfil_repository_1.DrizzleMeuPerfilRepository(client_1.db), storage);
const avatarReader = new multipart_form_reader_1.MultipartFormReader(storage, meu_perfil_dto_1.AVATAR_MIME_TYPES, {
    rejectedTypeMessage: () => 'Formato inválido. Use JPG, PNG ou WEBP.',
    maxFileBytes: meu_perfil_dto_1.AVATAR_MAX_BYTES,
    tooLargeMessage: 'Arquivo maior que 5MB',
});
exports.meuPerfilRouter = new meu_perfil_routes_1.MeuPerfilRouter(new meu_perfil_controller_1.MeuPerfilController(exports.meuPerfilService, avatarReader));
//# sourceMappingURL=meu-perfil.module.js.map