-- Remove os textos de agendamento padrão de farmácia que a API criava para
-- toda empresa. Só apaga os que continuam exatamente como foram criados
-- (título e mensagem originais); textos editados pela empresa ficam.
DELETE FROM "at_scheduled_message_texts"
WHERE ("type", "label", coalesce("text", '')) IN (
    (1, 'Recorrência',           'Olá! Passando para avisar que o seu medicamento contínuo pode estar acabando. Podemos separar para você?'),
    (2, 'Pós-venda/Antibiótico', 'Olá! Como está se sentindo? Passando para acompanhar o seu tratamento com o antibiótico.'),
    (3, 'Suplementação',         'Olá! O seu suplemento pode estar no fim. Posso verificar a disponibilidade para você?'),
    (4, 'Personalizar',          '')
);
