// Ambient declarations for native modules that are lazy-required at
// runtime via Platform.OS guards. Without these, `tsc --noEmit` errors
// when the user hasn't run `npx expo install` yet — but the runtime
// behavior is fine because the require is wrapped in a try/catch and
// platform check.
//
// Once the user installs the actual packages, the real type
// declarations from those packages take precedence over these stubs
// (real declarations have a `declare module` with full types; these
// are loose `any` fallbacks).

declare module 'expo-location';
declare module 'usage-stats';
declare module 'health-connect';
