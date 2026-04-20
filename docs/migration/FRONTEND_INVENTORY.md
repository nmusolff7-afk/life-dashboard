# APEX Life Dashboard — Frontend Inventory

Generated: 2026-04-19 | 3 templates

---

## Architecture Overview

```
Template Rendering: Flask/Jinja2 (server-side)
Interactivity:      Vanilla JavaScript (no framework)
Styling:            Inline <style> blocks (no external CSS)
State:              localStorage + sessionStorage + 1 cookie
Charts:             Chart.js 4.4.0 (6 instances)
Drag & Drop:        Sortable.js 1.15.2
i18n:               static/i18n.js (10 languages)
PWA:                static/sw.js + static/manifest.json
```

**No React, Vue, Svelte, or any frontend framework.**
All UI is a single 10,296-line HTML file with tab-based navigation.

---

## Screen 1: Login

| Property | Value |
|----------|-------|
| **Purpose** | User authentication (login + registration) |
| **Template** | `templates/login.html` (274 lines) |
| **JavaScript** | Inline — tab switching, form submission |
| **CSS** | Inline `<style>` block (80 lines) |
| **API Endpoints** | `POST /login` (form submit), `POST /api/check-username` |
| **State** | None (session cookie set on success) |
| **User Inputs** | username (text), password (password), action toggle (login/register) |
| **Libraries** | Google Fonts (Bebas Neue, Rajdhani) |
| **Platform-specific** | `-webkit-font-smoothing`, `-webkit-appearance: none` |
| **Accessibility** | None |

---

## Screen 2: Onboarding

| Property | Value |
|----------|-------|
| **Purpose** | 7-step wizard: body stats, goals, diet, workout plan generation |
| **Template** | `templates/onboarding.html` (2,209 lines) |
| **JavaScript** | Inline — multi-page form, AI plan generation with polling |
| **CSS** | Inline `<style>` block (163 lines) |
| **API Endpoints** | `POST /api/onboarding/save`, `POST /api/onboarding/complete`, `GET /api/onboarding/poll`, `POST /api/generate-comprehensive-plan`, `POST /api/revise-plan` |
| **State** | sessionStorage for page state during async generation |
| **User Inputs** | weight (number), height ft/in (number), age (number), body fat % (number), sex (segmented), occupation (segmented), goal (card grid), diet type, workout preferences, equipment, schedule (checkboxes) |
| **Libraries** | Google Fonts, Chart.js (not used here) |
| **Platform-specific** | `-webkit-font-smoothing`, `-webkit-appearance: none` |
| **Accessibility** | None |

---

## Screen 3: Home Tab

| Property | Value |
|----------|-------|
| **Purpose** | Daily overview: streak, calorie balance, stats, tasks, macros/micros |
| **Template** | `templates/index.html` tab `#tab-home` |
| **JavaScript** | Inline — streak bar, ring chart SVG, stats refresh, task management, macro bars |
| **CSS** | Inline — `.dash-ring-*`, `.dash-stat-*`, `.streak-*`, `.mind-task-*` |
| **API Endpoints** | `GET /api/mind/today`, `PATCH /api/mind/task/{id}`, `DELETE /api/mind/task/{id}`, `POST /api/mind/task`, `POST /api/momentum/today` |
| **State** | `localStorage: dailyLog, profileData, stepsToday` |
| **User Inputs** | Task description (text), task checkbox toggle |
| **Libraries** | Chart.js (ring is SVG, not Chart.js) |
| **Platform-specific** | `-webkit-overflow-scrolling: touch` on streak bar |
| **Accessibility** | None |

### Components:
- **Streak Bar** — horizontal scroll, 90 days, clickable to open day detail, flame emoji + unlimited day count
- **Calorie Balance Ring** — SVG donut, green (deficit) / red (surplus), center number + calorie goal text below
- **Stats Grid** — 2x2: Weight, Steps, Proj. Burn, Cals Consumed
- **Macros/Micros Card** — swipeable 2-page (scroll-snap), page dots, page 1: protein/carbs/fat bars, page 2: sugar/fiber/sodium bars (unique colors per macro/micro)
- **Today's Tasks** — add button, checkbox list, completion count

