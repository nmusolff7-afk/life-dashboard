/**
 * Total Daily Energy Expenditure — RMR + NEAT + EAT + TEF.
 * `composeTdee` is the high-level wrapper; `computeTdee` is the direct sum for callers
 * that already have the four components.
 */

import { computeRmr, type RmrFormula, type RmrInput } from './rmr';
import { computeNeat, type NeatInput } from './neat';
import { resolveTef, type TefMacroInput } from './tef';

export interface TdeeComponents {
  rmr: number;
  neat: number;
  eat: number;
  tef: number;
}

export function computeTdee(components: TdeeComponents): number {
  return Math.round(components.rmr + components.neat + components.eat + components.tef);
}

export interface ComposeTdeeInput {
  rmr: RmrInput;
  neat: NeatInput;
  /** Exercise Activity Thermogenesis — sum of manually-logged or device-logged workout kcal. */
  eatKcal: number;
  /** Macros consumed today. If all zero/missing, TEF falls back to 10% of caloriesConsumed. */
  macros?: Partial<TefMacroInput>;
  caloriesConsumed?: number;
}

export interface ComposeTdeeResult {
  tdee: number;
  components: TdeeComponents;
  rmrFormula: RmrFormula;
  workoutSteps: number;
  netSteps: number;
}

export function composeTdee(input: ComposeTdeeInput): ComposeTdeeResult {
  const rmrResult = computeRmr(input.rmr);
  const neatResult = computeNeat(input.neat);
  const tef = resolveTef(input.caloriesConsumed ?? 0, input.macros ?? {});
  const components: TdeeComponents = {
    rmr: rmrResult.kcalPerDay,
    neat: neatResult.neatKcal,
    eat: input.eatKcal,
    tef,
  };
  return {
    tdee: computeTdee(components),
    components,
    rmrFormula: rmrResult.formulaUsed,
    workoutSteps: neatResult.workoutSteps,
    netSteps: neatResult.netSteps,
  };
}
