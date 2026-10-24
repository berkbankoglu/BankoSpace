import { hasHistory } from './dashLayout';

// Whether to ask a new user which sections they will use.
//
// Asked once per account — the answer is synced, so a second device does not
// ask again. Anyone who already has data in the app has, in effect, answered:
// they are marked done without being asked and keep every section they had.
export const ONBOARDED_KEY = 'onboarded_v1';

export function needsSectionPicker() {
  if (localStorage.getItem(ONBOARDED_KEY)) return false;
  if (hasHistory()) {
    localStorage.setItem(ONBOARDED_KEY, 'existing');
    return false;
  }
  return true;
}

export function finishSectionPicker() {
  localStorage.setItem(ONBOARDED_KEY, 'chosen');
}

// What each section is, in a line, for the picker.
export const SECTION_BLURBS = {
  planner:      'Your schedule in day, week, month and year views.',
  notes:        'Notes with formatting, images, drawings and sub-notes.',
  checklists:   'A daily checklist that resets each morning, and a long-term one.',
  habits:       'Habits ticked off day by day, and your medications.',
  japanesekana: 'Learn Japanese: kana, vocabulary and flash cards.',
  fitness:      'Meals and calories, workouts, weight and measurements.',
  review:       'A rated library of what you watch, read, play and listen to.',
};