---

## Screen 4: Nutrition Tab

| Property | Value |
|----------|-------|
| **Purpose** | Meal logging, daily summary, meal history |
| **Template** | `templates/index.html` tab `#tab-meals` |
| **JavaScript** | Inline — meal form, photo scan, barcode scan, macro estimation, breakdown rendering, meal table |
| **CSS** | Inline — `.meal-table`, `.macro-edit-grid`, `.bd-row`, `.deficit-display` |
| **API Endpoints** | `POST /api/log-meal`, `POST /api/estimate`, `POST /api/scan-meal`, `POST /api/shorten`, `POST /api/edit-meal/{id}`, `POST /api/delete-meal/{id}`, `GET /api/today-nutrition`, `POST /api/ai-edit-meal`, `GET /api/saved-meals`, `POST /api/saved-meals`, `DELETE /api/saved-meals/{id}` |
| **State** | `localStorage: dailyLog, recentMeals, profileData` |
| **User Inputs** | meal description (textarea), photo (file), barcode (camera), macro edits (number x4), corrections (textarea) |
| **Libraries** | Chart.js (calories consumed bar chart) |
| **Platform-specific** | `-webkit-overflow-scrolling: touch`, `capture="environment"` on file inputs, BarcodeDetector API |
| **Accessibility** | None |

### Components:
- **Log a Meal Card** — auto-grow textarea + Get Macros button + photo/barcode/saved options; voice-to-text stops on Get Macros press
- **Meal Table** — description (32 char cap), cal, pro, carb, fat columns, edit/delete buttons, totals row (displayed above daily summary)
- **Daily Summary** — swipeable 2-page with page dots: page 1 (deficit + P/C/F bars), page 2 (calories remaining + sugar/fiber/sodium)
- **Macro Edit Grid** — 4 inline number inputs (Cal, Protein, Carbs, Fat)
- **Item Breakdown** — per-item calorie list with remove buttons, Log button below
- **Barcode Scanner** — full-screen camera overlay with frame + scan animation
- **Calories Consumed Chart** — Chart.js bar chart, 7/30/90 day toggle

---

## Screen 5: Fitness Tab

| Property | Value |
|----------|-------|
| **Purpose** | Workout logging, strength tracking, steps, weight |
| **Template** | `templates/index.html` tab `#tab-workout` |
| **JavaScript** | Inline — activity form, burn estimation, strength checklist timer, set tracking, steps/weight forms |
| **CSS** | Inline — `.workout-item`, `.strength-done`, `.exercise-block`, `.set-row` |
| **API Endpoints** | `POST /api/log-workout`, `POST /api/burn-estimate`, `POST /api/edit-workout/{id}`, `POST /api/delete-workout/{id}`, `GET /api/today-workouts`, `POST /api/log-weight`, `POST /api/ai-edit-workout`, `GET /api/saved-workouts`, `POST /api/saved-workouts`, `DELETE /api/saved-workouts/{id}` |
| **State** | `localStorage: workoutPlan, weeklyPlan, workoutHistory, stepsToday, stepsLog, scaleLog, dailyLog, LS_TIMER_KEY` |
| **User Inputs** | activity description (textarea), weight (number), steps (number), exercise sets: weight_lbs (number), reps (number), checkbox per set |
| **Libraries** | Chart.js (total daily burn bar chart) |
| **Platform-specific** | Service Worker notifications for active workout |
| **Accessibility** | `role="button" aria-label="Return to workout"` on workout banner |

