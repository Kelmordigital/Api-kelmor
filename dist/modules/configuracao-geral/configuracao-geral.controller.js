"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configuracaoGeralController = void 0;
const configuracao_geral_service_1 = require("./configuracao-geral.service");
exports.configuracaoGeralController = {
    async get(req, reply) {
        const data = await configuracao_geral_service_1.configuracaoGeralService.get(req.user.company_id);
        return reply.send(data);
    },
    async update(req, reply) {
        const body = req.body;
        const data = await configuracao_geral_service_1.configuracaoGeralService.update(req.user.company_id, body);
        return reply.send(data);
    },
};
//# sourceMappingURL=configuracao-geral.controller.js.map