import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Server-side access control.
 *
 * Every page rendered for anyone. The APIs answered 401 without a session, but the
 * screens themselves did not care — a stranger could open the business dashboard, the
 * post form or someone's earnings and be served the whole app.
 *
 * A client-side guard alone is not enough: the HTML still goes out and JavaScript
 * redirects afterwards, so the shell is served to whoever asks. This runs before the
 * route renders, so a page nobody is entitled to is never built.
 *
 * `proxy.ts`, not `middleware.ts` — the middleware convention is deprecated in this
 * version of Next and renamed to proxy.
 *
 * The session cookie is HMAC-signed (see lib/session.ts). Verifying it needs the same
 * secret, and this runs in the edge runtime where node:crypto is unavailable — so the
 * check is done with Web Crypto, which is the same HMAC, computed differently.
 */

const COOKIE = "vane_session";

/**
 * Discovery stays open. A marketplace nobody can look at before joining is not a
 * marketplace — the campaign feed, a campaign, and a business's public profile are all
 * meant to be linkable and shareable.
 */
const PUBLIC = [
  "/",
  "/start",
  "/login",
  "/preview",
  "/join/tasker",
  "/join/business",
  "/tasks",
];
const PUBLIC_PREFIXES = ["/campaign/", "/business/", "/r/", "/api/", "/_next/", "/favicon"];

function isPublic(pathname: string): boolean {
  if (PUBLIC.includes(pathname)) return true;
  // "/business" is the dashboard; "/business/acme" is a public profile.
  if (pathname === "/business") return false;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

/** Recompute the signature and compare. Mirrors lib/session.ts exactly. */
async function validSession(signed: string | undefined): Promise<boolean> {
  if (!signed) return false;
  const dot = signed.lastIndexOf(".");
  if (dot < 0) return false;

  const value = signed.slice(0, dot);
  const mac = signed.slice(dot + 1);
  const secret = process.env.SESSION_SECRET ?? "vane-dev-secret-change-me";

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));

    // base64url, matching what node's digest("base64url") produces.
    const expected = btoa(String.fromCharCode(...new Uint8Array(sig)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    if (mac.length !== expected.length) return false;
    // Constant-time: compare every character regardless of where it first differs.
    let diff = 0;
    for (let i = 0; i < mac.length; i++) diff |= mac.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  if (await validSession(request.cookies.get(COOKIE)?.value)) return NextResponse.next();

  // Remember where they were going, so signing in returns them there.
  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except static assets; the function itself decides what is public.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)"],
};