### Components:
- **Log Activity Card** — auto-grow textarea + Get Burn Estimate + Log Activity; voice-to-text stops on Get Burn press
- **Strength Card** — workout complete summary / idle plan preview / start workout button / "Log Another" button; collapsible exercise sets (tap to expand)
- **Workout Checklist Overlay** — full-screen, exercise blocks with set rows (checkbox, weight input, reps input), live timer, rest timer
- **Workout Entries** — unified card design for all types (strength/cardio/mixed), icon circles, calorie pills; cardio shows distance/pace/HR pills
- **Daily Steps Card** — number input + Save Steps + NEAT breakdown
- **Today's Weight Card** — number input + Save Weight
- **Total Daily Burn Chart** — Chart.js bar chart with stats row (Today / RMR / Active)

---

## Screen 6: Progress Tab

| Property | Value |
|----------|-------|
| **Purpose** | Charts, calendar, history, strength progress |
| **Template** | `templates/index.html` tab `#tab-progress` |
| **JavaScript** | Inline — 4 Chart.js charts, activity calendar grid, history list with day detail overlay |
| **CSS** | Inline — `.chart-*`, `.cal-grid`, `.cal-cell`, `.hist-row`, `.hd-stat` |
| **API Endpoints** | `GET /api/history`, `GET /api/day/{date}`, `POST /api/edit-meal/{id}`, `POST /api/delete-meal/{id}`, `POST /api/edit-workout/{id}`, `POST /api/delete-workout/{id}`, `POST /api/estimate`, `POST /api/burn-estimate`, `POST /api/log-meal`, `POST /api/log-workout` |
| **State** | `localStorage: dailyLog, profileData` |
| **User Inputs** | exercise selector (select dropdown), 7D/30D/90D toggles, history row click, calendar cell click |
| **Libraries** | Chart.js (4 instances: Daily Score line, Body Weight Trend line, Deficit/Surplus line, Strength Progress line) |
| **Platform-specific** | None specific |
| **Accessibility** | None |

### Components:
- **Daily Score Chart** — line chart, today/7D avg/trend stats
- **Body Weight Trend Chart** — line chart with projection dashed line, target line
- **Activity Calendar** — 7-column grid, color-coded cells (strength/cardio/both/rest), week labels, legend
- **History List** — card-per-day rows, deficit badge, weight, activity icons, clickable to open day detail
- **Day Detail Overlay** — full-screen, summary stats grid (weight, steps, calories, deficit, macros, micros), meal list with edit/delete, workout list with edit/delete, add meal/workout from history
- **Deficit/Surplus Chart** — line chart with zero line, target deficit dashed line
- **Strength Progress** — exercise selector dropdown, chart of weight/reps over time

---

## Screen 7: Status Tab

| Property | Value |
|----------|-------|
| **Purpose** | Daily score breakdown, task completion, AI insights, Gmail |
| **Template** | `templates/index.html` tab `#tab-mind` |
| **JavaScript** | Inline — momentum score computation, insight generation, Gmail sync, email importance labeling |
| **CSS** | Inline — `.mind-score-big`, `.gmail-card`, `.gmail-email-row` |
| **API Endpoints** | `POST /api/momentum/today`, `GET /api/momentum/history`, `POST /api/momentum/insight`, `POST /api/momentum/summary`, `GET /api/gmail/status`, `POST /api/gmail/sync`, `POST /api/gmail/disconnect`, `POST /api/gmail/label`, `GET /api/mind/today`, `PATCH /api/mind/task/{id}`, `DELETE /api/mind/task/{id}` |
| **State** | `sessionStorage: momentum_insight`, `localStorage: dailyLog, profileData` |
| **User Inputs** | Day/Week/Month insight toggle, Recalculate button, Gmail Important/Stream toggle, email dismiss (X), task checkboxes |
| **Libraries** | None (no charts on this tab) |
| **Platform-specific** | None |
| **Accessibility** | None |

### Components:
- **Daily Score Card** — large score number (72px), /100, category breakdown (calories, macros, workout, tasks) with colored scores
- **Insight Card** — left accent bar, Day/Week/Month pill toggle, AI-generated text, Recalculate button
- **Task List** — mirrors Home tab task list
- **Gmail Card** — connected/disconnected state, Important/Stream toggle, email rows (sender, subject, unreplied badge), label/dismiss buttons, "How this works" expandable, Refresh button

