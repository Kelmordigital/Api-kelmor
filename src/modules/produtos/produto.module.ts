import { db } from '../../database/client';
import { DrizzleProdutoRepository } from './produto.repository';
import { ProdutoService, type ProdutoCatalog } from './produto.service';
import { ProdutoController } from './produto.controller';
import { ProdutoRouter } from './produto.routes';

/** Composição do módulo: único lugar que escolhe as implementações concretas. */
const produtoService = new ProdutoService(new DrizzleProdutoRepository(db));

export const produtoRouter = new ProdutoRouter(new ProdutoController(produtoService));

/** Porta de leitura exposta a outros módulos. */
export const produtoCatalog: ProdutoCatalog = produtoService;
