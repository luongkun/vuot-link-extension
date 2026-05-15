// Registry of supported short-link / ad-link domains and which strategy to use.
//
// Strategy values:
//   "redirect": Plain redirect-based shortener. We follow it with fetch HEAD/GET
//               (redirect: 'manual') and pull the Location header.
//   "crowd":    Ad-link / interstitial site. We query the FastForward Crowd-Bypass
//               server. Falls back to bypass.vip if a premium key is configured.
//   "api":      Site that is unlikely to be in Crowd-Bypass but is supported by
//               bypass.vip premium. We try Crowd-Bypass first then bypass.vip.
//
// "match" is the eTLD+1 (registrable domain) we match against. We also match
// any subdomain of that registrable domain.

export const DOMAIN_REGISTRY = [
  // ---- Pure shorteners (HEAD redirect works) ----
  { match: "bit.ly", strategy: "redirect", label: "Bitly" },
  { match: "j.mp", strategy: "redirect", label: "Bitly (j.mp)" },
  { match: "amzn.to", strategy: "redirect", label: "Amazon" },
  { match: "t.co", strategy: "redirect", label: "Twitter / X" },
  { match: "x.co", strategy: "redirect", label: "GoDaddy" },
  { match: "tinyurl.com", strategy: "redirect", label: "TinyURL" },
  { match: "goo.gl", strategy: "redirect", label: "Google (legacy)" },
  { match: "g.co", strategy: "redirect", label: "Google" },
  { match: "is.gd", strategy: "redirect", label: "is.gd" },
  { match: "v.gd", strategy: "redirect", label: "v.gd" },
  { match: "ow.ly", strategy: "redirect", label: "Hootsuite" },
  { match: "buff.ly", strategy: "redirect", label: "Buffer" },
  { match: "dlvr.it", strategy: "redirect", label: "dlvr.it" },
  { match: "ift.tt", strategy: "redirect", label: "IFTTT" },
  { match: "lnkd.in", strategy: "redirect", label: "LinkedIn" },
  { match: "fb.me", strategy: "redirect", label: "Facebook" },
  { match: "youtu.be", strategy: "redirect", label: "YouTube" },
  { match: "wp.me", strategy: "redirect", label: "WordPress" },
  { match: "rebrand.ly", strategy: "redirect", label: "Rebrandly" },
  { match: "tiny.cc", strategy: "redirect", label: "tiny.cc" },
  { match: "shorter.me", strategy: "redirect", label: "Shorter.me" },
  { match: "t.ly", strategy: "redirect", label: "T.LY" },
  { match: "cl.gy", strategy: "redirect", label: "cl.gy" },
  { match: "shorturl.at", strategy: "redirect", label: "ShortURL.at" },
  { match: "cutt.ly", strategy: "redirect", label: "Cutt.ly" },

  // ---- Ad-link / interstitial sites (Crowd-Bypass or bypass.vip) ----
  { match: "linkvertise.com", strategy: "crowd", label: "Linkvertise" },
  { match: "link-to.net", strategy: "crowd", label: "Linkvertise (link-to.net)" },
  { match: "linkvertise.net", strategy: "crowd", label: "Linkvertise (.net)" },
  { match: "work.ink", strategy: "crowd", label: "Work.ink" },
  { match: "adfoc.us", strategy: "crowd", label: "AdFocus" },
  { match: "adf.ly", strategy: "crowd", label: "Adf.ly" },
  { match: "ouo.io", strategy: "crowd", label: "ouo.io" },
  { match: "ouo.press", strategy: "crowd", label: "ouo.press" },
  { match: "shorte.st", strategy: "crowd", label: "Shorte.st" },
  { match: "sh.st", strategy: "crowd", label: "Sh.st" },
  { match: "link1s.com", strategy: "crowd", label: "link1s" },
  { match: "link1s.net", strategy: "crowd", label: "link1s.net" },
  { match: "link4m.com", strategy: "crowd", label: "link4m" },
  { match: "link4m.net", strategy: "crowd", label: "link4m.net" },
  { match: "yeumoney.com", strategy: "crowd", label: "Yeumoney" },
  { match: "yeumoney.net", strategy: "crowd", label: "Yeumoney.net" },
  { match: "kiemtienol.com", strategy: "crowd", label: "KiemTienOL" },
  { match: "kiemtienmod.net", strategy: "crowd", label: "KiemTienMod" },
  { match: "kiemtien.gg", strategy: "crowd", label: "Kiemtien.gg" },
  { match: "kiemtienbank.com", strategy: "crowd", label: "KiemTienBank" },
  { match: "megaurl.in", strategy: "crowd", label: "MegaURL" },
  { match: "exe.io", strategy: "crowd", label: "Exe.io" },
  { match: "exey.io", strategy: "crowd", label: "Exey.io" },
  { match: "exee.io", strategy: "crowd", label: "Exee.io" },
  { match: "exee.app", strategy: "crowd", label: "Exee.app" },
  { match: "owolinks.com", strategy: "crowd", label: "Owolinks" },
  { match: "droplink.co", strategy: "crowd", label: "Droplink" },
  { match: "boost.ink", strategy: "crowd", label: "Boost.ink" },
  { match: "cuty.io", strategy: "crowd", label: "Cuty.io" },
  { match: "cety.io", strategy: "crowd", label: "Cety.io" },
  { match: "social-unlock.com", strategy: "crowd", label: "social-unlock" },
  { match: "sub2unlock.com", strategy: "crowd", label: "sub2unlock" },
  { match: "sub2unlock.net", strategy: "crowd", label: "sub2unlock.net" },
  { match: "sub4unlock.io", strategy: "crowd", label: "sub4unlock" },
  { match: "rekonise.com", strategy: "crowd", label: "Rekonise" },
  { match: "mboost.me", strategy: "crowd", label: "mboost" },
  { match: "loot-link.com", strategy: "crowd", label: "LootLinks" },
  { match: "lootlabs.gg", strategy: "crowd", label: "LootLabs" },
  { match: "lootdest.com", strategy: "crowd", label: "LootDest" },
  { match: "lootdest.org", strategy: "crowd", label: "LootDest" },
  { match: "lootdest.info", strategy: "crowd", label: "LootDest" },
  { match: "paster.so", strategy: "crowd", label: "Paster.so" },
  { match: "paster.gg", strategy: "crowd", label: "Paster.gg" },
];

