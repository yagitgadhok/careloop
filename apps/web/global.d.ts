import type en from "./messages/en.json";
import type { AppLocale } from "./lib/i18n/locales";

// Message keys are checked at compile time against the English catalogue.
declare module "next-intl" {
  interface AppConfig {
    Locale: AppLocale;
    Messages: typeof en;
  }
}
