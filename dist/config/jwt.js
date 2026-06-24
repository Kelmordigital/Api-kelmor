"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signAccessToken = signAccessToken;
exports.signRefreshToken = signRefreshToken;
exports.verifyAccessToken = verifyAccessToken;
exports.verifyRefreshToken = verifyRefreshToken;
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
        return jsonwebtoken_1.default.verify(token, env_1.env.JWT_SECRET);
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
//# sourceMappingURL=jwt.js.map