"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JwtOAuthStateSigner = void 0;
const jwt_1 = require("../../config/jwt");
class JwtOAuthStateSigner {
    sign(companyId) {
        return (0, jwt_1.signOAuthStateTicket)(companyId);
    }
    verify(state) {
        return (0, jwt_1.verifyOAuthStateTicket)(state)?.companyId ?? null;
    }
}
exports.JwtOAuthStateSigner = JwtOAuthStateSigner;
//# sourceMappingURL=oauth-state.js.map