---

## Screen 8: Profile Tab

| Property | Value |
|----------|-------|
| **Purpose** | User settings: body stats, goals, workout plan, theme, language, account |
| **Template** | `templates/index.html` tab `#tab-profile` |
| **JavaScript** | Inline — slider wiring, goal calculation, plan builder, theme switching, timezone, reminders |
| **CSS** | Inline — `.slider-*`, `.seg-control`, `.collapse-card`, `.plan-day-section` |
| **API Endpoints** | `POST /api/goal/update`, `POST /api/parse-workout-plan`, `POST /api/generate-plan`, `POST /api/generate-comprehensive-plan`, `POST /api/revise-plan`, `POST /api/delete-account`, `GET /api/profile` |
| **State** | `localStorage: profileData, apex-theme, appLang, userTimezone, rmr-locked, workoutPlan, weeklyPlan, mealReminders` |
| **User Inputs** | weight (number), target weight (number), height ft/in (number), age (number), body fat % (number), sex (segmented), occupation (segmented), goal (segmented), RMR slider (range), NEAT slider (range), deficit slider (range), protein/carbs/fat/sugar/fiber/sodium sliders (range), workout plan textarea, theme buttons, language buttons, timezone select, reminder times (time inputs) |
| **Libraries** | Sortable.js (drag-and-drop workout plan builder) |
| **Platform-specific** | `-webkit-slider-thumb` styling |
| **Accessibility** | None |

### Components (all collapsible):
- **About You** — weight, target, height, age, bf%, sex, occupation, goal selectors + RMR/NEAT sliders with Edit/Lock toggle
- **Goals** — deficit, protein, carbs, fat, sugar, fiber, sodium sliders with Edit/Lock toggle + info panel with research sources
- **Live Preview** — computed daily plan text
- **Workout Plan** — AI Import textarea + Manual Builder (Sortable.js) + preview grid
- **My Profile** — summary line + Edit Profile / View Plan buttons
- **Settings** — calorie rollover toggle, auto-adjust toggle (persistent in localStorage)
- **Theme** — 2-button grid (Dark / Light), persists across sessions
- **Meal Reminders** — time inputs with add/remove, browser Notification API
- **Language** — 10 flag buttons (EN, ES, FR, DE, PT, IT, NL, PL, ZH, AR)
- **Timezone** — Automatic/Manual toggle + timezone select
- **Account** — signed in as + Sign Out + Danger Zone (delete account)

---

## Overlays & Modals

### Barcode Scanner Overlay
| Property | Value |
|----------|-------|
| **ID** | `#barcode-overlay` |
| **Trigger** | "Scan a barcode" button (meals card or FAB modal) |
| **APIs** | BarcodeDetector (EAN-13, UPC-A, EAN-8, UPC-E, Code 128, Code 39), navigator.mediaDevices.getUserMedia, Open Food Facts API |
| **Inputs** | Camera video feed (auto-detected) |
| **Components** | Full-screen video, scan frame with animation, product result card (name, brand, macros), Log This / Scan Again buttons |

### FAB Quick-Log Modals
| Property | Value |
|----------|-------|
| **IDs** | `#fab-meal-modal`, `#fab-activity-modal` |
| **Trigger** | FAB button (bottom-right) |
| **APIs** | `/api/estimate`, `/api/log-meal`, `/api/scan-meal`, `/api/burn-estimate`, `/api/log-workout` |
| **Inputs** | Meal textarea, activity textarea, photo file, barcode |
| **Components** | Blurred backdrop, card with inputs + buttons, photo preview + analyze |

### Meal Detail Overlay
| Property | Value |
|----------|-------|
| **ID** | `#meal-detail-overlay` |
| **Trigger** | Click meal row in table or history |
| **APIs** | `/api/saved-meals`, `/api/ai-edit-meal`, `/api/edit-meal/{id}` |
| **Components** | Hero (emoji icon, name, time), macro tiles (cal, pro, carb, fat, sugar, fiber, sodium), breakdown, AI edit textarea, Save/Saved button, Delete button |

