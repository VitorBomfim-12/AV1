"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PersistenceService = exports.initialDatabaseState = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const security_1 = require("./security");
const initialDatabaseState = () => ({
    users: [],
    organizations: [],
    equipment: [],
    lots: [],
    transactions: [],
    audit: [],
});
exports.initialDatabaseState = initialDatabaseState;
class PersistenceService {
    constructor(baseDir, key) {
        this.baseDir = baseDir;
        this.key = key;
        if (!fs.existsSync(this.baseDir)) {
            fs.mkdirSync(this.baseDir, { recursive: true });
        }
    }
    getFilePath(filename) {
        return path.join(this.baseDir, filename);
    }
    read(filename, defaultValue) {
        const filePath = this.getFilePath(filename);
        if (!fs.existsSync(filePath)) {
            return defaultValue;
        }
        const encrypted = fs.readFileSync(filePath, 'utf8');
        if (!encrypted)
            return defaultValue;
        try {
            const decrypted = security_1.CryptoService.decrypt(encrypted, this.key);
            return JSON.parse(decrypted);
        }
        catch (err) {
            console.error(`Erro ao decriptar ${filename}:`, err);
            return defaultValue;
        }
    }
    write(filename, data) {
        const filePath = this.getFilePath(filename);
        const tempPath = `${filePath}.tmp`;
        const jsonStr = JSON.stringify(data, null, 2);
        const encrypted = security_1.CryptoService.encrypt(jsonStr, this.key);
        fs.writeFileSync(tempPath, encrypted, 'utf8');
        fs.renameSync(tempPath, filePath);
    }
    appendJournal(action, data) {
        this.cleanupOldLogs();
        const journalPath = this.getFilePath('journal.log');
        if (fs.existsSync(journalPath)) {
            const stats = fs.statSync(journalPath);
            if (stats.size > 10 * 1024 * 1024) { // 10MB
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                fs.renameSync(journalPath, this.getFilePath(`journal-${timestamp}.log`));
            }
        }
        const entry = JSON.stringify({
            timestamp: new Date().toISOString(),
            action,
            data
        });
        const encrypted = security_1.CryptoService.encrypt(entry, this.key);
        fs.appendFileSync(journalPath, encrypted + '\\n', 'utf8');
    }
    cleanupOldLogs() {
        const now = new Date().getTime();
        const limit = 180 * 24 * 60 * 60 * 1000;
        const files = fs.readdirSync(this.baseDir);
        files.forEach(file => {
            if (file.startsWith('journal') && file.endsWith('.log') && file !== 'journal.log') {
                const filePath = this.getFilePath(file);
                const stats = fs.statSync(filePath);
                if (now - stats.mtimeMs > limit) {
                    fs.unlinkSync(filePath);
                }
            }
        });
    }
}
exports.PersistenceService = PersistenceService;
