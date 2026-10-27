import * as crypto from 'crypto';
import { ValidationError } from '../errors/app-error';
import { EquipmentCondition } from './enums';

export interface ValuationInput {
  estimatedValue: number;
  condition: EquipmentCondition | string;
  depreciationRate?: number; // % (0 - 100)
  taxRate?: number; // % (0 - 100)
}

export interface ValuationResult {
  estimatedValue: number;
  conditionFactor: number;
  depreciationRate: number;
  taxRate: number;
  grossConditionValue: number;
  depreciatedValue: number;
  taxAmount: number;
  currentValue: number;
}

const CONDITION_MULTIPLIERS: Record<EquipmentCondition, number> = {
  [EquipmentCondition.NOVO]: 1.0,
  [EquipmentCondition.OTIMO]: 0.85,
  [EquipmentCondition.BOM]: 0.7,
  [EquipmentCondition.REGULAR]: 0.5,
  [EquipmentCondition.RUIM]: 0.3,
  [EquipmentCondition.PESSIMO]: 0.15,
  [EquipmentCondition.SUCATA]: 0.05,
};

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export class FinancialCalculator {
  static calculateValuation(input: ValuationInput): ValuationResult {
    const estimatedValue = Number(input.estimatedValue ?? 0);
    if (estimatedValue < 0 || Number.isNaN(estimatedValue)) {
      throw new ValidationError('O valor estimado do equipamento não pode ser negativo.');
    }

    const depreciationRate = Number(input.depreciationRate ?? 10);
    const taxRate = Number(input.taxRate ?? 0);

    if (depreciationRate < 0 || depreciationRate > 100) {
      throw new ValidationError('O coeficiente de depreciação deve estar entre 0% e 100%.');
    }
    if (taxRate < 0 || taxRate > 100) {
      throw new ValidationError('A alíquota de imposto deve estar entre 0% e 100%.');
    }

    const normalizedCondition = (input.condition || 'REGULAR').toUpperCase() as EquipmentCondition;
    const conditionFactor = CONDITION_MULTIPLIERS[normalizedCondition] ?? 0.5;

    const grossConditionValue = round2(estimatedValue * conditionFactor);
    const depreciatedValue = round2(grossConditionValue * (1 - depreciationRate / 100));
    const taxAmount = round2(depreciatedValue * (taxRate / 100));
    const currentValue = Math.max(0, round2(depreciatedValue - taxAmount));

    return {
      estimatedValue: round2(estimatedValue),
      conditionFactor,
      depreciationRate,
      taxRate,
      grossConditionValue,
      depreciatedValue,
      taxAmount,
      currentValue,
    };
  }

  static generateInternalBarcode(prefix = 'GC'): string {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomPart = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `${prefix}-${datePart}-${randomPart}`;
  }
}
