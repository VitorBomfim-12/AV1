import { ValidationError } from '../errors/app-error';
import {
  CONDITION_RANK,
  ContractStatus,
  EquipmentCondition,
  EquipmentStatus,
  LotStatus,
  Role,
  TransactionType,
} from './enums';

export abstract class Validator<T> {
  abstract validate(data: T): void;
}

export class CNPJValidator extends Validator<string> {
  static normalize(cnpj: string): string {
    return (cnpj || '').replace(/\D/g, '');
  }

  validate(cnpj: string): void {
    const cleaned = CNPJValidator.normalize(cnpj);
    if (cleaned.length !== 14) {
      throw new ValidationError('CNPJ inválido: deve conter 14 dígitos.');
    }
    if (/^(\d)\1+$/.test(cleaned)) {
      throw new ValidationError('CNPJ inválido: números repetidos.');
    }

    let length = cleaned.length - 2;
    let numbers = cleaned.substring(0, length);
    const digits = cleaned.substring(length);
    let sum = 0;
    let pos = length - 7;

    for (let i = length; i >= 1; i--) {
      sum += parseInt(numbers.charAt(length - i), 10) * pos--;
      if (pos < 2) pos = 9;
    }

    let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (result !== parseInt(digits.charAt(0), 10)) {
      throw new ValidationError('CNPJ inválido: falha no 1º dígito verificador.');
    }

    length = length + 1;
    numbers = cleaned.substring(0, length);
    sum = 0;
    pos = length - 7;

    for (let i = length; i >= 1; i--) {
      sum += parseInt(numbers.charAt(length - i), 10) * pos--;
      if (pos < 2) pos = 9;
    }

    result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (result !== parseInt(digits.charAt(1), 10)) {
      throw new ValidationError('CNPJ inválido: falha no 2º dígito verificador.');
    }
  }
}

export class DateValidator extends Validator<Date> {
  validate(date: Date): void {
    if (Number.isNaN(date.getTime())) {
      throw new ValidationError('Data inválida: formato de data não reconhecido.');
    }

    const now = new Date();
    const maxFutureTolerance = new Date(now.getTime() + 5 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    if (date > maxFutureTolerance) {
      throw new ValidationError('Data inválida: data não pode ser futura.');
    }
    if (date < ninetyDaysAgo) {
      throw new ValidationError('Data inválida: data não pode ser anterior a 90 dias.');
    }
  }
}

export class EquipmentDomainValidator {
  static ensureValidCondition(condition: string): EquipmentCondition {
    const normalized = (condition || '').toUpperCase() as EquipmentCondition;
    if (!Object.values(EquipmentCondition).includes(normalized)) {
      throw new ValidationError(
        `Condição física inválida: '${condition}'. Valores aceitos: ${Object.values(EquipmentCondition).join(', ')}.`
      );
    }
    return normalized;
  }

  static ensureValidStatus(status: string): EquipmentStatus {
    const normalized = (status || '').toUpperCase() as EquipmentStatus;
    if (!Object.values(EquipmentStatus).includes(normalized)) {
      throw new ValidationError(
        `Status de equipamento inválido: '${status}'. Valores aceitos: ${Object.values(EquipmentStatus).join(', ')}.`
      );
    }
    return normalized;
  }

  static validateConditionTransition(
    oldConditionStr: string,
    newConditionStr: string,
    note?: string
  ): EquipmentCondition {
    const oldCondition = this.ensureValidCondition(oldConditionStr);
    const newCondition = this.ensureValidCondition(newConditionStr);

    const oldRank = CONDITION_RANK.indexOf(oldCondition);
    const newRank = CONDITION_RANK.indexOf(newCondition);

    if (newRank - oldRank >= 2 && (!note || note.trim().length === 0)) {
      throw new ValidationError(
        'Justificativa obrigatória para rebaixamento de 2 ou mais categorias de estado físico.'
      );
    }

    return newCondition;
  }

  static validateStatusTransition(oldStatusStr: string, newStatusStr: string): EquipmentStatus {
    const oldStatus = this.ensureValidStatus(oldStatusStr);
    const newStatus = this.ensureValidStatus(newStatusStr);

    if (
      newStatus === EquipmentStatus.AGUARDANDO_COMPONENTES &&
      oldStatus !== EquipmentStatus.EM_TRIAGEM &&
      oldStatus !== EquipmentStatus.AGUARDANDO_COMPONENTES
    ) {
      throw new ValidationError(
        'Equipamento só pode ir para desmonte/aguardando componentes após triagem completa (EM_TRIAGEM).'
      );
    }

    const terminalStatuses: EquipmentStatus[] = [
      EquipmentStatus.DESCARTADO,
      EquipmentStatus.DOADO,
      EquipmentStatus.VENDIDO,
    ];
    if (terminalStatuses.includes(oldStatus) && oldStatus !== newStatus) {
      throw new ValidationError(
        `Equipamento em status terminal (${oldStatus}) não pode transitar diretamente para ${newStatus}.`
      );
    }

    return newStatus;
  }
}

export function ensureValidRole(role: string): Role {
  const normalized = (role || '').toUpperCase() as Role;
  if (!Object.values(Role).includes(normalized)) {
    throw new ValidationError(
      `Perfil inválido: '${role}'. Valores aceitos: ${Object.values(Role).join(', ')}.`
    );
  }
  return normalized;
}

export function ensureValidLotStatus(status: string): LotStatus {
  const normalized = (status || '').toUpperCase() as LotStatus;
  if (!Object.values(LotStatus).includes(normalized)) {
    throw new ValidationError(
      `Status de lote inválido: '${status}'. Valores aceitos: ${Object.values(LotStatus).join(', ')}.`
    );
  }
  return normalized;
}

export function ensureValidContractStatus(status: string): ContractStatus {
  const normalized = (status || '').toUpperCase() as ContractStatus;
  if (!Object.values(ContractStatus).includes(normalized)) {
    throw new ValidationError(
      `Status de contrato inválido: '${status}'. Valores aceitos: ${Object.values(ContractStatus).join(', ')}.`
    );
  }
  return normalized;
}

export function ensureValidTransactionType(type: string): TransactionType {
  const normalized = (type || '').toUpperCase() as TransactionType;
  if (!Object.values(TransactionType).includes(normalized)) {
    throw new ValidationError(
      `Tipo de movimentação inválido: '${type}'. Valores aceitos: ${Object.values(TransactionType).join(', ')}.`
    );
  }
  return normalized;
}