const REGISTRY_BY_MATCH = new Map(
  DOMAIN_REGISTRY.map((entry) => [entry.match, entry])
);

/**
 * Strip leading "www." from a hostname.
 */
export function normalizeHost(hostname) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

/**
 * Return the registry entry for a URL, or null if not supported.
 * Matches both the exact host and any subdomain (e.g. www.linkvertise.com → linkvertise.com).
 */
export function lookupDomain(urlOrHost) {
  let host;
  try {
    host = typeof urlOrHost === "string" && urlOrHost.includes("://")
      ? new URL(urlOrHost).hostname
      : String(urlOrHost);
  } catch {
    return null;
  }
  host = normalizeHost(host);
  if (REGISTRY_BY_MATCH.has(host)) return REGISTRY_BY_MATCH.get(host);
  // Try suffix match (sub.example.com → example.com).
  for (const entry of DOMAIN_REGISTRY) {
    if (host.endsWith("." + entry.match)) return entry;
  }
  return null;
}

/**
 * Return a deduped, sorted list of supported domain labels grouped by strategy.
 * Used by the popup / options page.
 */
export function listSupported() {
  const groups = { redirect: [], crowd: [], api: [] };
  for (const entry of DOMAIN_REGISTRY) {
    (groups[entry.strategy] ||= []).push(entry);
  }
  for (const g of Object.values(groups)) {
    g.sort((a, b) => a.label.localeCompare(b.label));
  }
  return groups;
}