### Workout Detail Overlay
| Property | Value |
|----------|-------|
| **ID** | `#workout-detail-overlay` |
| **Trigger** | Click workout entry |
| **APIs** | `/api/saved-workouts`, `/api/ai-edit-workout`, `/api/edit-workout/{id}` |
| **Components** | Hero (emoji icon, name, time), exercise cards with set grids (weight x reps), cardio stats (distance/pace/HR pills), calories burned tile, AI edit textarea, Save button, Delete button |

### Day Detail Overlay
| Property | Value |
|----------|-------|
| **ID** | `#history-detail` |
| **Trigger** | Click history row or streak day dot |
| **APIs** | `GET /api/day/{date}`, all meal/workout CRUD endpoints |
| **Components** | Summary stat grid (weight, steps, calories, deficit, macros, micros), meal list with inline edit, workout list with inline edit, add meal/workout forms |

### Workout Checklist Overlay
| Property | Value |
|----------|-------|
| **ID** | `#checklist-overlay` |
| **Trigger** | Start Workout button |
| **APIs** | `/api/burn-estimate`, `/api/log-workout` |
| **Components** | Exercise blocks with set rows, live timer, rest timer, complete/cancel buttons |

---

## Client-Side State Map

### localStorage (14+ keys)
| Key | Format | Used By | Persists |
|-----|--------|---------|----------|
| `u{id}:apex-theme` | `"dark"` or `"medium"` | Theme system | Yes |
| `u{id}:apex-units` | `"imperial"` or `"metric"` | Unit toggle | Yes |
| `u{id}:userTimezone` | `"America/New_York"` | Timezone | Yes |
| `appLang` | `"en"` / `"es"` / etc | i18n | Yes |
| `profileData` | JSON object | Profile, TDEE calc, macro bars | Yes |
| `dailyLog` | `{ "YYYY-MM-DD": { deficit, calories, tdee, protein, carbs, fat, sugar, fiber, sodium, weight, steps } }` | Charts, history, streak | Yes |
| `stepsToday` | `"8500"` | Steps card | Yes |
| `workoutPlan` | JSON `{ Monday: [...], ... }` | Strength card | Yes |
| `weeklyPlan` | JSON full plan | Plan builder | Yes |
| `workoutHistory` | JSON per-exercise logs | Strength progress | Yes |
| `rmr-locked` | `"0"` or `"1"` | RMR lock toggle | Yes |
| `mealReminders` | `["08:00","12:30","18:30"]` | Notification scheduler | Yes |
| `PANTRY_KEY` | JSON array | Meal suggestions | Yes |
| `recentMeals` | JSON array (max 20) | Quick re-log | Yes |

### sessionStorage (2 keys)
| Key | Format | Used By |
|-----|--------|---------|
| `activeTab` | `"home"` / `"meals"` / etc | Tab restoration on reload |
| `momentum_insight` | JSON | Cached daily insight |

### Cookies (1)
| Key | Value | Max-Age | Used By |
|-----|-------|---------|---------|
| `client_date` | `"YYYY-MM-DD"` | 86400 | Server-side timezone handling |

---

## Third-Party Libraries

| Library | Version | Loaded From | Used For |
|---------|---------|-------------|----------|
| Chart.js | 4.4.0 | cdn.jsdelivr.net | 6 chart instances (line, bar) |
| Sortable.js | 1.15.2 | cdn.jsdelivr.net | Workout plan drag-and-drop builder |
| Google Fonts | - | fonts.googleapis.com | Bebas Neue (header), Rajdhani (numbers) |
| Open Food Facts | v2 | world.openfoodfacts.org | Barcode nutrition lookup (client-side) |

---

## Browser APIs Used

