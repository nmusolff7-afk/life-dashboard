/**
 * Thermic Effect of Food — calories burned digesting macros.
 * Protein 25%, carbs 8%, fat 3% (standard textbook values).
 */

export interface TefMacroInput {
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export function computeTef(input: TefMacroInput): number {
  return Math.round(
    input.proteinG * 4 * 0.25 +
    input.carbsG * 4 * 0.08 +
    input.fatG * 9 * 0.03,
  );
}

export function computeTefFlat(totalKcal: number): number {
  return Math.round(totalKcal * 0.10);
}

/** Convenience: use macro-based formula if any macro is non-zero, otherwise flat 10%. */
export function resolveTef(totalKcal: number, macros: Partial<TefMacroInput>): number {
  const { proteinG = 0, carbsG = 0, fatG = 0 } = macros;
  if (proteinG > 0 || carbsG > 0 || fatG > 0) {
    return computeTef({ proteinG, carbsG, fatG });
  }
  return computeTefFlat(totalKcal);
}
