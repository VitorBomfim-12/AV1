import * as crypto from 'crypto';
import { AppError } from './errors';

export enum Role {
  ADMINISTRADOR = 'ADMINISTRADOR',
  OPERADOR_CADASTRO = 'OPERADOR_CADASTRO',
  ALMOXARIFE = 'ALMOXARIFE',
  AUDITOR = 'AUDITOR'
}

export enum EquipmentStatus {
  RECEBIDO = 'RECEBIDO',
  EM_TRIAGEM = 'EM_TRIAGEM',
  AGUARDANDO_COMPONENTES = 'AGUARDANDO_COMPONENTES',
  EM_REPARO = 'EM_REPARO',
  RECONDICIONADO = 'RECONDICIONADO',
  DESCARTADO = 'DESCARTADO',
  DOADO = 'DOADO',
  VENDIDO = 'VENDIDO'
}

export enum TransactionType {
  RECEBIMENTO = 'RECEBIMENTO',
  TRIAGEM = 'TRIAGEM',
  TRANSFERENCIA = 'TRANSFERENCIA',
  REPARO = 'REPARO',
  RECONDICIONAMENTO = 'RECONDICIONAMENTO',
  DESCARTE = 'DESCARTE',
  DOACAO = 'DOACAO',
  VENDA = 'VENDA',
  AJUSTE_ESTOQUE = 'AJUSTE_ESTOQUE'
}

export abstract class Validator<T> {
  abstract validate(data: T): void;
}

export class CNPJValidator extends Validator<string> {
  validate(cnpj: string): void {
    const cleaned = cnpj.replace(/\D/g, '');
    if (cleaned.length !== 14) {
      throw new AppError("CNPJ inválido: deve conter 14 dígitos.");
    }
    if (/^(\d)\1+$/.test(cleaned)) {
      throw new AppError("CNPJ inválido: números repetidos.");
    }

    let length = cleaned.length - 2;
    let numbers = cleaned.substring(0, length);
    const digits = cleaned.substring(length);
    let sum = 0;
    let pos = length - 7;

    for (let i = length; i >= 1; i--) {
      sum += parseInt(numbers.charAt(length - i)) * pos--;
      if (pos < 2) pos = 9;
    }

    let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (result !== parseInt(digits.charAt(0))) {
      throw new AppError("CNPJ inválido: falha no 1º dígito verificador.");
    }

    length = length + 1;
    numbers = cleaned.substring(0, length);
    sum = 0;
    pos = length - 7;

    for (let i = length; i >= 1; i--) {
      sum += parseInt(numbers.charAt(length - i)) * pos--;
      if (pos < 2) pos = 9;
    }

    result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (result !== parseInt(digits.charAt(1))) {
      throw new AppError("CNPJ inválido: falha no 2º dígito verificador.");
    }
  }
}

export class DateValidator extends Validator<Date> {
  validate(date: Date): void {
    const now = new Date();
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(now.getDate() - 90);

    if (date > now) {
      throw new AppError("Data inválida: data não pode ser futura.");
    }
    if (date < ninetyDaysAgo) {
      throw new AppError("Data inválida: data não pode ser anterior a 90 dias.");
    }
  }
}

export abstract class Entity {
  constructor(
    public readonly id: string,
    public createdAt: string = new Date().toISOString()
  ) {}
}

export class User extends Entity {
  constructor(
    id: string,
    public name: string,
    public username: string,
    public passwordHash: string,
    public role: Role,
    public active: boolean = true,
    createdAt?: string
  ) {
    super(id, createdAt);
  }
}

export class Organization extends Entity {
  constructor(
    id: string,
    public name: string,
    public cnpj: string,
    public type: string,
    public phone: string,
    public email: string,
    public address: string,
    public active: boolean = true,
    createdAt?: string
  ) {
    super(id, createdAt);
  }
}

export class Equipment extends Entity {
  constructor(
    id: string,
    public organizationId: string,
    public serial: string,
    public category: string,
    public brand: string,
    public model: string,
    public condition: string,
    public status: EquipmentStatus,
    public location: string,
    public receivedAt: string,
    public notes: string,
    createdAt?: string
  ) {
    super(id, createdAt);
  }
}

export class Lot extends Entity {
  constructor(
    id: string,
    public code: string,
    public equipmentIds: string[],
    public origin: string,
    public destination: string,
    public createdBy: string,
    public status: "ABERTO" | "FECHADO" = "ABERTO",
    createdAt?: string
  ) {
    super(id, createdAt);
  }
}

export class Transaction extends Entity {
  constructor(
    id: string,
    public equipmentId: string,
    public type: TransactionType,
    public quantity: number,
    public note: string,
    public actorId: string,
    public lotId?: string,
    public fromStatus?: EquipmentStatus,
    public toStatus?: EquipmentStatus,
    public fromLocation?: string,
    public toLocation?: string,
    createdAt?: string
  ) {
    super(id, createdAt);
  }
}

export class AuditEvent extends Entity {
  constructor(
    id: string,
    public actorId: string,
    public action: string,
    public entityName: string,
    public entityId: string,
    public details: Record<string, unknown>,
    public previousHash: string,
    public hash: string,
    createdAt?: string
  ) {
    super(id, createdAt);
  }
}

export class EntityFactory {
  private static generateId(): string {
    return crypto.randomUUID();
  }

  static createUser(name: string, username: string, passwordHash: string, role: Role): User {
    return new User(this.generateId(), name, username, passwordHash, role);
  }

  static createOrganization(name: string, cnpj: string, type: string, phone: string, email: string, address: string): Organization {
    return new Organization(this.generateId(), name, cnpj, type, phone, email, address);
  }

  static createEquipment(organizationId: string, serial: string, category: string, brand: string, model: string, condition: string, location: string, notes: string): Equipment {
    return new Equipment(this.generateId(), organizationId, serial, category, brand, model, condition, EquipmentStatus.RECEBIDO, location, new Date().toISOString(), notes);
  }

  static createLot(code: string, origin: string, destination: string, createdBy: string, equipmentIds: string[] = []): Lot {
    return new Lot(this.generateId(), code, equipmentIds, origin, destination, createdBy);
  }

  static createTransaction(equipmentId: string, type: TransactionType, actorId: string, note: string, quantity: number = 1): Transaction {
    return new Transaction(this.generateId(), equipmentId, type, quantity, note, actorId);
  }

  static createAuditEvent(actorId: string, action: string, entityName: string, entityId: string, details: Record<string, unknown>, previousHash: string, hash: string): AuditEvent {
    return new AuditEvent(this.generateId(), actorId, action, entityName, entityId, details, previousHash, hash);
  }
}
