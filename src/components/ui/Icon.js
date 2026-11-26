// Small inline SVG icon set (stroke icons, 24x24) — avoids an icon dependency.
const PATHS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z",
  sparkles:
    "M12 3v3m0 12v3M3 12h3m12 0h3M6.3 6.3l2.1 2.1m7.2 7.2 2.1 2.1m0-11.4-2.1 2.1m-7.2 7.2-2.1 2.1",
  bot: "M12 3v3M7 8h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3Zm2 5h.01M15 13h.01M9.5 17h5",
  plug: "M9 3v5m6-5v5M6 8h12v3a6 6 0 0 1-12 0V8Zm6 9v4",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5m4-1v5l3 2",
  terminal: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm3 5 3 2-3 2m5 1h5",
  cpu: "M9 3v2m6-2v2M9 19v2m6-2v2M3 9h2m-2 6h2m14-6h2m-2 6h2M7 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm2 4h6v6H9V9Z",
  chart: "M4 20V10m6 10V4m6 16v-7m4 7H3",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M18 6 6 18",
  plus: "M12 5v14M5 12h14",
  alert: "M12 9v4m0 4h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  check: "M5 12.5 10 17 19 7",
  clock: "M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  shield: "M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z",
  panel: "M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm5 0v16",
  arrowUp: "M12 19V5m-6 6 6-6 6 6",
  edit: "M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Zm9.5-13.5 4 4",
  pause: "M9 5v14M15 5v14",
  play: "M7 4.5v15l12-7.5-12-7.5Z",
  trash: "M4 7h16M10 11v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3",
  sun: "M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-5.66 1.41-1.41M4.93 19.07l1.41-1.41m0-11.32L4.93 4.93m14.14 14.14-1.41-1.41M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z",
  monitor: "M4 4h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm4 16h8m-4-4v4",
  expand: "M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5",
  collapse: "M9 4v5H4m11-5v5h5m0 6h-5v5M4 15h5v5",
  minus: "M5 12h14",
  fit: "M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3m1-12h6v6H9z",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm-7 9a7 7 0 0 0 14 0m-7 7v2",
  micOff: "M3 3l18 18M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-5.7-1.3M19 12a7 7 0 0 1-1.1 3.8M5 12a7 7 0 0 0 10.7 5.9M12 19v2",
  chat: "M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm4 5h8m-8 3h5",
  settings: "M4 6h10m4 0h2M4 12h4m4 0h8M4 18h12m4 0h0M14 4v4m-4 2v4m6 2v4",
  keyboard: "M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm4 4h.01M11 10h.01M15 10h.01M7 14h10",
  mail: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm-1 1 9 7 9-7",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0",
  search: "M21 21l-4.3-4.3M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z",
  chatSearch: "M20 11.5A8 8 0 1 0 6.3 17.2L4 20l4-.9a8 8 0 0 0 2.5.8M15.5 19.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm1.8.7L19 22",
  code: "M8 8l-4 4 4 4m8-8 4 4-4 4m-2.5-10-3 12",
  logout: "M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10",
  chevronsUpDown: "M8 9l4-4 4 4M8 15l4 4 4-4",
};

export default function Icon({ name, className = "size-5", ...props }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <path d={d} />
    </svg>
  );
}
