import * as fs from 'fs';
import * as path from 'path';
import { CryptoService } from './security';
import { User, Organization, Equipment, Lot, Transaction, AuditEvent } from './model';

export interface DatabaseState {
  users: User[];
  organizations: Organization[];
  equipment: Equipment[];
  lots: Lot[];
  transactions: Transaction[];
  audit: AuditEvent[];
}

export const initialDatabaseState = (): DatabaseState => ({
  users: [],
  organizations: [],
  equipment: [],
  lots: [],
  transactions: [],
  audit: [],
});

export class PersistenceService {
  private baseDir: string;
  private key: string;

  constructor(baseDir: string, key: string) {
    this.baseDir = baseDir;
    this.key = key;
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private getFilePath(filename: string): string {
    return path.join(this.baseDir, filename);
  }

  read<T>(filename: string, defaultValue: T): T {
    const filePath = this.getFilePath(filename);
    if (!fs.existsSync(filePath)) {
      return defaultValue;
    }
    const encrypted = fs.readFileSync(filePath, 'utf8');
    if (!encrypted) return defaultValue;
    try {
      const decrypted = CryptoService.decrypt(encrypted, this.key);
      return JSON.parse(decrypted) as T;
    } catch (err) {
      console.error(`Erro ao decriptar ${filename}:`, err);
      return defaultValue;
    }
  }

  write<T>(filename: string, data: T): void {
    const filePath = this.getFilePath(filename);
    const tempPath = `${filePath}.tmp`;
    const jsonStr = JSON.stringify(data, null, 2);
    const encrypted = CryptoService.encrypt(jsonStr, this.key);
    
    fs.writeFileSync(tempPath, encrypted, 'utf8');
    fs.renameSync(tempPath, filePath);
  }

  appendJournal(action: string, data: any): void {
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
    const encrypted = CryptoService.encrypt(entry, this.key);
    fs.appendFileSync(journalPath, encrypted + '\\n', 'utf8');
  }

  private cleanupOldLogs(): void {
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
