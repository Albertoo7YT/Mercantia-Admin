import "@testing-library/jest-dom/vitest";

// Default test env. Tests that need different values can override before importing modules.
const env = process.env as Record<string, string | undefined>;
env.SESSION_SECRET ??=
  "test_secret_change_me_64_chars_long_for_aes_and_hmac_okay";
env.SESSION_MAX_AGE_HOURS ??= "12";
env.NODE_ENV ??= "test";
