-- Migration: adiciona funil_stage na tabela at_tickets para o Funil Kanban de atendimento
ALTER TABLE "at_tickets" ADD COLUMN IF NOT EXISTS "funil_stage" varchar(50) NOT NULL DEFAULT 'novos_leads';
