/** Client-side cardio classification + duration estimation for display. */

const CARDIO_KEYWORDS = /\b(run|ran|jog|jogged|bike|biked|cycling|swim|swam|row|rowed|treadmill|elliptical|walk|walked|hike|hiked|peloton|zone\s*[12345])\b/i;
const STRENGTH_KEYWORDS = /\b(bench|squat|deadlift|press|curl|dip|pull-?up|chin-?up|push-?up|\d+\s*x\s*\d+\s*(?:@|at))/i;

export function classifyAsCardio(description: string): boolean {
  const d = description.toLowerCase();
  if (STRENGTH_KEYWORDS.test(d)) return false;
  return CARDIO_KEYWORDS.test(d);
}

/** Pulls minutes out of descriptions like "30 min run", "45 minutes cycling",
 *  "1 hour swim", "ran 3 miles" (estimated via typical pace). Returns 0 if
 *  not confident. */
export function estimateCardioDuration(description: string): number {
  if (!description) return 0;
  const d = description.toLowerCase();
  const minMatch = d.match(/(\d+(?:\.\d+)?)\s*(min(?:ute)?s?)\b/);
  if (minMatch) return Math.round(parseFloat(minMatch[1]));
  const hrMatch = d.match(/(\d+(?:\.\d+)?)\s*(hr|hour|hours)\b/);
  if (hrMatch) return Math.round(parseFloat(hrMatch[1]) * 60);
  const mileMatch = d.match(/(\d+(?:\.\d+)?)\s*(mi|mile|miles)\b/);
  if (mileMatch) {
    // Typical 9-min/mile for runs, 12 min/mile for walks/hikes
    const isRun = /\b(run|jog|treadmill)\b/.test(d);
    return Math.round(parseFloat(mileMatch[1]) * (isRun ? 9 : 12));
  }
  const kmMatch = d.match(/(\d+(?:\.\d+)?)\s*km\b/);
  if (kmMatch) {
    const isRun = /\b(run|jog|treadmill)\b/.test(d);
    return Math.round(parseFloat(kmMatch[1]) * (isRun ? 5.5 : 7));
  }
  return 0;
}
