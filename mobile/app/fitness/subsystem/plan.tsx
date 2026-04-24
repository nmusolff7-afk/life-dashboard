import { Redirect } from 'expo-router';

/** Phase 12 moved the plan UI to `/fitness/plan` (index + builder).
 *  This subsystem route still exists in the Fitness tab's 7-card grid,
 *  so redirect through rather than duplicating the screen. */
export default function PlanSubsystemRedirect() {
  return <Redirect href={'/fitness/plan' as never} />;
}
