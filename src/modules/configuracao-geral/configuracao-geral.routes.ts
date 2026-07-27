import { FastifyInstance } from 'fastify';
import { authMiddleware, requireAdmin } from '../../middlewares/auth.middleware';
import { configuracaoGeralController } from './configuracao-geral.controller';

export async function configuracaoGeralRoutes(app: FastifyInstance) {
    app.addHook('preHandler', authMiddleware);

    // Leitura — qualquer usuário autenticado da empresa (atendente comum
    // inclusive). É assim que `useCompanyPermissions()` funciona pro app
    // inteiro: um atendente comum precisa conseguir checar se um toggle (ex.:
    // "Permitir pré-visualização do ticket") está ligado pra saber se pode usar
    // aquela função — se essa rota fosse admin-only, o fetch daria 403 e o
    // toggle pareceria sempre desligado pra ele, não importa o valor real.
    app.get('/', configuracaoGeralController.get);

    // Escrita — só admin/superAdmin pode mudar a configuração da empresa.
    app.put('/', { preHandler: requireAdmin }, configuracaoGeralController.update);
}
