"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JwtTokenService = void 0;
const jwt_1 = require("../../config/jwt");
class JwtTokenService {
    access(payload) { return (0, jwt_1.signAccessToken)(payload); }
    refresh(userId) { return (0, jwt_1.signRefreshToken)(userId); }
    verifyRefresh(token) { return (0, jwt_1.verifyRefreshToken)(token); }
    totpTicket(userId) { return (0, jwt_1.signTotpTicket)(userId); }
    verifyTotpTicket(ticket) { return (0, jwt_1.verifyTotpTicket)(ticket); }
}
exports.JwtTokenService = JwtTokenService;
//# sourceMappingURL=auth.tokens.js.map