// Core bypass logic. Three strategies:
//   1. HEAD redirect follower (pure shorteners).
//   2. FastForward Crowd-Bypass query (free, crowd-sourced).
//   3. bypass.vip API (free-tier "shutdown" placeholder OR premium with API key).
//
// All functions return a Promise<{ ok, url?, source, error?, status? }>.

import { lookupDomain } from "./domains.js";

const CROWD_URL = "https://crowd.fastforward.team/crowd/query_v1";
const CROWD_CONTRIBUTE_URL = "https://crowd.fastforward.team/crowd/contribute_v1";
const BYPASS_VIP_URL = "https://api.bypass.vip/bypass";
const BYPASS_VIP_PREMIUM_URL = "https://api.bypass.vip/premium/bypass";

const FETCH_TIMEOUT_MS = 12000;

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      }
    );
  });
}

/**
 * Try to resolve a shortener by issuing HEAD and reading Location header(s),
 * following redirects until we leave the shortener's eTLD or hit a non-3xx.
 */
export async function resolveByHead(inputUrl, { maxHops = 6 } = {}) {
  const startEntry = lookupDomain(inputUrl);
  if (!startEntry) {
    return { ok: false, source: "head", error: "not-a-known-shortener" };
  }

  let current = inputUrl;
  let lastEntry = startEntry;
  for (let i = 0; i < maxHops; i++) {
    let res;
    try {
      res = await withTimeout(
        fetch(current, {
          method: "HEAD",
          redirect: "manual",
          credentials: "omit",
        }),
        FETCH_TIMEOUT_MS
      );
    } catch (e) {
      // HEAD may be rejected. Retry with GET.
      try {
        res = await withTimeout(
          fetch(current, {
            method: "GET",
            redirect: "manual",
            credentials: "omit",
          }),
          FETCH_TIMEOUT_MS
        );
      } catch (e2) {
        return { ok: false, source: "head", error: String(e2 && e2.message || e2) };
      }
    }

    const location = res.headers.get("location");
    if (!location) {
      // Some shorteners return 200 with a meta-refresh on GET. Skip — we can't
      // easily parse without a DOM in the service worker.
      if (current !== inputUrl) {
        return { ok: true, url: current, source: "head" };
      }
      return { ok: false, source: "head", error: `no-location (${res.status})`, status: res.status };
    }

    let nextUrl;
    try {
      nextUrl = new URL(location, current).href;
    } catch {
      return { ok: false, source: "head", error: "bad-location" };
    }

    const nextEntry = lookupDomain(nextUrl);
    if (!nextEntry) {
      // Left the shortener — we have the final destination.
      return { ok: true, url: nextUrl, source: "head" };
    }
    // Still in shortener land. If we hopped onto an ad-link domain, hand off.
    if (nextEntry.strategy !== "redirect") {
      return {
        ok: false,
        source: "head",
        error: "hops-to-ad-link",
        url: nextUrl,
        nextStrategy: nextEntry.strategy,
      };
    }
    current = nextUrl;
    lastEntry = nextEntry;
  }
  return { ok: false, source: "head", error: "too-many-hops" };
}

/**
 * Query the FastForward Crowd-Bypass server.
 * Docs: https://fastforwardteam.github.io/serverdocs/
 *   POST application/x-www-form-urlencoded
 *   body: domain=<host>&path=<path-with-no-leading-slash>
 *   200 text/plain  -> destination domain (sometimes path)
 *   204 empty       -> not in db
 *   201             -> "go through the site and verify"
 */
export async function resolveByCrowd(inputUrl) {
  let u;
  try {
    u = new URL(inputUrl);
  } catch {
    return { ok: false, source: "crowd", error: "bad-url" };
  }
  const domain = u.hostname.replace(/^www\./, "");
  const path = (u.pathname + u.search).replace(/^\//, "");

  const body = new URLSearchParams({ domain, path }).toString();
  let res;
  try {
    res = await withTimeout(
      fetch(CROWD_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        credentials: "omit",
      }),
      FETCH_TIMEOUT_MS
    );
  } catch (e) {
    return { ok: false, source: "crowd", error: String(e && e.message || e) };
  }

  if (res.status === 204) {
    return { ok: false, source: "crowd", error: "not-in-db", status: 204 };
  }
  if (res.status === 201) {
    return { ok: false, source: "crowd", error: "verify-required", status: 201 };
  }
  if (!res.ok) {
    return { ok: false, source: "crowd", error: `http-${res.status}`, status: res.status };
  }
  const text = (await res.text()).trim();
  if (!text) {
    return { ok: false, source: "crowd", error: "empty-response" };
  }
  // The crowd API often returns just a host (e.g. "asitenotrelatedtopiracy.example").
  // Synthesise a full URL with https.
  let outUrl = text;
  if (!/^https?:\/\//i.test(outUrl)) {
    outUrl = "https://" + outUrl;
  }
  return { ok: true, url: outUrl, source: "crowd" };
}

