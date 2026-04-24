import { useEffect, useState } from 'react';

import { DEFAULT_PREFERENCES, loadPreferences, type UnitSystem } from './preferences';

const LB_TO_KG = 0.453592;
const KG_TO_LB = 1 / LB_TO_KG;
const IN_TO_CM = 2.54;

export interface UnitFormatters {
  units: UnitSystem;
  /** Label for the weight unit ("lbs" / "kg"). */
  weightUnit: string;
  /** Formats an internal-canonical lbs value into the current unit, rounded.
   *  Always stores and reads as lbs on the wire — conversion is view-only. */
  formatWeight: (lbs: number | null | undefined, opts?: { round?: boolean }) => string;
  /** Converts a display value (in current unit) back to canonical lbs for
   *  POSTs. Returns the same number untouched when imperial, or lbs when
   *  metric. */
  toCanonicalWeightLbs: (displayValue: number) => number;
  /** Formats height in ft/in or cm depending on the unit. */
  formatHeight: (heightFt: number | null | undefined, heightIn: number | null | undefined) => string;
}

/** Reads the units preference and hands back formatters. Canonical storage
 *  is always imperial (matches Flask's lbs / ft+in schema); metric is a
 *  display-only transformation. */
export function useUnits(): UnitFormatters {
  const [units, setUnits] = useState<UnitSystem>(DEFAULT_PREFERENCES.units);

  useEffect(() => {
    loadPreferences().then((p) => setUnits(p.units)).catch(() => {});
  }, []);

  const weightUnit = units === 'metric' ? 'kg' : 'lbs';

  const formatWeight = (lbs: number | null | undefined, opts?: { round?: boolean }) => {
    if (lbs == null || !Number.isFinite(lbs)) return '—';
    const value = units === 'metric' ? lbs * LB_TO_KG : lbs;
    // Default: round to one decimal (e.g. "148.5") — whole-lb rounding
    // erased user-entered decimals on re-display. opts.round === true
    // still forces integer for cards that are space-constrained.
    if (opts?.round === true) return String(Math.round(value));
    return (Math.round(value * 10) / 10).toFixed(1);
  };

  const toCanonicalWeightLbs = (display: number) =>
    units === 'metric' ? display * KG_TO_LB : display;

  const formatHeight = (ft: number | null | undefined, inch: number | null | undefined) => {
    if (ft == null && inch == null) return '—';
    const f = ft ?? 0;
    const i = inch ?? 0;
    if (units === 'metric') {
      const totalIn = f * 12 + i;
      const cm = Math.round(totalIn * IN_TO_CM);
      return `${cm} cm`;
    }
    return `${f}'${i}"`;
  };

  return { units, weightUnit, formatWeight, toCanonicalWeightLbs, formatHeight };
}
