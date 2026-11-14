-- Tickets finalizados pelo fechamento automático (histórico sem usuário e sem "fechado por")
-- ficaram sem marcação de venda (is_sale nulo) e não apareciam em nenhum relatório.
-- Passam a ser "venda não realizada", como o fechamento automático faz a partir de agora.
UPDATE "at_tickets" t
SET "is_sale" = 0
WHERE t."status_id" = 3
  AND t."is_sale" IS NULL
  AND t."closed_by_user_id" IS NULL
  AND EXISTS (
      SELECT 1 FROM "at_historic_tickets" h
      WHERE h."ticket_id" = t."id"
        AND h."user_id" IS NULL
        AND h."status_id_end" = 3
        AND h."created_at" >= '2026-11-14'
  );
