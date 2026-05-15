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
  // Mainstream
  { match: "bit.ly", strategy: "redirect", label: "Bitly" },
  { match: "bit.do", strategy: "redirect", label: "Bit.do" },
  { match: "j.mp", strategy: "redirect", label: "Bitly (j.mp)" },
  { match: "amzn.to", strategy: "redirect", label: "Amazon" },
  { match: "a.co", strategy: "redirect", label: "Amazon (a.co)" },
  { match: "t.co", strategy: "redirect", label: "Twitter / X" },
  { match: "x.co", strategy: "redirect", label: "GoDaddy" },
  { match: "tinyurl.com", strategy: "redirect", label: "TinyURL" },
  { match: "goo.gl", strategy: "redirect", label: "Google (legacy)" },
  { match: "g.co", strategy: "redirect", label: "Google" },
  { match: "forms.gle", strategy: "redirect", label: "Google Forms" },
  { match: "maps.app.goo.gl", strategy: "redirect", label: "Google Maps" },
  { match: "is.gd", strategy: "redirect", label: "is.gd" },
  { match: "v.gd", strategy: "redirect", label: "v.gd" },
  { match: "ow.ly", strategy: "redirect", label: "Hootsuite" },
  { match: "buff.ly", strategy: "redirect", label: "Buffer" },
  { match: "dlvr.it", strategy: "redirect", label: "dlvr.it" },
  { match: "ift.tt", strategy: "redirect", label: "IFTTT" },
  { match: "lnkd.in", strategy: "redirect", label: "LinkedIn" },
  { match: "fb.me", strategy: "redirect", label: "Facebook" },
  { match: "l.facebook.com", strategy: "redirect", label: "Facebook (l.facebook.com)" },
  { match: "lm.facebook.com", strategy: "redirect", label: "Facebook (lm.facebook.com)" },
  { match: "l.instagram.com", strategy: "redirect", label: "Instagram redirect" },
  { match: "l.messenger.com", strategy: "redirect", label: "Messenger redirect" },
  { match: "away.vk.com", strategy: "redirect", label: "VK redirect" },
  { match: "youtu.be", strategy: "redirect", label: "YouTube" },
  { match: "wp.me", strategy: "redirect", label: "WordPress" },
  { match: "rebrand.ly", strategy: "redirect", label: "Rebrandly" },
  { match: "tiny.cc", strategy: "redirect", label: "tiny.cc" },
  { match: "shorter.me", strategy: "redirect", label: "Shorter.me" },
  { match: "t.ly", strategy: "redirect", label: "T.LY" },
  { match: "cl.gy", strategy: "redirect", label: "cl.gy" },
  { match: "shorturl.at", strategy: "redirect", label: "ShortURL.at" },
  { match: "shorturl.gg", strategy: "redirect", label: "ShortURL.gg" },
  { match: "cutt.ly", strategy: "redirect", label: "Cutt.ly" },
  { match: "spoti.fi", strategy: "redirect", label: "Spotify" },
  { match: "apple.co", strategy: "redirect", label: "Apple" },
  { match: "po.st", strategy: "redirect", label: "po.st" },
  { match: "bl.ink", strategy: "redirect", label: "Bl.ink" },
  { match: "soo.gd", strategy: "redirect", label: "soo.gd" },
  { match: "u.to", strategy: "redirect", label: "u.to" },
  { match: "chilp.it", strategy: "redirect", label: "Chilp.it" },
  { match: "mcaf.ee", strategy: "redirect", label: "McAfee" },
  { match: "snip.ly", strategy: "redirect", label: "Sniply" },
  { match: "snipfeed.co", strategy: "redirect", label: "Snipfeed" },
  { match: "s.id", strategy: "redirect", label: "s.id" },
  { match: "short.gy", strategy: "redirect", label: "Short.gy" },
  { match: "dub.sh", strategy: "redirect", label: "Dub" },
  { match: "href.li", strategy: "redirect", label: "href.li" },
  { match: "tr.ee", strategy: "redirect", label: "Linktree (tr.ee)" },
  { match: "vt.tiktok.com", strategy: "redirect", label: "TikTok (vt)" },
  { match: "vm.tiktok.com", strategy: "redirect", label: "TikTok (vm)" },

  // ---- Ad-link / interstitial sites (Crowd-Bypass or bypass.vip) ----
  // Linkvertise family
  { match: "linkvertise.com", strategy: "crowd", label: "Linkvertise" },
  { match: "link-to.net", strategy: "crowd", label: "Linkvertise (link-to.net)" },
  { match: "linkvertise.net", strategy: "crowd", label: "Linkvertise (.net)" },
  { match: "linkvertise.download", strategy: "crowd", label: "Linkvertise (.download)" },

  // Work.ink / captcha-gated unlock
  { match: "work.ink", strategy: "crowd", label: "Work.ink" },

  // Classic ad-shorteners
  { match: "adfoc.us", strategy: "crowd", label: "AdFocus" },
  { match: "adf.ly", strategy: "crowd", label: "Adf.ly" },
  { match: "ay.gy", strategy: "crowd", label: "Adf.ly (ay.gy)" },
  { match: "q.gs", strategy: "crowd", label: "Adf.ly (q.gs)" },
  { match: "j.gs", strategy: "crowd", label: "Adf.ly (j.gs)" },
  { match: "ouo.io", strategy: "crowd", label: "ouo.io" },
  { match: "ouo.press", strategy: "crowd", label: "ouo.press" },
  { match: "ouo.lu", strategy: "crowd", label: "ouo.lu" },
  { match: "ouo.click", strategy: "crowd", label: "ouo.click" },
  { match: "shorte.st", strategy: "crowd", label: "Shorte.st" },
  { match: "sh.st", strategy: "crowd", label: "Sh.st" },
  { match: "fc.lc", strategy: "crowd", label: "fc.lc" },
  { match: "atglinks.com", strategy: "crowd", label: "AtgLinks" },
  { match: "adshnk.com", strategy: "crowd", label: "AdShrink" },
  { match: "adshrink.it", strategy: "crowd", label: "AdShrink.it" },
  { match: "atominik.com", strategy: "crowd", label: "Atominik" },
  { match: "shrtfly.com", strategy: "crowd", label: "ShrtFly" },
  { match: "shrtco.de", strategy: "crowd", label: "Shrtco.de" },
  { match: "shrinke.me", strategy: "crowd", label: "Shrinke.me" },
  { match: "shrinkearn.com", strategy: "crowd", label: "ShrinkEarn" },
  { match: "shrinkforearn.in", strategy: "crowd", label: "ShrinkForEarn" },
  { match: "cutwin.com", strategy: "crowd", label: "CutWin" },
  { match: "cutpaid.com", strategy: "crowd", label: "CutPaid" },
  { match: "bc.vc", strategy: "crowd", label: "Bc.vc" },
  { match: "mitly.us", strategy: "crowd", label: "Mitly.us" },
  { match: "1ink.cc", strategy: "crowd", label: "1ink.cc" },
  { match: "direct-link.net", strategy: "crowd", label: "Direct-Link" },
  { match: "linkpoi.me", strategy: "crowd", label: "LinkPoi" },
  { match: "linkrex.net", strategy: "crowd", label: "LinkRex" },
  { match: "linkpays.in", strategy: "crowd", label: "LinkPays" },
  { match: "linkfly.click", strategy: "crowd", label: "LinkFly" },
  { match: "earnow.online", strategy: "crowd", label: "EarNow" },
  { match: "payskip.org", strategy: "crowd", label: "PaySkip" },
  { match: "short-jambo.com", strategy: "crowd", label: "Short-Jambo" },
  { match: "xpshort.com", strategy: "crowd", label: "XPShort" },

  // Indian / South-East Asian shorteners (Crowd-Bypass coverage is good here)
  { match: "gplinks.in", strategy: "crowd", label: "GPLinks" },
  { match: "gplinks.co", strategy: "crowd", label: "GPLinks.co" },
  { match: "gpl.li", strategy: "crowd", label: "GPLinks (gpl.li)" },
  { match: "droplink.co", strategy: "crowd", label: "Droplink" },
  { match: "adrinolinks.com", strategy: "crowd", label: "AdrinoLinks" },
  { match: "adrinolinks.in", strategy: "crowd", label: "AdrinoLinks" },
  { match: "earn4link.in", strategy: "crowd", label: "Earn4Link" },
  { match: "easysky.in", strategy: "crowd", label: "EasySky" },
  { match: "veganab.co", strategy: "crowd", label: "Veganab" },
  { match: "shrtflys.com", strategy: "crowd", label: "ShrtFlys" },
  { match: "ezylinks.com", strategy: "crowd", label: "EzyLinks" },

  // za / zee (adfly clones)
  { match: "za.gl", strategy: "crowd", label: "Za.gl" },
  { match: "za.uy", strategy: "crowd", label: "Za.uy" },
  { match: "zee.gl", strategy: "crowd", label: "Zee.gl" },

  // Shink family
  { match: "shink.in", strategy: "crowd", label: "Shink.in" },
  { match: "shink.me", strategy: "crowd", label: "Shink.me" },

  // Vietnamese ad-link
  { match: "link1s.com", strategy: "crowd", label: "link1s" },
  { match: "link1s.net", strategy: "crowd", label: "link1s.net" },
  { match: "link1s.app", strategy: "crowd", label: "link1s.app" },
  { match: "link4m.com", strategy: "crowd", label: "link4m" },
  { match: "link4m.net", strategy: "crowd", label: "link4m.net" },
  { match: "yeumoney.com", strategy: "crowd", label: "Yeumoney" },
  { match: "yeumoney.net", strategy: "crowd", label: "Yeumoney.net" },
  { match: "1link.vn", strategy: "crowd", label: "1Link.vn" },
  { match: "kiemtienol.com", strategy: "crowd", label: "KiemTienOL" },
  { match: "kiemtienmod.net", strategy: "crowd", label: "KiemTienMod" },
  { match: "kiemtien.gg", strategy: "crowd", label: "Kiemtien.gg" },
  { match: "kiemtienbank.com", strategy: "crowd", label: "KiemTienBank" },
  { match: "megaurl.in", strategy: "crowd", label: "MegaURL" },
  { match: "megaurl.link", strategy: "crowd", label: "MegaURL.link" },

  // Exe family
  { match: "exe.io", strategy: "crowd", label: "Exe.io" },
  { match: "exey.io", strategy: "crowd", label: "Exey.io" },
  { match: "exee.io", strategy: "crowd", label: "Exee.io" },
  { match: "exee.app", strategy: "crowd", label: "Exee.app" },

  // Cuty / Cety family
  { match: "cuty.io", strategy: "crowd", label: "Cuty.io" },
  { match: "cety.io", strategy: "crowd", label: "Cety.io" },

  // OWO / similar
  { match: "owolinks.com", strategy: "crowd", label: "Owolinks" },

  // Boost / unlock-to-continue
  { match: "boost.ink", strategy: "crowd", label: "Boost.ink" },
  { match: "boost.gg", strategy: "crowd", label: "Boost.gg" },
  { match: "letsboost.net", strategy: "crowd", label: "LetsBoost" },
  { match: "social-unlock.com", strategy: "crowd", label: "Social-Unlock" },
  { match: "sub2unlock.com", strategy: "crowd", label: "Sub2Unlock" },
  { match: "sub2unlock.net", strategy: "crowd", label: "Sub2Unlock.net" },
  { match: "sub2unlock.io", strategy: "crowd", label: "Sub2Unlock.io" },
  { match: "sub4unlock.io", strategy: "crowd", label: "Sub4Unlock" },
  { match: "sub4unlock.com", strategy: "crowd", label: "Sub4Unlock.com" },
  { match: "subscribetounlock.com", strategy: "crowd", label: "Subscribe2Unlock" },
  { match: "subscribetounlock.net", strategy: "crowd", label: "Subscribe2Unlock.net" },
  { match: "rekonise.com", strategy: "crowd", label: "Rekonise" },
  { match: "mboost.me", strategy: "crowd", label: "mBoost" },

  // Loot family (gaming script unlockers)
  { match: "loot-link.com", strategy: "crowd", label: "LootLinks" },
  { match: "loot-links.com", strategy: "crowd", label: "LootLinks" },
  { match: "lootlink.org", strategy: "crowd", label: "LootLink.org" },
  { match: "lootlabs.gg", strategy: "crowd", label: "LootLabs" },
  { match: "lootdest.com", strategy: "crowd", label: "LootDest" },
  { match: "lootdest.org", strategy: "crowd", label: "LootDest" },
  { match: "lootdest.info", strategy: "crowd", label: "LootDest" },
  { match: "linkvertise.lol", strategy: "crowd", label: "Linkvertise (rip)" },

  // Paster
  { match: "paster.so", strategy: "crowd", label: "Paster.so" },
  { match: "paster.gg", strategy: "crowd", label: "Paster.gg" },

  // SafeLink (Indonesian-style ad-link wrappers)
  { match: "safelinking.net", strategy: "crowd", label: "SafeLinking" },
  { match: "safelinking.com", strategy: "crowd", label: "SafeLinking.com" },
  { match: "safelinku.net", strategy: "crowd", label: "SafeLinkU" },
  { match: "safelink.id", strategy: "crowd", label: "SafeLink.id" },

  // Misc shortener-with-ads
  { match: "urluss.com", strategy: "crowd", label: "Urluss" },
  { match: "urlcero.com", strategy: "crowd", label: "UrlCero" },
  { match: "atajurl.com", strategy: "crowd", label: "AtajURL" },
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
