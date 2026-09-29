import * as crypto from 'crypto';

export class CryptoService {
  private static readonly ALGORITHM = 'aes-256-cbc';

  static hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  static generateMasterKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  static encrypt(text: string, keyHex: string): string {
    const key = Buffer.from(keyHex, 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  }

  static decrypt(encryptedData: string, keyHex: string): string {
    const key = Buffer.from(keyHex, 'hex');
    const parts = encryptedData.split(':');
    const iv = Buffer.from(parts.shift()!, 'hex');
    const encryptedText = parts.join(':');
    const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}

export const can = (
  role: string,
  action: "user" | "org" | "equipment" | "lot" | "audit"
): boolean =>
  ({
    user: role === "ADMINISTRADOR",
    org: role === "ADMINISTRADOR" || role === "OPERADOR_CADASTRO",
    equipment: role === "ADMINISTRADOR" || role === "ALMOXARIFE",
    lot: role === "ADMINISTRADOR" || role === "ALMOXARIFE",
    audit: true,
  })[action];
