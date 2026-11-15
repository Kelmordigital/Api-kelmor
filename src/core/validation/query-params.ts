import { z } from 'zod';

const blankToUndefined = (v: unknown) => (v === '' || v === null || v === undefined ? undefined : v);

/** Query/params numéricos: ausente ou '' → undefined; senão inteiro; inválido → 400 "<campo> inválido". */
export function optionalInt(field: string) {
    return z.preprocess(blankToUndefined, z.coerce.number({ error: `${field} inválido` }).int(`${field} inválido`).optional());
}

/** Query de texto: ausente ou '' → undefined. */
export const optionalText = z.preprocess(blankToUndefined, z.string().optional());

/** Parâmetro de rota numérico obrigatório. */
export function requiredId(field = 'id') {
    return z.coerce.number({ error: `${field} inválido` }).int(`${field} inválido`).positive(`${field} inválido`);
}
