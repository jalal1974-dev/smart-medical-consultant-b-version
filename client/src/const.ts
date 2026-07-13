export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Canonical public site URL used for SEO tags, share links, and printed
// report footers. Override per deployment with VITE_APP_URL; falls back to
// the current origin in the browser so the site works on any domain.
export const SITE_URL: string =
  import.meta.env.VITE_APP_URL ||
  (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");

// Independent deployment: authentication is username/password only, handled
// by the local /login page (the Manus OAuth portal is not used).
export const getLoginUrl = () => "/login";
