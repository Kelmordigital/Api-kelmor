"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userIdParamsSchema = exports.loginTotpSchema = exports.totpCodeSchema = exports.registerSchema = exports.loginSchema = void 0;
const zod_1 = require("zod");
/** E-mails valem sem diferenciar maiúsculas e sem espaços nas pontas. */
const email = zod_1.z.string().trim().toLowerCase().pipe(zod_1.z.email());
exports.loginSchema = zod_1.z.object({
    email,
    password: zod_1.z.string().min(1),
});
exports.registerSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(2),
    email,
    password: zod_1.z.string().min(8),
    profile_id: zod_1.z.number().int().min(1).max(3),
    company_id: zod_1.z.string().uuid().nullable().optional(),
});
exports.totpCodeSchema = zod_1.z.object({
    code: zod_1.z.string().min(6).max(9),
});
exports.loginTotpSchema = zod_1.z.object({
    ticket: zod_1.z.string().min(10),
    code: zod_1.z.string().min(6).max(9),
});
exports.userIdParamsSchema = zod_1.z.object({ id: zod_1.z.guid('id inválido') });
//# sourceMappingURL=auth.dto.js.map