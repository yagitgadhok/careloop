import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from "../lib/i18n/locales";

// The language comes from a cookie; URLs carry no locale.
export default getRequestConfig(async () => {
  const store = await cookies();
  const saved = store.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(saved) ? saved : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    timeZone: "Asia/Kolkata",
  };
});
