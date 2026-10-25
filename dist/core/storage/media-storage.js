"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalDiskMediaStorage = void 0;
const promises_1 = require("stream/promises");
const fs_1 = require("fs");
const promises_2 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
/** Grava em <root>/uploads/<folder>/, que o server expõe em /uploads. */
class LocalDiskMediaStorage {
    root;
    constructor(root = process.cwd()) {
        this.root = root;
    }
    async save(folder, originalName, mimeType, content) {
        const fileName = `${Date.now()}-${crypto_1.default.randomUUID()}${path_1.default.extname(originalName).toLowerCase()}`;
        const relativePath = path_1.default.posix.join('uploads', folder, fileName);
        const fullPath = path_1.default.join(this.root, relativePath);
        await promises_2.default.mkdir(path_1.default.dirname(fullPath), { recursive: true });
        let size = 0;
        content.on('data', (chunk) => { size += chunk.length; });
        try {
            await (0, promises_1.pipeline)(content, (0, fs_1.createWriteStream)(fullPath));
        }
        catch (err) {
            await this.delete(relativePath);
            throw err;
        }
        return { path: relativePath, size, mimeType, originalName };
    }
    async delete(filePath) {
        await promises_2.default.unlink(path_1.default.join(this.root, filePath)).catch(() => { });
    }
}
exports.LocalDiskMediaStorage = LocalDiskMediaStorage;
//# sourceMappingURL=media-storage.js.map