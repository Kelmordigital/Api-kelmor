-- Mídias recebidas pela WuzAPI foram gravadas com o nome do bucket no meio do endereço
-- (<domínio público do R2>/<bucket>/users/<conexão>/inbox/...), que o R2 responde 404:
-- áudio, imagem, vídeo, documento e figurinha não abriam no CRM. O arquivo está no R2;
-- só o endereço muda para <domínio público do R2>/users/<conexão>/inbox/...
-- Só casa o formato exato da WuzAPI (endereços da bays e da API têm outro formato).
-- Idempotente: um endereço já corrigido não casa mais com o padrão.
UPDATE "at_messages"
SET "media_url" = regexp_replace("media_url", '^(https://[^/]+)/[^/]+/(users/[^/]+/(inbox|outbox)/)', '\1/\2')
WHERE "media_url" ~ '^https://[^/]+/[^/]+/users/[^/]+/(inbox|outbox)/';
