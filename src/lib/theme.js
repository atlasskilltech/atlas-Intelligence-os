/**
 * Theme (light / dark / system). Pure, shared by the boot script and the toggle.
 * The choice is kept in localStorage; "system" follows the OS setting.
 */
export const THEME_KEY = "atlas.theme";
export const THEMES = ["light", "dark", "system"];

/** Runs in <head> before paint so the page never flashes the wrong theme. */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="light"&&t!=="dark")t="system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.dataset.theme=t;}catch(e){}})();`;
