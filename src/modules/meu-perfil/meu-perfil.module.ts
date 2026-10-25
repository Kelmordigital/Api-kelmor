import { db } from '../../database/client';
import { LocalDiskMediaStorage } from '../../core/storage/media-storage';
import { MultipartFormReader } from '../../core/http/multipart-form-reader';
import { DrizzleMeuPerfilRepository } from './meu-perfil.repository';
import { MeuPerfilService } from './meu-perfil.service';
import { MeuPerfilController } from './meu-perfil.controller';
import { MeuPerfilRouter } from './meu-perfil.routes';
import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES } from './meu-perfil.dto';

/** Composição do módulo: único lugar que escolhe as implementações concretas. */
const storage = new LocalDiskMediaStorage();

export const meuPerfilService = new MeuPerfilService(new DrizzleMeuPerfilRepository(db), storage);

const avatarReader = new MultipartFormReader(storage, AVATAR_MIME_TYPES, {
    rejectedTypeMessage: () => 'Formato inválido. Use JPG, PNG ou WEBP.',
    maxFileBytes: AVATAR_MAX_BYTES,
    tooLargeMessage: 'Arquivo maior que 5MB',
});

export const meuPerfilRouter = new MeuPerfilRouter(new MeuPerfilController(meuPerfilService, avatarReader));
