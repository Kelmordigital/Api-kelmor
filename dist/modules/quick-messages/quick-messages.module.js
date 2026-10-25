"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quickMessageRouter = void 0;
const client_1 = require("../../database/client");
const media_storage_1 = require("../../core/storage/media-storage");
const multipart_form_reader_1 = require("../../core/http/multipart-form-reader");
const quick_messages_repository_1 = require("./quick-messages.repository");
const quick_messages_service_1 = require("./quick-messages.service");
const quick_messages_controller_1 = require("./quick-messages.controller");
const quick_messages_routes_1 = require("./quick-messages.routes");
const quick_messages_dto_1 = require("./quick-messages.dto");
/** Composição do módulo: único lugar que escolhe as implementações concretas. */
const storage = new media_storage_1.LocalDiskMediaStorage();
const service = new quick_messages_service_1.QuickMessageService(new quick_messages_repository_1.DrizzleQuickMessageRepository(client_1.db), storage);
exports.quickMessageRouter = new quick_messages_routes_1.QuickMessageRouter(new quick_messages_controller_1.QuickMessageController(service, new multipart_form_reader_1.MultipartFormReader(storage, quick_messages_dto_1.QUICK_MESSAGE_MIME_TYPES)));
//# sourceMappingURL=quick-messages.module.js.map