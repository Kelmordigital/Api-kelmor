CREATE TABLE IF NOT EXISTS at_crm_keywords (
  id bigserial PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  keyword varchar(255) NOT NULL,
  origin varchar(255) NOT NULL,
  created_at timestamp DEFAULT now()
);
