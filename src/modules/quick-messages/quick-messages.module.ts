import { db } from '../../database/client';
import { mediaStorage } from '../../config/media-storage';
import { MultipartFormReader } from '../../core/http/multipart-form-reader';
import { DrizzleQuickMessageRepository } from './quick-messages.repository';
import { QuickMessageService } from './quick-messages.service';
import { QuickMessageController } from './quick-messages.controller';
import { QuickMessageRouter } from './quick-messages.routes';
import { QUICK_MESSAGE_MIME_TYPES } from './quick-messages.dto';

/** Composição do módulo: único lugar que escolhe as implementações concretas. */
const storage = mediaStorage;
const service = new QuickMessageService(new DrizzleQuickMessageRepository(db), storage);

export const quickMessageRouter = new QuickMessageRouter(
    new QuickMessageController(service, new MultipartFormReader(storage, QUICK_MESSAGE_MIME_TYPES)),
);
