"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signAccessToken = signAccessToken;
exports.signRefreshToken = signRefreshToken;
exports.verifyAccessToken = verifyAccessToken;
exports.verifyRefreshToken = verifyRefreshToken;
exports.signTotpTicket = signTotpTicket;
exports.verifyTotpTicket = verifyTotpTicket;
exports.signOAuthStateTicket = signOAuthStateTicket;
exports.verifyOAuthStateTicket = verifyOAuthStateTicket;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = require("crypto");
const env_1 = require("./env");
function signAccessToken(payload) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return jsonwebtoken_1.default.sign(payload, env_1.env.JWT_SECRET, { expiresIn: env_1.env.JWT_EXPIRES_IN });
}
function signRefreshToken(userId) {
    // jti garante unicidade mesmo em logins consecutivos no mesmo segundo
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return jsonwebtoken_1.default.sign({ sub: userId, jti: (0, crypto_1.randomUUID)() }, env_1.env.REFRESH_SECRET, { expiresIn: env_1.env.REFRESH_EXPIRES_IN });
}
function verifyAccessToken(token) {
    try {
        const payload = jsonwebtoken_1.default.verify(token, env_1.env.JWT_SECRET);
        // Tokens de propósito específico (ex.: ticket do 2FA) NUNCA valem como access token
        if (payload.purpose)
            return null;
        return payload;
    }
    catch {
        return null;
    }
}
function verifyRefreshToken(token) {
    try {
        return jsonwebtoken_1.default.verify(token, env_1.env.REFRESH_SECRET);
    }
    catch {
        return null;
    }
}
function signTotpTicket(userId) {
    return jsonwebtoken_1.default.sign({ sub: userId, purpose: 'totp', jti: (0, crypto_1.randomUUID)() }, env_1.env.JWT_SECRET, { expiresIn: '5m' });
}
function verifyTotpTicket(token) {
    try {
        const p = jsonwebtoken_1.default.verify(token, env_1.env.JWT_SECRET);
        if (p.purpose !== 'totp' || !p.jti)
            return null;
        return { sub: p.sub, jti: p.jti };
    }
    catch {
        return null;
    }
}
// Assina o parâmetro `state` do OAuth do Google Calendar como um ticket
// verificável, em vez de expor o company_id cru — sem isso, qualquer pessoa
// pode montar a URL de autorização do Google com state=<company_id alheio>
// e sequestrar a integração de outra empresa (CSRF no callback).
function signOAuthStateTicket(companyId) {
    return jsonwebtoken_1.default.sign({ sub: companyId, purpose: 'google_oauth_state', jti: (0, crypto_1.randomUUID)() }, env_1.env.JWT_SECRET, { expiresIn: '10m' });
}
function verifyOAuthStateTicket(token) {
    try {
        const p = jsonwebtoken_1.default.verify(token, env_1.env.JWT_SECRET);
        if (p.purpose !== 'google_oauth_state')
            return null;
        return { companyId: p.sub };
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=jwt.js.map