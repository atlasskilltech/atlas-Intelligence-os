/**
 * Plugin logos, matched on the project's name or URL. To add or change a logo:
 * put the image in public/brand/plugins/ and add or edit a line here.
 * Projects with no match show the placeholder (default.svg) until a logo is added.
 */
const LOGOS = [
  { match: /corporate\s*hustle|career\s*connect|careerconnect|career\s*services/i, src: "/brand/plugins/corporate-hustle.webp" },
  { match: /web\s*insight|webinsight/i, src: "/brand/plugins/web-insight.webp" },
  { match: /hrms|\bhr\b|uat-hr\./i, src: "/brand/plugins/hrms.webp" },
  { match: /dashboard/i, src: "/brand/plugins/dashboard.webp" },
  // Not added yet (placeholder for now): CRM, Procurement, Research Publication.
];

export const DEFAULT_PLUGIN_LOGO = "/brand/plugins/default.svg";

export function pluginLogo({ name = "", baseUrl = "" } = {}) {
  const text = `${name} ${baseUrl}`;
  return LOGOS.find((l) => l.match.test(text))?.src || DEFAULT_PLUGIN_LOGO;
}
