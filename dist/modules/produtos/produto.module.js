"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.produtoCatalog = exports.produtoRouter = void 0;
const client_1 = require("../../database/client");
const produto_repository_1 = require("./produto.repository");
const produto_service_1 = require("./produto.service");
const produto_controller_1 = require("./produto.controller");
const produto_routes_1 = require("./produto.routes");
/** Composição do módulo: único lugar que escolhe as implementações concretas. */
const produtoService = new produto_service_1.ProdutoService(new produto_repository_1.DrizzleProdutoRepository(client_1.db));
exports.produtoRouter = new produto_routes_1.ProdutoRouter(new produto_controller_1.ProdutoController(produtoService));
/** Porta de leitura exposta a outros módulos. */
exports.produtoCatalog = produtoService;
//# sourceMappingURL=produto.module.js.map