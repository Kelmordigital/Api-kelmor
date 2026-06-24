import 'dotenv/config';
import postgres from 'postgres';

async function main() {
    const client = postgres(process.env.DATABASE_URL!);

    await client.unsafe(`
        CREATE TABLE IF NOT EXISTS at_statuses (
            id        BIGSERIAL PRIMARY KEY,
            name      VARCHAR(255) NOT NULL,
            tag       VARCHAR(50)  NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS at_connections (
            id            BIGSERIAL PRIMARY KEY,
            company_id    UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            name          VARCHAR(255) NOT NULL,
            serialized_id VARCHAR(255),
            type          VARCHAR(50)  DEFAULT 'whatsapp',
            status        VARCHAR(50)  DEFAULT 'disconnected',
            created_at    TIMESTAMP    DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS at_queues (
            id               BIGSERIAL PRIMARY KEY,
            company_id       UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            name             VARCHAR(255) NOT NULL,
            color            VARCHAR(50),
            enabled          BOOLEAN      DEFAULT TRUE,
            greeting_message TEXT
        );

        CREATE TABLE IF NOT EXISTS at_contacts (
            id              BIGSERIAL PRIMARY KEY,
            company_id      UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            name            VARCHAR(255) NOT NULL,
            number          VARCHAR(50),
            email           VARCHAR(255),
            origin          VARCHAR(255),
            lid             VARCHAR(255),
            profile_pic_url TEXT,
            created_at      TIMESTAMP    DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS at_crm_sales_reasons (
            id         BIGSERIAL PRIMARY KEY,
            company_id UUID  NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            reason     TEXT  NOT NULL,
            color      VARCHAR(50)
        );

        CREATE TABLE IF NOT EXISTS at_tickets (
            id                  BIGSERIAL PRIMARY KEY,
            company_id          UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            connection_id       BIGINT,
            contact_id          BIGINT       NOT NULL,
            queue_id            BIGINT,
            status_id           BIGINT       NOT NULL DEFAULT 1,
            attendant_user_id   UUID         REFERENCES users(id) ON DELETE SET NULL,
            closed_by_user_id   UUID         REFERENCES users(id) ON DELETE SET NULL,
            serialized_id       VARCHAR(255),
            origin              VARCHAR(255),
            type                VARCHAR(50)  DEFAULT 'whatsapp',
            ocurrence           VARCHAR(500),
            is_sale             INTEGER,
            sale_price          VARCHAR(100) DEFAULT '0,00',
            reasons_id          BIGINT,
            loss_product_name   VARCHAR(255),
            service_not_made    INTEGER      DEFAULT 0,
            created_at          TIMESTAMP    DEFAULT NOW(),
            updated_at          TIMESTAMP    DEFAULT NOW(),
            deleted_at          TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS at_messages (
            id         BIGSERIAL PRIMARY KEY,
            ticket_id  BIGINT    NOT NULL,
            contact_id BIGINT,
            user_id    UUID      REFERENCES users(id) ON DELETE SET NULL,
            body       TEXT,
            from_me    BOOLEAN   DEFAULT FALSE,
            media_type VARCHAR(100),
            media_url  TEXT,
            ack        INTEGER   DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS at_historic_tickets (
            id             BIGSERIAL PRIMARY KEY,
            ticket_id      BIGINT    NOT NULL,
            user_id        UUID,
            status_id_init BIGINT,
            status_id_end  BIGINT,
            created_at     TIMESTAMP DEFAULT NOW()
        );
    `);

    console.log('✅ Tabelas at_* criadas com sucesso (IF NOT EXISTS — seguro rodar múltiplas vezes)');
    await client.end();
}

main().catch(err => { console.error('❌ Erro:', err.message); process.exit(1); });
