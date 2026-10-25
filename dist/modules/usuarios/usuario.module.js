"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usuarioRouter = void 0;
const client_1 = require("../../database/client");
const redis_1 = require("../../config/redis");
const password_hasher_1 = require("../../core/auth/password-hasher");
const session_1 = require("../../core/auth/session");
const achievements_module_1 = require("../achievements/achievements.module");
const usuario_repository_1 = require("./usuario.repository");
const usuario_service_1 = require("./usuario.service");
const usuario_controller_1 = require("./usuario.controller");
const usuario_routes_1 = require("./usuario.routes");
/** Composição do módulo: único lugar que escolhe as implementações concretas. */
const service = new usuario_service_1.UsuarioService(new usuario_repository_1.DrizzleUserRepository(client_1.db), new password_hasher_1.BcryptPasswordHasher(), new session_1.RedisSessionRevoker(redis_1.getRedisClient), achievements_module_1.achievementProgressReader);
exports.usuarioRouter = new usuario_routes_1.UsuarioRouter(new usuario_controller_1.UsuarioController(service));
//# sourceMappingURL=usuario.module.js.map