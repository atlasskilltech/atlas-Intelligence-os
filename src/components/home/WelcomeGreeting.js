"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_TZ, greetLine, resolveTimeZone } from "@/lib/assistant/greeting";

/** The browser's IANA time zone (sent with every ask; the server validates it). */
export function browserTimeZone() {
  try {
    return resolveTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return DEFAULT_TZ;
  }
}

// Re-read once a minute so a page left open crosses 12:00 / 17:00 correctly.
const subscribe = (cb) => {
  const t = setInterval(cb, 60_000);
  return () => clearInterval(t);
};

/**
 * Welcome line ("<greeting>, <first name>!") from the SAME pure bands as the NEXUS
 * prompt (src/lib/assistant/greeting.js), in the viewer's own time zone. The
 * server render uses IST; the browser then switches to its own zone.
 */
export default function WelcomeGreeting({ name = null, className }) {
  const text = useSyncExternalStore(
    subscribe,
    () => greetLine({ name, tz: browserTimeZone() }),
    () => greetLine({ name, tz: DEFAULT_TZ }),
  );
  return (
    <p className={className} suppressHydrationWarning>
      {text}
    </p>
  );
}