/**
 * Contribute a verified destination back to the Crowd-Bypass database.
 * Best-effort; failures are swallowed.
 */
export async function contributeToCrowd(originalUrl, destinationUrl) {
  try {
    const u = new URL(originalUrl);
    const domain = u.hostname.replace(/^www\./, "");
    const path = (u.pathname + u.search).replace(/^\//, "");
    let target;
    try {
      target = new URL(destinationUrl).hostname;
    } catch {
      target = destinationUrl;
    }
    const body = new URLSearchParams({ domain, path, target }).toString();
    await withTimeout(
      fetch(CROWD_CONTRIBUTE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        credentials: "omit",
      }),
      FETCH_TIMEOUT_MS
    );
  } catch {
    // ignore
  }
}

/**
 * Call bypass.vip. If `apiKey` is supplied we hit the premium endpoint;
 * otherwise we hit the free endpoint (which currently returns a placeholder
 * "API shut down" message for most links — we treat that as a failure).
 */
export async function resolveByBypassVip(inputUrl, { apiKey } = {}) {
  const isPremium = !!apiKey;
  const url = isPremium ? BYPASS_VIP_PREMIUM_URL : BYPASS_VIP_URL;
  const fullUrl = `${url}?url=${encodeURIComponent(inputUrl)}`;
  let res;
  try {
    res = await withTimeout(
      fetch(fullUrl, {
        method: "GET",
        headers: isPremium ? { Authorization: `Bearer ${apiKey}` } : undefined,
        credentials: "omit",
      }),
      FETCH_TIMEOUT_MS
    );
  } catch (e) {
    return { ok: false, source: "bypass.vip", error: String(e && e.message || e) };
  }
  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, source: "bypass.vip", error: `http-${res.status}`, status: res.status };
  }
  if (data && data.status === "success" && typeof data.result === "string") {
    // The free API stub returns "FREE API SHUT DOWN ...". Treat any result
    // that isn't a real URL as a failure.
    if (!/^https?:\/\//i.test(data.result)) {
      return { ok: false, source: "bypass.vip", error: "free-api-disabled" };
    }
    return { ok: true, url: data.result, source: isPremium ? "bypass.vip (premium)" : "bypass.vip" };
  }
  return { ok: false, source: "bypass.vip", error: (data && data.message) || `http-${res.status}` };
}

/**
 * Top-level resolver. Chooses strategy based on the registry entry, then falls
 * back through the other strategies. Caller is responsible for caching.
 */
export async function resolveLink(inputUrl, { bypassVipKey } = {}) {
  const entry = lookupDomain(inputUrl);
  if (!entry) {
    return { ok: false, source: "none", error: "unsupported-domain" };
  }

  const attempts = [];

  if (entry.strategy === "redirect") {
    const head = await resolveByHead(inputUrl);
    attempts.push(head);
    if (head.ok) return { ...head, attempts };
    // If HEAD told us we hopped into ad-link land, try crowd on that URL.
    if (head.error === "hops-to-ad-link" && head.url) {
      const crowd = await resolveByCrowd(head.url);
      attempts.push(crowd);
      if (crowd.ok) return { ...crowd, attempts };
      if (bypassVipKey) {
        const vip = await resolveByBypassVip(head.url, { apiKey: bypassVipKey });
        attempts.push(vip);
        if (vip.ok) return { ...vip, attempts };
      }
    }
  } else {
    // crowd / api
    const crowd = await resolveByCrowd(inputUrl);
    attempts.push(crowd);
    if (crowd.ok) return { ...crowd, attempts };

    if (bypassVipKey) {
      const vip = await resolveByBypassVip(inputUrl, { apiKey: bypassVipKey });
      attempts.push(vip);
      if (vip.ok) return { ...vip, attempts };
    } else {
      // Even without a key, try the free endpoint once in case the user
      // wants to see whether it's been revived.
      const vipFree = await resolveByBypassVip(inputUrl);
      attempts.push(vipFree);
      if (vipFree.ok) return { ...vipFree, attempts };
    }
  }

  const last = attempts[attempts.length - 1];
  return {
    ok: false,
    source: last ? last.source : "none",
    error: last ? last.error : "all-strategies-failed",
    attempts,
  };
}
