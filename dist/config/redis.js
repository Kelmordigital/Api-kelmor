"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRedisClient = getRedisClient;
const ioredis_1 = __importDefault(require("ioredis"));
const env_1 = require("./env");
let _client = null;
function getRedisClient() {
    if (!env_1.env.REDIS_URL)
        return null;
    if (!_client) {
        _client = new ioredis_1.default(env_1.env.REDIS_URL, { maxRetriesPerRequest: 3 });
        _client.on('error', (err) => {
            console.error('[Redis] Erro de conexão:', err.message);
        });
    }
    return _client;
}
//# sourceMappingURL=redis.js.map