import { db } from '../../database/client';
import { DrizzleCupomRepository } from './cupom.repository';
import { CupomTypePolicies } from './cupom-type.policies';
import { CupomService } from './cupom.service';
import { CupomController } from './cupom.controller';
import { CupomRouter } from './cupom.routes';

/** Composição do módulo: único lugar que escolhe as implementações concretas. */
const cupomService = new CupomService(new DrizzleCupomRepository(db), CupomTypePolicies.default());

export const cupomRouter = new CupomRouter(new CupomController(cupomService));
