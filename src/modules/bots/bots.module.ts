import { mediaStorage } from '../../config/media-storage';
import { MultipartFormReader } from '../../core/http/multipart-form-reader';
import { botsRepository } from './bots.repository';
import { BotService } from './bots.service';
import { BotController } from './bots.controller';
import { BotRouter } from './bots.routes';

/** Mídias que os nós enviam pelo WhatsApp. Sem SVG/HTML: o arquivo fica público. */
export const BOT_MEDIA_MIME_TYPES: ReadonlySet<string> = new Set([
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/3gpp', 'video/quicktime',
    'audio/mpeg', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/webm',
    'application/pdf',
]);

/** Composição do módulo: único lugar que escolhe as implementações concretas. */
const mediaReader = new MultipartFormReader(mediaStorage, BOT_MEDIA_MIME_TYPES, {
    rejectedTypeMessage: () => 'Formato não suportado. Envie imagem, vídeo, áudio ou PDF.',
    maxFileBytes: 25 * 1024 * 1024,
    tooLargeMessage: 'Arquivo maior que 25MB',
});

export const botRouter = new BotRouter(new BotController(new BotService(botsRepository), mediaReader));
