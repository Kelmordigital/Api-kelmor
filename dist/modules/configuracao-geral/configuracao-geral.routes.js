"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configuracaoGeralRoutes = configuracaoGeralRoutes;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const configuracao_geral_controller_1 = require("./configuracao-geral.controller");
async function configuracaoGeralRoutes(app) {
    app.addHook('preHandler', auth_middleware_1.authMiddleware);
    // Leitura — qualquer usuário autenticado da empresa (atendente comum
    // inclusive). É assim que `useCompanyPermissions()` funciona pro app
    // inteiro: um atendente comum precisa conseguir checar se um toggle (ex.:
    // "Permitir pré-visualização do ticket") está ligado pra saber se pode usar
    // aquela função — se essa rota fosse admin-only, o fetch daria 403 e o
    // toggle pareceria sempre desligado pra ele, não importa o valor real.
    app.get('/', configuracao_geral_controller_1.configuracaoGeralController.get);
    // Escrita — só admin/superAdmin pode mudar a configuração da empresa.
    app.put('/', { preHandler: auth_middleware_1.requireAdmin }, configuracao_geral_controller_1.configuracaoGeralController.update);
}
//# sourceMappingURL=configuracao-geral.routes.js.map