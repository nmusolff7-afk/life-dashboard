/** Scientific sources the workout-plan AI draws from, mirrored from the
 *  PWA (templates/onboarding.html WB_SOURCES). Each entry tags which
 *  programming decisions it speaks to, so the "How we built your plan"
 *  panel can show only the citations that actually drove the user's
 *  plan (instead of dumping the full bibliography every time). */

export interface WorkoutPlanSource {
  shortName: string;
  fullCitation: string;
  url: string;
  /** Tags matched against the user's quiz answers to decide relevance. */
  relevantTo: string[];
}

export const WORKOUT_PLAN_SOURCES: WorkoutPlanSource[] = [
  {
    shortName: 'Schoenfeld & Krieger 2016',
    fullCitation:
      'Schoenfeld BJ, Ogborn D, Krieger JW. Effects of Resistance Training Frequency on Measures of Muscle Hypertrophy: A Systematic Review and Meta-Analysis. Sports Medicine. 2016;46(11):1689–1697.',
    url: 'https://link.springer.com/article/10.1007/s40279-016-0543-8',
    relevantTo: ['training_frequency', 'split_selection', 'general_programming'],
  },
  {
    shortName: 'Schoenfeld & Krieger 2019',
    fullCitation:
      'Schoenfeld BJ, Ogborn D, Krieger JW. How many times per week should a muscle be trained to maximize muscle hypertrophy? Journal of Sports Sciences. 2019;37(11):1286–1295.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/30558493/',
    relevantTo: ['training_frequency', 'volume_priority'],
  },
  {
    shortName: 'Pelland et al. 2025',
    fullCitation:
      'Pelland J, Robinson Z, Remmert J, et al. The Resistance Training Dose Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency. Sports Medicine. 2025.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/41343037/',
    relevantTo: ['training_volume', 'dose_response', 'general_programming'],
  },
  {
    shortName: 'Schoenfeld et al. 2017 (Volume)',
    fullCitation:
      'Schoenfeld BJ, Ogborn D, Krieger JW. Dose-response relationship between weekly resistance training volume and increases in muscle mass. Journal of Sports Sciences. 2017;35(11):1073–1082.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/27433992/',
    relevantTo: ['training_volume', 'hypertrophy'],
  },
  {
    shortName: 'Krieger 2010',
    fullCitation:
      'Krieger JW. Single vs. multiple sets of resistance exercise for muscle hypertrophy: a meta-analysis. JSCR. 2010;24(4):1150–1159.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/20300012/',
    relevantTo: ['training_volume', 'set_volume', 'general_programming'],
  },
  {
    shortName: 'Lamon et al. 2021',
    fullCitation:
      'Lamon S, Morabito A, Arentson-Lantz E, et al. The effect of acute sleep deprivation on skeletal muscle protein synthesis and the hormonal environment. Physiological Reports. 2021;9(1):e14660.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/33400856/',
    relevantTo: ['sleep', 'recovery', 'protein_synthesis'],
  },
  {
    shortName: 'Stults-Kolehmainen & Bartholomew 2012',
    fullCitation:
      'Stults-Kolehmainen MA, Bartholomew JB. Psychological stress impairs short-term muscular recovery from resistance exercise. MSSE. 2012;44(11):2220–2227.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/22688829/',
    relevantTo: ['stress', 'recovery', 'volume_adjustment'],
  },
  {
    shortName: 'Schumann et al. 2022',
    fullCitation:
      'Schumann M, et al. Compatibility of Concurrent Aerobic and Strength Training for Skeletal Muscle Size and Function. Sports Medicine. 2022;52(3):601–612.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/34757594/',
    relevantTo: ['concurrent_training', 'cardio_interference', 'hypertrophy'],
  },
  {
    shortName: 'Wilson et al. 2012',
    fullCitation:
      'Wilson JM, et al. Concurrent training: a meta-analysis examining interference of aerobic and resistance exercises. JSCR. 2012;26(8):2293–2307.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/22002517/',
    relevantTo: ['concurrent_training', 'running_interference'],
  },
  {
    shortName: 'Wewege et al. 2017',
    fullCitation:
      'Wewege M, et al. The effects of HIIT vs. MICT on body composition in overweight and obese adults. Obesity Reviews. 2017;18(6):635–646.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/28401638/',
    relevantTo: ['HIIT', 'LISS', 'fat_loss', 'cardio_programming'],
  },
  {
    shortName: 'Rhea & Alderman 2004',
    fullCitation:
      'Rhea MR, Alderman BL. A meta-analysis of periodized versus nonperiodized strength and power training programs. RQES. 2004;75(4):413–422.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/15673040/',
    relevantTo: ['periodization', 'progressive_overload', 'general_programming'],
  },
  {
    shortName: 'Nunes et al. 2021',
    fullCitation:
      'Nunes JP, et al. What influence does resistance exercise order have on muscular strength gains and muscle hypertrophy? EJSS. 2021;21(2):149–157.',
    url: 'https://www.tandfonline.com/doi/full/10.1080/17461391.2020.1733672',
    relevantTo: ['exercise_order', 'exercise_selection', 'general_programming'],
  },
  {
    shortName: 'Barakat et al. 2020',
    fullCitation:
      'Barakat C, et al. Body Recomposition: Can Trained Individuals Build Muscle and Lose Fat at the Same Time? SCJ. 2020;42(5):7–21.',
    url: 'https://journals.lww.com/nsca-scj/fulltext/2020/10000/body_recomposition__can_trained_individuals_build.3.aspx',
    relevantTo: ['recomposition', 'simultaneous_goals'],
  },
  {
    shortName: 'ACSM Position Stand 2009',
    fullCitation:
      'Ratamess NA, et al. ACSM Position Stand: Progression Models in Resistance Training for Healthy Adults. MSSE. 2009;41(3):687–708.',
    url: 'https://tourniquets.org/wp-content/uploads/PDFs/ACSM-Progression-models-in-resistance-training-for-healthy-adults-2009.pdf',
    relevantTo: ['general_programming', 'beginner_advanced', 'split_selection'],
  },
  {
    shortName: 'Hayden et al. 2021 (Cochrane)',
    fullCitation:
      'Hayden JA, et al. Exercise therapy for chronic low back pain. Cochrane Database Syst Rev. 2021;(10):CD009790.',
    url: 'https://www.cochrane.org/evidence/CD009790_exercise-treatment-chronic-low-back-pain',
    relevantTo: ['injury_modification'],
  },
  {
    shortName: 'Schoenfeld et al. 2017 (Load)',
    fullCitation:
      'Schoenfeld BJ, et al. Strength and Hypertrophy Adaptations Between Low- vs. High-Load Resistance Training. JSCR. 2017;31(12):3508–3523.',
    url: 'https://journals.lww.com/nsca-jscr/fulltext/2017/12000/strength_and_hypertrophy_adaptations_between_low_.31.aspx',
    relevantTo: ['injury_modification', 'low_load_training'],
  },
];

/** Given the user's quiz answers, pick which sources were actually
 *  relevant to their plan. Any source whose `relevantTo` tag matches
 *  any of the `activeTags` is included. `general_programming` sources
 *  are always included. */
export function relevantSourcesFor(activeTags: Set<string>): WorkoutPlanSource[] {
  return WORKOUT_PLAN_SOURCES.filter((s) =>
    s.relevantTo.some((t) => t === 'general_programming' || activeTags.has(t)),
  );
}