| API | Purpose | Fallback |
|-----|---------|----------|
| BarcodeDetector | Barcode scanning | Alert: "not supported in this browser" |
| navigator.mediaDevices.getUserMedia | Camera for barcode/photos | File input fallback |
| Notification | Meal reminders, workout alerts | Silent (no notification) |
| Service Worker | PWA caching, offline, workout notifications | App works without it |
| Web Speech API | Voice input on textareas; auto-stops on Get Macros / Get Burn press | Mic button hidden if unsupported |
| CSS scroll-snap | Swipeable card pages | Falls back to horizontal scroll |
| CSS env() | Safe area insets (notch) | Falls back to 0px |

---

## Accessibility Audit

| Category | Status |
|----------|--------|
| `aria-label` | **1 instance** (workout banner) |
| `aria-expanded` | **0 instances** |
| `aria-hidden` | **0 instances** |
| `role` | **1 instance** (workout banner `role="button"`) |
| `tabindex` | **0 explicit instances** |
| Focus management | **None** — overlays don't trap focus |
| Screen reader labels | **None** on interactive elements |
| Color contrast | Meets AA in dark theme (white on near-black) |
| Keyboard navigation | **Partial** — tab order follows DOM, no skip links |
| `alt` text | Logo images have `alt=""` (decorative) |
| `data-i18n` | **36 elements** tagged for translation |

**Verdict:** Accessibility is minimal. Major work needed for WCAG compliance before app store submission.

---

## Platform-Specific Code

| Feature | iOS Safari | Android Chrome | Desktop |
|---------|-----------|---------------|---------|
| `-webkit-tap-highlight-color` | Removes blue flash | Removes blue flash | No effect |
| `-webkit-overflow-scrolling: touch` | Momentum scrolling | No effect (default) | No effect |
| `-webkit-backdrop-filter: blur()` | Blurred backgrounds | Works | Works |
| `capture="environment"` | Opens camera | Opens camera | Opens file picker |
| BarcodeDetector | Safari 16.4+ | Chrome 83+ | Chrome 83+ |
| Web Speech API | Works | Works | Works |
| Service Worker | Works | Works | Works |
| Notification API | Limited (requires PWA install) | Full support | Full support |
| `env(safe-area-inset-bottom)` | Notch handling | Ignored | Ignored |
| PWA install prompt | No `beforeinstallprompt` | Supported | Supported |

---

## Migration Notes for React Native

### Screens → React Native Screens
| Current Tab | RN Screen | Navigation |
|-------------|-----------|------------|
| `#tab-home` | `HomeScreen` | Bottom Tab |
| `#tab-meals` | `NutritionScreen` | Bottom Tab |
| `#tab-workout` | `FitnessScreen` | Bottom Tab |
| `#tab-progress` | `ProgressScreen` | Bottom Tab |
| `#tab-mind` | `StatusScreen` | Bottom Tab |
| `#tab-profile` | `ProfileScreen` | Bottom Tab |
| `#meal-detail-overlay` | `MealDetailScreen` | Stack Navigator |
| `#workout-detail-overlay` | `WorkoutDetailScreen` | Stack Navigator |
| `#history-detail` | `DayDetailScreen` | Stack Navigator |
| `#barcode-overlay` | `BarcodeScannerScreen` | Modal |
| `#checklist-overlay` | `WorkoutSessionScreen` | Modal |
| Login | `LoginScreen` | Auth Stack |
| Onboarding | `OnboardingScreen` | Auth Stack |

### State → React Native State
| Current | Target |
|---------|--------|
| localStorage | AsyncStorage or MMKV |
| sessionStorage | React state (in-memory) |
| cookie `client_date` | Remove — send timezone header instead |
| CSS variables (theming) | React Native StyleSheet + theme context |

### Libraries → React Native Equivalents
| Current | RN Replacement |
|---------|----------------|
| Chart.js | react-native-chart-kit or Victory Native |
| Sortable.js | react-native-draggable-flatlist |
| BarcodeDetector | expo-barcode-scanner or react-native-vision-camera |
| Web Speech API | expo-speech or react-native-voice |
| Service Worker | expo-notifications + expo-background-fetch |
| CSS scroll-snap | FlatList with pagingEnabled |
| Google Fonts | expo-font |
