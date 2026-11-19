import { createRequire as __cr } from 'node:module';
const require = __cr(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server/security.cjs
var require_security = __commonJS({
  "server/security.cjs"(exports, module) {
    var SECURITY_HEADERS2 = {
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(self), geolocation=(), payment=()",
      "Content-Security-Policy": "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'"
    };
    var HttpError2 = class extends Error {
      constructor(status, message) {
        super(message);
        this.status = status;
      }
    };
    function positiveInteger2(value, max = 1e9) {
      return /^\d{1,10}$/.test(String(value)) && Number(value) > 0 && Number(value) <= max;
    }
    function validateStreams({ id, type = "movie", season = 1, episode = 1, lang }) {
      if (!positiveInteger2(id) || !["movie", "tv"].includes(type) || !positiveInteger2(season, 1e4) || !positiveInteger2(episode, 1e4) || lang !== void 0 && !["vf", "vost", "vostfr", "all"].includes(String(lang).toLowerCase())) {
        throw new HttpError2(400, "Param\xE8tres de lecture invalides.");
      }
    }
    function arteLimit2(value = 20) {
      if (!positiveInteger2(value, 100)) throw new HttpError2(400, "La limite doit \xEAtre comprise entre 1 et 100.");
      return Number(value);
    }
    var TMDB_PATH = /^(?:trending\/(?:all|movie|tv|person)\/(?:day|week)|(?:movie|tv)\/(?:popular|top_rated|now_playing|upcoming|airing_today|on_the_air)|(?:movie|tv|person)\/\d+(?:\/(?:videos|recommendations|similar|credits|images|external_ids|combined_credits|movie_credits|tv_credits))?|tv\/\d+\/season\/\d+(?:\/episode\/\d+)?(?:\/external_ids)?|search\/(?:multi|movie|tv|person)|discover\/(?:movie|tv)|genre\/(?:movie|tv)\/list)$/;
    var QUERY_KEYS = /* @__PURE__ */ new Set(["language", "page", "query", "include_adult", "include_video", "include_image_language", "include_video_language", "append_to_response", "region", "sort_by", "timezone", "include_null_first_air_dates", "certification_country", "certification.lte", "with_genres", "without_genres", "with_keywords", "with_original_language", "with_origin_country", "with_watch_providers", "watch_region", "with_watch_monetization_types", "year", "primary_release_year", "first_air_date_year", "with_networks", "with_status", "with_type", "with_people"]);
    function tmdbUrl2(path, params, key) {
      if (!TMDB_PATH.test(path) || path.length > 180) throw new HttpError2(400, "Chemin TMDB non autoris\xE9.");
      if (!key) throw new HttpError2(503, "Le service catalogue doit \xEAtre configur\xE9.");
      const url = new URL(`https://api.themoviedb.org/3/${path}`);
      for (const [name, raw] of new URLSearchParams(params)) {
        if (name === "api_key") continue;
        const value = String(raw);
        if (!(QUERY_KEYS.has(name) || /^(?:primary_release_date|release_date|first_air_date|air_date|vote_count|vote_average|with_runtime)\.(?:gte|lte)$/.test(name)) || value.length > 500) {
          throw new HttpError2(400, "Param\xE8tre TMDB non autoris\xE9.");
        }
        if (name === "page" && !positiveInteger2(value, 500)) throw new HttpError2(400, "Page invalide.");
        url.searchParams.set(name, value);
      }
      if (url.search.length > 3500) throw new HttpError2(400, "Requ\xEAte trop longue.");
      if (!url.searchParams.has("language")) url.searchParams.set("language", "fr-FR");
      url.searchParams.set("api_key", key);
      url.searchParams.sort();
      return url;
    }
    var BoundedCache2 = class {
      constructor(max = 250) {
        this.max = max;
        this.entries = /* @__PURE__ */ new Map();
      }
      get(key) {
        const entry = this.entries.get(key);
        if (!entry) return null;
        if (entry.expires <= Date.now()) {
          this.entries.delete(key);
          return null;
        }
        return entry.value;
      }
      set(key, value, ttl = 6e5) {
        this.entries.delete(key);
        while (this.entries.size >= this.max) this.entries.delete(this.entries.keys().next().value);
        this.entries.set(key, { value, expires: Date.now() + ttl });
      }
    };
    async function fetchJson2(url, options = {}) {
      try {
        const response = await fetch(url, { ...options, signal: AbortSignal.timeout(12e3), redirect: "error" });
        if (!response.ok) throw new HttpError2(response.status === 404 ? 404 : 502, "Le service externe est indisponible.");
        return await response.json();
      } catch (error) {
        if (error instanceof HttpError2) throw error;
        throw new HttpError2(502, "Le service externe est indisponible.");
      }
    }
    function createRateLimiter(max = 120, windowMs = 6e4) {
      const clients = /* @__PURE__ */ new Map();
      let lastSweep = Date.now();
      return (key) => {
        const now = Date.now();
        if (now - lastSweep >= windowMs || clients.size >= 5e3) {
          for (const [id, entry2] of clients) if (entry2.reset <= now) clients.delete(id);
          lastSweep = now;
        }
        let entry = clients.get(key);
        if (!entry || entry.reset <= now) {
          if (!entry && clients.size >= 1e4) return false;
          entry = { count: 0, reset: now + windowMs };
          clients.set(key, entry);
        }
        return ++entry.count <= max;
      };
    }
    var DOCUMENTARY_CATEGORIES2 = [
      { id: "all", name: "Tous les Documentaires", icon: "\u{1F3AC}" },
      { id: "nature", name: "Nature & Environnement", icon: "\u{1F33F}" },
      { id: "history", name: "Histoire & Civilisations", icon: "\u{1F4DC}" },
      { id: "science", name: "Science & Espace", icon: "\u{1F680}" },
      { id: "truecrime", name: "Crime & Enqu\xEAtes (True Crime)", icon: "\u{1F50D}" },
      { id: "society", name: "Soci\xE9t\xE9 & G\xE9opolitique", icon: "\u{1F30D}" },
      { id: "music", name: "Musique & Art", icon: "\u{1F3A8}" },
      { id: "sports", name: "Sport & Aventure Extr\xEAme", icon: "\u26BD" }
    ];
    var ALLOWED_SUBTITLE_HOSTS = [
      "dl.opensubtitles.org",
      "rest.opensubtitles.org",
      "opensubtitles.org",
      "opensubtitles-v3.strem.io",
      "subs5.strem.io",
      "strem.io"
    ];
    function normalizeAllowedSubtitleUrl2(urlStr) {
      if (typeof urlStr !== "string" || !urlStr || /[\x00-\x1f\x7f]/.test(urlStr)) return null;
      try {
        const u = new URL(urlStr);
        if (u.protocol !== "https:" || u.username || u.password || u.port && u.port !== "443") return null;
        const host = u.hostname.toLowerCase();
        return ALLOWED_SUBTITLE_HOSTS.some((h) => host === h || host.endsWith("." + h)) ? u.href : null;
      } catch {
        return null;
      }
    }
    function isAllowedSubtitleUrl(urlStr) {
      return normalizeAllowedSubtitleUrl2(urlStr) !== null;
    }
    async function readBoundedBuffer2(response, maxBytes = 2 * 1024 * 1024) {
      const lenHeader = Number(response.headers?.get?.("content-length") || 0);
      if (lenHeader > maxBytes) throw new HttpError2(413, "Fichier sous-titre trop volumineux.");
      if (!response.body || typeof response.body.getReader !== "function") {
        const buf = Buffer.from(await response.arrayBuffer());
        if (buf.length > maxBytes) throw new HttpError2(413, "Fichier sous-titre trop volumineux.");
        return buf;
      }
      const reader = response.body.getReader();
      const chunks = [];
      let total = 0;
      try {
        for (; ; ) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > maxBytes) {
            try {
              await reader.cancel();
            } catch {
            }
            throw new HttpError2(413, "Fichier sous-titre trop volumineux.");
          }
          chunks.push(Buffer.from(value));
        }
      } finally {
        try {
          reader.releaseLock();
        } catch {
        }
      }
      return Buffer.concat(chunks, total);
    }
    var SUBTITLE_AD_PATTERN = /(?:opensubtitles|osdb\.link|subtitles\.org|tryray\.app|appuyez sur lecture|une seule app|plus de 200 langues|watch online movies|devenez membre vip|become vip|advertise your product|support us and|sous-titres\.eu|addic7ed|subscene|yifysubtitles|podnapisi|best watched using|sync(?:ed)?\s*(?:&|and)\s*correct|resync(?:ed)?\s*by|allsubs\.org|tvsubtitles|subdivx)/i;
    function decodeSubtitleBuffer2(buf) {
      if (!buf || !buf.length) return "";
      if (buf.length >= 2 && buf[0] === 255 && buf[1] === 254) {
        return new TextDecoder("utf-16le").decode(buf);
      }
      if (buf.length >= 2 && buf[0] === 254 && buf[1] === 255) {
        return new TextDecoder("utf-16be").decode(buf);
      }
      try {
        return new TextDecoder("utf-8", { fatal: true }).decode(buf);
      } catch {
        return new TextDecoder("windows-1252").decode(buf);
      }
    }
    function cleanSubtitleToVtt2(rawText) {
      let text = String(rawText || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
      text = text.replace(/\b(\d{1,2}):(\d{2}:\d{2})[,.](\d{3})\b/g, (_m, h, rest, ms) => `${h.padStart(2, "0")}:${rest}.${ms}`);
      const blocks = text.split(/\n[ \t]*\n+/);
      const kept = [];
      const timeRe = /^\d{2}:\d{2}(?::\d{2})?\.\d{3}\s*-->\s*\d{2}:\d{2}(?::\d{2})?\.\d{3}/;
      let hadTimestamp = false;
      for (const rawBlock of blocks) {
        const lines = rawBlock.split("\n").map((l) => l.trimEnd());
        const timeIdx = lines.findIndex((l) => timeRe.test(l.trim()));
        if (timeIdx === -1) continue;
        hadTimestamp = true;
        const payload = lines.slice(timeIdx + 1).filter((l) => l.trim().length > 0);
        if (payload.length === 0) continue;
        if (payload.some((l) => SUBTITLE_AD_PATTERN.test(l))) continue;
        kept.push(`${lines[timeIdx].trim()}
${payload.join("\n")}`);
      }
      if (kept.length === 0) {
        if (hadTimestamp) return "WEBVTT\n\n";
        const fallback = text.trim();
        return fallback.startsWith("WEBVTT") ? fallback : `WEBVTT

${fallback}`;
      }
      return `WEBVTT

${kept.join("\n\n")}`;
    }
    function buildSubtitleHint(s) {
      const raw = `${s.SubFileName || ""} ${s.MovieReleaseName || ""}`.toLowerCase();
      const parts = [];
      if (/\bextended\b/.test(raw)) parts.push("Extended");
      else if (/\bunrated\b/.test(raw)) parts.push("Unrated");
      else if (/\bdirector/.test(raw)) parts.push("Director");
      if (/\b(?:blu-?ray|bdrip|brrip)\b/.test(raw)) parts.push("BluRay");
      else if (/\bweb-?(?:dl|rip)\b/.test(raw)) parts.push("WEB");
      else if (/\bdvd(?:rip)?\b/.test(raw)) parts.push("DVDRip");
      const fpsNum = parseFloat(s.MovieFPS);
      if (Number.isFinite(fpsNum) && fpsNum >= 23 && fpsNum <= 30) {
        parts.push(Math.abs(fpsNum - 25) < 0.2 ? "25fps" : Math.abs(fpsNum - 23.976) < 0.2 ? "23.976" : `${fpsNum.toFixed(0)}fps`);
      }
      if (String(s.SubHearingImpaired) === "1") parts.push("SDH");
      return parts.slice(0, 2).join(" \xB7 ");
    }
    function rankOpenSubtitles2(osList, { filename = "", limit = 4 } = {}) {
      if (!Array.isArray(osList)) return [];
      const fnLower = String(filename || "").toLowerCase();
      const isSplitRe = /\b(?:cd|disc|disk|part)[\s._-]?[123]\b/i;
      const genericTokens = /* @__PURE__ */ new Set(["french", "truefrench", "vff", "vfq", "vostfr", "multi", "1080p", "720p", "2160p", "480p", "x264", "h264", "x265", "h265", "hevc", "xvid", "divx", "ac3", "eac3", "dts", "aac", "mp3", "mkv", "mp4", "avi", "srt", "bluray", "bdrip", "brrip", "dvdrip", "webrip", "webdl"]);
      const fnTokens = fnLower ? fnLower.replace(/[^a-z0-9]+/g, " ").split(" ").filter((t) => t.length >= 4 && !genericTokens.has(t)) : [];
      const fnExtended = /\bextended\b/.test(fnLower);
      const fnUnrated = /\bunrated\b/.test(fnLower);
      const fnDirector = /\bdirector/.test(fnLower);
      const fnDoubleEp = /\bs\d+e\d+(?:and|[-._]?e)\d+\b/i.test(fnLower);
      const fnIsDvdPal = /\b(?:dvdrip|pal|dvd)\b/.test(fnLower) && !/\b(?:bluray|bdrip|brrip|web-?dl|ntsc)\b/.test(fnLower);
      const fnIsHd24 = /\b(?:bluray|bdrip|brrip|web-?dl|webrip|1080p|2160p|4k)\b/.test(fnLower) && !/\b(?:dvdrip|pal)\b/.test(fnLower);
      const candidates = osList.filter((s) => {
        if (!s?.SubDownloadLink || !isAllowedSubtitleUrl(s.SubDownloadLink)) return false;
        const fmt = String(s.SubFormat || "srt").toLowerCase();
        if (fmt && fmt !== "srt" && fmt !== "vtt") return false;
        const nameStr = `${s.SubFileName || ""} ${s.MovieReleaseName || ""}`;
        if (isSplitRe.test(nameStr)) return false;
        return true;
      });
      const scored = candidates.map((s) => {
        const raw = `${s.SubFileName || ""} ${s.MovieReleaseName || ""}`.toLowerCase();
        let score = 0;
        const downloads = Math.max(0, parseInt(s.SubDownloadsCnt || "0", 10) || 0);
        score += Math.min(1500, Math.log10(downloads + 1) * 400);
        score += (parseFloat(s.SubRating) || 0) * 40;
        if (String(s.SubHearingImpaired) === "1") score -= 1200;
        if (fnLower) {
          const subExtended = /\bextended\b/.test(raw);
          const subUnrated = /\bunrated\b/.test(raw);
          const subDirector = /\bdirector/.test(raw);
          if (fnExtended && subExtended) score += 8e3;
          else if (fnExtended !== subExtended) score -= 6e3;
          if (fnUnrated && subUnrated) score += 6e3;
          else if (fnUnrated !== subUnrated) score -= 4500;
          if (fnDirector && subDirector) score += 6e3;
          else if (fnDirector !== subDirector) score -= 4500;
          const subDoubleEp = /\bs\d+e\d+(?:and|[-._]?e)\d+\b/i.test(raw);
          if (fnDoubleEp && subDoubleEp) score += 2e3;
          if (/\bdvd(?:rip)?\b/.test(fnLower) && /\bdvd(?:rip)?\b/.test(raw)) score += 2500;
          if (/\b(?:blu-?ray|bdrip|brrip)\b/.test(fnLower) && /\b(?:blu-?ray|bdrip|brrip)\b/.test(raw)) score += 2500;
          if (/\bweb-?(?:dl|rip)\b/.test(fnLower) && /\bweb-?(?:dl|rip)\b/.test(raw)) score += 2500;
          const fps = parseFloat(s.MovieFPS) || 0;
          if (fnIsDvdPal && Math.abs(fps - 25) < 0.25) score += 2600;
          if (fnIsDvdPal && Math.abs(fps - 23.976) < 0.25) score -= 1800;
          if (fnIsHd24 && (Math.abs(fps - 23.976) < 0.25 || Math.abs(fps - 24) < 0.25)) score += 2200;
          if (fnIsHd24 && Math.abs(fps - 25) < 0.25) score -= 1600;
          let tokenHits = 0;
          for (const tok of fnTokens) {
            if (raw.includes(tok)) tokenHits++;
          }
          score += Math.min(2500, tokenHits * 500);
        }
        return { item: s, score, hint: buildSubtitleHint(s) };
      });
      scored.sort((a, b) => b.score - a.score);
      const seen = /* @__PURE__ */ new Set();
      const out = [];
      for (const entry of scored) {
        if (seen.has(entry.item.SubDownloadLink)) continue;
        seen.add(entry.item.SubDownloadLink);
        out.push(entry);
        if (out.length >= limit) break;
      }
      return out;
    }
    module.exports = {
      SECURITY_HEADERS: SECURITY_HEADERS2,
      DOCUMENTARY_CATEGORIES: DOCUMENTARY_CATEGORIES2,
      HttpError: HttpError2,
      positiveInteger: positiveInteger2,
      validateStreams,
      arteLimit: arteLimit2,
      tmdbUrl: tmdbUrl2,
      BoundedCache: BoundedCache2,
      fetchJson: fetchJson2,
      createRateLimiter,
      normalizeAllowedSubtitleUrl: normalizeAllowedSubtitleUrl2,
      isAllowedSubtitleUrl,
      readBoundedBuffer: readBoundedBuffer2,
      decodeSubtitleBuffer: decodeSubtitleBuffer2,
      cleanSubtitleToVtt: cleanSubtitleToVtt2,
      rankOpenSubtitles: rankOpenSubtitles2
    };
  }
});

// server/stream-resolver.cjs
var require_stream_resolver = __commonJS({
  "server/stream-resolver.cjs"(exports, module) {
    var crypto = __require("crypto");
    var { HttpError: HttpError2, positiveInteger: positiveInteger2, tmdbUrl: tmdbUrl2, BoundedCache: BoundedCache2 } = require_security();
    var streamResolveCache = /* @__PURE__ */ new Map();
    var inFlightResolves = /* @__PURE__ */ new Map();
    var RESOLVE_CACHE_TTL_MS = 120 * 1e3;
    var torboxMylistCache = new BoundedCache2(100);
    var TORBOX_MYLIST_TTL_MS = 30 * 1e3;
    var ALLOWED_PROVIDERS = /* @__PURE__ */ new Set(["torbox", "realdebrid", "alldebrid", "debridlink", "premiumize"]);
    function sha256Short(str) {
      return crypto.createHash("sha256").update(String(str || "")).digest("hex").slice(0, 24);
    }
    function getCachedResolve(key) {
      const entry = streamResolveCache.get(key);
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) {
        streamResolveCache.delete(key);
        return null;
      }
      return entry.data;
    }
    function setCachedResolve(key, data) {
      if (streamResolveCache.size > 150) {
        const firstKey = streamResolveCache.keys().next().value;
        if (firstKey) streamResolveCache.delete(firstKey);
      }
      streamResolveCache.set(key, { data, expiresAt: Date.now() + RESOLVE_CACHE_TTL_MS });
    }
    var ALLOWED_POLL_HOSTS = [
      "torrentio.strem.fun",
      "api.torbox.app",
      "torbox.app",
      "tb-cdn.st",
      "b-cdn.net",
      "bunnycdn.com",
      "api.real-debrid.com",
      "real-debrid.com",
      "rdeb.io",
      "api.alldebrid.com",
      "alldebrid.com",
      "debrid.it",
      "debrid-link.com",
      "debrid-link.fr",
      "premiumize.me"
    ];
    function normalizeAllowedUrl2(urlStr) {
      if (typeof urlStr !== "string" || !urlStr || /[\x00-\x1f\x7f]/.test(urlStr)) return null;
      try {
        const u = new URL(urlStr);
        if (u.protocol === "http:" && (!u.port || u.port === "80")) {
          u.protocol = "https:";
        }
        if (u.protocol !== "https:" || u.username || u.password || u.port && u.port !== "443") return null;
        const host = u.hostname.toLowerCase();
        return ALLOWED_POLL_HOSTS.some((h) => host === h || host.endsWith("." + h)) ? u.href : null;
      } catch {
        return null;
      }
    }
    function isAllowedUrl(urlStr) {
      return normalizeAllowedUrl2(urlStr) !== null;
    }
    function extractTitleKeywords(title) {
      if (!title || typeof title !== "string") return [];
      const clean = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
      const STOPWORDS = /* @__PURE__ */ new Set([
        "le",
        "la",
        "les",
        "l",
        "un",
        "une",
        "des",
        "du",
        "de",
        "d",
        "the",
        "a",
        "an",
        "and",
        "et",
        "in",
        "en",
        "of",
        "for",
        "pour",
        "to",
        "a",
        "on",
        "sur",
        "with",
        "avec",
        "par",
        "by",
        "movie",
        "film",
        "saison",
        "season",
        "episode",
        "part",
        "partie",
        "complete",
        "integrale"
      ]);
      return clean.split(/\s+/).filter((w) => w.length >= 2 && !STOPWORDS.has(w));
    }
    function isTorrentRelevantToTitle(torrentText, cleanTitle) {
      if (!cleanTitle || typeof cleanTitle !== "string" || cleanTitle.trim().length < 2) return true;
      const keywords = extractTitleKeywords(cleanTitle);
      if (keywords.length === 0) return true;
      const normalizedTorrent = String(torrentText || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, " ");
      return keywords.some((kw) => {
        const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`\\b${escaped}\\b`, "i");
        return regex.test(normalizedTorrent);
      });
    }
    function parseBytes(str) {
      if (!str) return 0;
      const m = String(str).match(/([\d.]+)\s*([KMGT]B)/i);
      if (!m) return 0;
      const val = parseFloat(m[1]);
      const unit = m[2].toUpperCase();
      if (unit === "KB") return val * 1024;
      if (unit === "MB") return val * 1024 * 1024;
      if (unit === "GB") return val * 1024 * 1024 * 1024;
      if (unit === "TB") return val * 1024 * 1024 * 1024 * 1024;
      return val;
    }
    function isTorrentioErrorStream(stream) {
      if (!stream) return true;
      const url = String(stream.url || "");
      const title = String(stream.title || stream.description || "").toLowerCase();
      const name = String(stream.name || "").toLowerCase();
      const fullText = (title + " " + name).toLowerCase();
      if (url.includes("failed_access") || url.includes("/videos/failed_") || url.includes("slate.elfhosted.com") || url.includes("slate.") || url.includes("docs.elfhosted.com")) return true;
      if (isDownloadingUrl(url)) return true;
      if (name.includes("[\u274C]") || fullText.includes("obsolete configuration") || /\b(?:tb|rd|ad|pm|dl)?\s*error\b/i.test(name)) return true;
      if (/(?:invalid\s+(?:api|token|key|debrid|auth)|access\s+denied|rate\s+limit\s+exceeded|failed\s+to\s+(?:resolve|access|connect)|not\s+a\s+valid\s+debrid)/i.test(fullText)) return true;
      return false;
    }
    function isDownloadingUrl(urlStr) {
      if (!urlStr) return false;
      const clean = String(urlStr).toLowerCase();
      return clean.includes("downloading_") || clean.includes("/videos/downloading") || clean.includes("downloading.mp4") || clean.includes("slate.elfhosted.com") || clean.includes("slate.mp4") || clean.includes("slate.m3u8") || clean.includes("docs.elfhosted.com");
    }
    function parseStreamDetails(stream) {
      const rawTitle = stream.title || stream.description || "";
      const rawName = stream.name || "";
      const filename = stream.behaviorHints?.filename || rawTitle.split("\n")[0] || "";
      const fullText = (rawTitle + " " + rawName + " " + filename).toLowerCase().replace(/_/g, " ");
      let isCached = /\[(?:tb|rd|ad|pm|dl)?(?:\+|⚡)\]/i.test(rawName) || /\[\+\]/.test(rawName) || rawName.includes("\u26A1") || Boolean(stream.isTorboxLibrary);
      let isDownloading = !isCached && (rawName.includes("\u2B07\uFE0F") || /\[(?:tb|rd|ad|pm|dl)\s+download\]/i.test(rawName) || /download/i.test(rawName));
      if (typeof stream._torboxVerifiedCached === "boolean") {
        isCached = stream._torboxVerifiedCached;
        isDownloading = !isCached;
      }
      let resolution = "1080p FHD";
      let tierKey = "1080p";
      if (/\b(?:4k|2160p|uhd)\b/i.test(fullText)) {
        resolution = "4K Ultra HD";
        tierKey = "4k";
      } else if (/\b(?:1080p|fhd)\b/i.test(fullText)) {
        resolution = "1080p FHD";
        tierKey = "1080p";
      } else if (/\b720p\b/i.test(fullText)) {
        resolution = "720p HD";
        tierKey = "720p";
      } else if (/\b(?:480p|360p|sd|dvdrip|xvid|divx)\b/i.test(fullText)) {
        resolution = "480p SD";
        tierKey = "480p";
      } else if (/\bhd\b/i.test(fullText)) {
        resolution = "720p HD";
        tierKey = "720p";
      }
      const titleLines = rawTitle.split("\n");
      const mainReleaseName = (titleLines[0] || "").toLowerCase().replace(/_/g, " ");
      const metaLines = titleLines.slice(1).join("\n").toLowerCase().replace(/_/g, " ");
      const cleanFilename = filename.toLowerCase().replace(/_/g, " ");
      const nameNoMultiSub = mainReleaseName.replace(/\bmulti[\s._-]*subs?\b/gi, "");
      const fileNoMultiSub = cleanFilename.replace(/\bmulti[\s._-]*subs?\b/gi, "");
      const hasFrenchInName = /\b(french|truefrench|vff|vfq|vf2|vfi|vf|audio\.fr|vf\.hd|fr-en|multi)\b/i.test(nameNoMultiSub) || /\b(french|truefrench|vff|vfq|vf2|vfi|vf|audio\.fr|vf\.hd|fr-en|multi)\b/i.test(fileNoMultiSub) || /\b(vf|vff|vfq|vfi|vf2|truefrench|french)\b/i.test(fullText);
      const hasFrenchFlag = rawTitle.includes("\u{1F1EB}\u{1F1F7}");
      const isTorrent9 = fullText.includes("torrent9");
      const isExplicitVostfr = /\b(vostfr|subfrench)\b/i.test(fullText);
      const hasFrenchAudioInAudioLine = /(?:multi\s*audio|\bfr\b|\bfre\b|\bfrancais\b|\bfrench\b).*🇫🇷|🇫🇷.*(?:multi\s*audio|\bfr\b|\bfre\b|\bfrancais\b|\bfrench\b)/i.test(rawTitle) || hasFrenchFlag && !isExplicitVostfr;
      const isFrench = Boolean(hasFrenchInName || isTorrent9 || hasFrenchAudioInAudioLine || hasFrenchFlag && !isExplicitVostfr);
      const isVostfr = !isFrench && (hasFrenchFlag || /\b(vostfr|subfrench|vost)\b/i.test(fullText) || metaLines.includes("subfrench") || metaLines.includes("multi subs"));
      const isMp4 = /\.mp4(?:\?|$)/i.test(stream?.url || "") || /\.mp4(?:$|\?|\s|["')\]])/i.test(filename);
      const isAvi = /\.avi(?:\?|$)/i.test(stream?.url || "") || /\.avi(?:$|\?|\s|["')\]])/i.test(filename) || /\b(?:xvid|divx)\b/i.test(fullText);
      const hasAac = /\b(?:he-?)?aac(?:\s*\.?\s*[257]\.?[01])?\b/i.test(fullText);
      const hasMp3 = /\bmp3\b/i.test(fullText);
      const hasOpus = /\bopus(?:\s*\.?\s*[257]\.?[01])?\b/i.test(fullText);
      const hasFlac = /\bflac\b/i.test(fullText);
      const isWebAudioGroup = /\b(?:yts|yify|rapta|pir8|vxt|ozlem|galaxytv|tgx|qxr|tigole|utr|qman|lordvako|psa|extreme|pop|f4st)\b/i.test(fullText);
      const hasUnsupportedAudioCodec = /(?:\bdd\+(?![a-z])|\b(?:ac3|ac-3|e-?ac-?3|eac3|ddp(?:\s*\.?\s*[257]\.?[01])?|dd\s*\.?\s*[257]\.?[01]|dts(?:-?hd)?|truehd|atmos|lpcm)\b)/i.test(fullText);
      const hasExplicitWebAudio = Boolean(hasAac || hasMp3 || hasOpus || hasFlac);
      const isWebAudioSafe = Boolean(hasExplicitWebAudio || (isWebAudioGroup || isMp4) && !hasUnsupportedAudioCodec);
      const isMkvWithoutWebAudio = Boolean(!isMp4 && !isWebAudioGroup && !hasExplicitWebAudio);
      const hasUnsupportedAudio = Boolean((hasUnsupportedAudioCodec || isMkvWithoutWebAudio) && !hasExplicitWebAudio);
      const isH264 = /\b(?:[xh][.\s_-]?264|avc(?:-?1)?)\b/i.test(fullText);
      const isH265 = /\b(?:[xh][.\s_-]?265|hevc|10bit)\b/i.test(fullText);
      const isHighQualitySource = /\b(?:bluray|bdrip|brrip|web-?dl|web-?rip|hdtv)\b/i.test(fullText);
      const isCamOrLowQuality = /\b(?:cam|camrip|hdcam|telesync|ts|hdts|telecine|tc|scr|screener|dvdscr|r5|workprint|wp)\b/i.test(fullText);
      const isPureFrench = /\b(truefrench|vff)\b/i.test(fullText);
      const isMulti = /\bmulti\b/i.test(fullText);
      const isProper = /\b(?:proper|repack|rerip)\b/i.test(fullText);
      const isTrustedGroup = /\b(?:extreme|pop|f4st|supply|bll|fw|fr5|wawacity|torrent9|qtz|dav1nci|gh0st|duff|yts|yify|vxt|galaxytv|tgx|qxr|tigole|utr|joy|psa|bone|minx|flux|ntb)\b/i.test(fullText);
      const sizeMatch = rawTitle.match(/💾\s*([\d.]+\s*[KMGT]B)/i);
      const size = sizeMatch ? sizeMatch[1] : "";
      const sizeBytes = size ? parseBytes(size) : 0;
      const seedsMatch = rawTitle.match(/👤\s*(\d+)/);
      const seeds = seedsMatch ? parseInt(seedsMatch[1], 10) : 0;
      let languageLabel = "Version Originale";
      if (isFrench) languageLabel = "Fran\xE7ais (VF)";
      else if (isVostfr) languageLabel = "VOSTFR (Sous-titres FR)";
      return {
        resolution,
        tierKey,
        isCached,
        isDownloading,
        isFrench,
        isVostfr,
        isWebAudioSafe,
        hasUnsupportedAudio,
        isH264,
        isH265,
        isMp4,
        isAvi,
        isHighQualitySource,
        isCamOrLowQuality,
        isPureFrench,
        isMulti,
        isProper,
        isTrustedGroup,
        size,
        sizeBytes,
        seeds,
        filename: filename || "Vid\xE9o",
        languageLabel
      };
    }
    function curateStreams(rawStreams, provider, { enableAviTranscode = true, enableAudioRemux = enableAviTranscode, preferredLang = "vf", contentType = "movie", cleanTitle = "" } = {}) {
      const preferVo = String(preferredLang || "").toLowerCase() === "vo" || String(preferredLang || "").toLowerCase() === "vostfr";
      const isMovie = String(contentType || "movie").toLowerCase() !== "tv";
      const isHd1080Plus = (s) => s.tierKey === "1080p" || s.tierKey === "4k";
      const validAll = rawStreams.filter((s) => {
        if (typeof s.url !== "string" || normalizeAllowedUrl2(s.url) === null || isTorrentioErrorStream(s)) return false;
        const combined = `${s.filename || ""} ${s.title || ""} ${s.name || ""}`;
        if (cleanTitle && !isTorrentRelevantToTitle(combined, cleanTitle)) return false;
        return true;
      }).map((s, idx) => {
        const normalizedUrl = normalizeAllowedUrl2(s.url);
        const details = parseStreamDetails(s);
        return {
          id: `stream-${idx}`,
          url: normalizedUrl,
          quality: details.resolution,
          tierKey: details.tierKey,
          isCached: details.isCached,
          isDownloading: details.isDownloading,
          isFrench: details.isFrench,
          isVostfr: details.isVostfr,
          isWebAudioSafe: details.isWebAudioSafe,
          hasUnsupportedAudio: details.hasUnsupportedAudio,
          isH264: details.isH264,
          isH265: details.isH265,
          isMp4: details.isMp4,
          isAvi: details.isAvi,
          isTorboxLibrary: Boolean(s.isTorboxLibrary),
          isHighQualitySource: details.isHighQualitySource,
          isCamOrLowQuality: details.isCamOrLowQuality,
          isPureFrench: details.isPureFrench,
          isMulti: details.isMulti,
          isProper: details.isProper,
          isTrustedGroup: details.isTrustedGroup,
          languageLabel: details.languageLabel,
          size: details.size,
          sizeBytes: details.sizeBytes,
          seeds: details.seeds,
          filename: details.filename,
          rawTitle: s.title || s.name || "",
          provider
        };
      });
      const movieHdPool = isMovie ? validAll.filter(isHd1080Plus) : [];
      const anyCachedAll = validAll.some((s) => s.isCached);
      const basePool = isMovie && movieHdPool.length > 0 && (!anyCachedAll || movieHdPool.some((s) => s.isCached)) ? movieHdPool : validAll;
      const isAudioPlayableInBrowser = (s) => Boolean(enableAudioRemux || s.isWebAudioSafe || !s.hasUnsupportedAudio);
      const audioSafePool = basePool.filter(isAudioPlayableInBrowser);
      const hasAudioSafeCached = anyCachedAll ? audioSafePool.some((s) => s.isCached) : audioSafePool.length > 0;
      const valid = hasAudioSafeCached ? audioSafePool : basePool;
      if (valid.length === 0) {
        return { streams: [], activeStream: null, hasTrueVf: false, allDownloading: false };
      }
      const scoreStream = (st) => {
        let score = 0;
        if (st.isCamOrLowQuality) score -= 6e5;
        if (st.isCached) score += 1e5;
        if (st.isDownloading) score -= 5e5;
        if (st.tierKey === "1080p") score += 45e3;
        else if (st.tierKey === "4k") score += 42e3;
        else if (st.tierKey === "720p") score += isMovie ? -4e4 : 1e4;
        else score += isMovie ? -8e4 : 0;
        if (st.isWebAudioSafe) score += enableAudioRemux ? 25e3 : 55e3;
        if (st.hasUnsupportedAudio) score -= enableAudioRemux ? 35e3 : 95e3;
        if (preferVo) {
          if (!st.isFrench) score += 13e4;
          else score += 500;
        } else {
          if (st.isFrench) score += 13e4;
          else if (st.isVostfr) score += 15e3;
        }
        if (st.isHighQualitySource) score += 18e3;
        if (st.isPureFrench) score += 3e4;
        if (st.isFrench && !st.isMulti) score += 15e3;
        if (st.isProper) score += 5e3;
        if (st.isTrustedGroup) score += 8e3;
        if (st.isH264) score += 12e3;
        if (st.isH265) score -= 15e3;
        if (st.isMp4) score += 3e3;
        if (st.isAvi && !enableAviTranscode) score -= 4e5;
        const gb = st.sizeBytes / (1024 * 1024 * 1024);
        if (st.tierKey === "1080p") {
          if (gb >= 1.2 && gb <= 4.5) score += 800;
          else if (gb >= 0.7 && gb < 1.2) score += 300;
          else if (gb > 18) score -= 1500;
        } else if (st.tierKey === "4k") {
          if (gb >= 4 && gb <= 14) score += 800;
          else if (gb > 25) score -= 2e3;
        }
        score += Math.min(100, Math.round(st.seeds / 2));
        return score;
      };
      const scored = valid.map((s) => ({ ...s, score: scoreStream(s) }));
      scored.sort((a, b) => b.score - a.score);
      const hasTrueVf = scored.some((s) => s.isFrench);
      const anyCached = scored.some((s) => s.isCached);
      const allDownloading = !anyCached && scored.every((s) => s.isDownloading);
      const matchesPrefLang = (s) => preferVo ? !s.isFrench : s.isFrench;
      const audioPlayable = (s) => enableAudioRemux || !s.hasUnsupportedAudio;
      let defaultActive = null;
      if (anyCached) {
        const cachedPreferred = scored.find((s) => s.isCached && matchesPrefLang(s) && audioPlayable(s) && s.tierKey === "1080p") || scored.find((s) => s.isCached && matchesPrefLang(s) && audioPlayable(s) && s.tierKey === "4k") || scored.find((s) => s.isCached && matchesPrefLang(s) && audioPlayable(s)) || scored.find((s) => s.isCached && audioPlayable(s) && s.tierKey === "1080p") || scored.find((s) => s.isCached && audioPlayable(s) && s.tierKey === "4k") || scored.find((s) => s.isCached && audioPlayable(s)) || scored.find((s) => s.isCached && matchesPrefLang(s) && s.tierKey === "1080p") || scored.find((s) => s.isCached && matchesPrefLang(s) && s.tierKey === "4k") || scored.find((s) => s.isCached && matchesPrefLang(s)) || scored.find((s) => s.isCached && s.tierKey === "1080p") || scored.find((s) => s.isCached && s.tierKey === "4k") || scored.find((s) => s.isCached);
        defaultActive = cachedPreferred || scored[0];
      } else {
        defaultActive = scored.find((s) => matchesPrefLang(s) && audioPlayable(s) && s.tierKey === "1080p") || scored.find((s) => matchesPrefLang(s) && audioPlayable(s) && s.tierKey === "4k") || scored.find((s) => matchesPrefLang(s) && audioPlayable(s)) || scored.find((s) => audioPlayable(s) && s.tierKey === "1080p") || scored.find((s) => audioPlayable(s) && s.tierKey === "4k") || scored.find((s) => audioPlayable(s)) || scored.find((s) => matchesPrefLang(s) && s.tierKey === "1080p") || scored.find((s) => matchesPrefLang(s) && s.tierKey === "4k") || scored.find((s) => matchesPrefLang(s)) || scored[0];
      }
      const selectedList = [];
      const seenKeys = /* @__PURE__ */ new Set();
      const seenIds = /* @__PURE__ */ new Set();
      if (defaultActive) {
        const activeKey = `${defaultActive.tierKey}:${defaultActive.isFrench ? "vf" : defaultActive.isVostfr ? "vostfr" : "vo"}`;
        seenKeys.add(activeKey);
        seenIds.add(defaultActive.id);
        selectedList.push(defaultActive);
      }
      const ensureLangSlot = (predicate) => {
        if (selectedList.some(predicate)) return;
        const candidate = scored.find((s) => !seenIds.has(s.id) && predicate(s) && s.isCached && s.tierKey === "1080p") || scored.find((s) => !seenIds.has(s.id) && predicate(s) && s.isCached && s.tierKey === "4k") || scored.find((s) => !seenIds.has(s.id) && predicate(s) && s.isCached) || scored.find((s) => !seenIds.has(s.id) && predicate(s));
        if (candidate) {
          const key = `${candidate.tierKey}:${candidate.isFrench ? "vf" : candidate.isVostfr ? "vostfr" : "vo"}`;
          seenKeys.add(key);
          seenIds.add(candidate.id);
          selectedList.push(candidate);
        }
      };
      ensureLangSlot((s) => s.isFrench);
      ensureLangSlot((s) => !s.isFrench);
      for (const s of scored) {
        if (selectedList.length >= 6) break;
        if (seenIds.has(s.id)) continue;
        const key = `${s.tierKey}:${s.isFrench ? "vf" : s.isVostfr ? "vostfr" : "vo"}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          seenIds.add(s.id);
          selectedList.push(s);
        }
      }
      for (const s of scored) {
        if (selectedList.length >= 4) break;
        if (seenIds.has(s.id)) continue;
        const keyWithAudio = `${s.tierKey}:${s.isFrench ? "vf" : s.isVostfr ? "vostfr" : "vo"}:${s.isWebAudioSafe ? "aac" : "other"}`;
        if (!seenKeys.has(keyWithAudio)) {
          seenKeys.add(keyWithAudio);
          seenIds.add(s.id);
          selectedList.push(s);
        }
      }
      const tierOrder = { "4k": 0, "1080p": 1, "720p": 2, "480p": 3 };
      selectedList.sort((a, b) => {
        if (a.isCached !== b.isCached) return a.isCached ? -1 : 1;
        const ta = tierOrder[a.tierKey] ?? 9;
        const tb = tierOrder[b.tierKey] ?? 9;
        if (ta !== tb) return ta - tb;
        if (a.isFrench !== b.isFrench) return a.isFrench ? -1 : 1;
        return b.score - a.score;
      });
      const formattedStreams = selectedList.map((s) => {
        let qLabel = s.quality;
        if (s.isFrench) qLabel += " \xB7 VF";
        else if (s.isVostfr) qLabel += " \xB7 VOSTFR";
        else qLabel += " \xB7 VO";
        const canTranscodeAvi = Boolean(s.isAvi && enableAviTranscode);
        const streamPlaybackUrl = canTranscodeAvi && s.url.startsWith("http") ? `/api/video-stream?url=${encodeURIComponent(s.url)}` : s.url;
        return {
          ...s,
          url: streamPlaybackUrl,
          originalUrl: s.url,
          isTranscoded: canTranscodeAvi,
          qualityLabel: qLabel
        };
      });
      const activeCanTranscodeAvi = Boolean(defaultActive?.isAvi && enableAviTranscode);
      const activeFormatted = defaultActive ? formattedStreams.find((s) => s.id === defaultActive.id) || {
        ...defaultActive,
        url: activeCanTranscodeAvi && defaultActive.url.startsWith("http") ? `/api/video-stream?url=${encodeURIComponent(defaultActive.url)}` : defaultActive.url,
        originalUrl: defaultActive.url,
        isTranscoded: activeCanTranscodeAvi,
        qualityLabel: defaultActive.quality
      } : null;
      return {
        streams: formattedStreams,
        activeStream: activeFormatted,
        hasTrueVf,
        allDownloading,
        anyCached
      };
    }
    async function autoRepairTorboxTorrent(torrentioUrl, token) {
      if (!torrentioUrl || !token) return null;
      const match = torrentioUrl.match(/\/resolve\/torbox\/[^/]+\/([a-fA-F0-9]{40})(?:\/([^/]+)\/(\d+))?/i);
      if (!match) return null;
      const hash = match[1];
      let fileIndex = match[3] && match[3] !== "undefined" ? parseInt(match[3], 10) : null;
      try {
        const form = new FormData();
        form.append("magnet", `magnet:?xt=urn:btih:${hash}`);
        const res = await fetch("https://api.torbox.app/v1/api/torrents/createtorrent", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
          signal: AbortSignal.timeout(3500)
        });
        if (!res.ok) return null;
        const data = await res.json();
        const newTorrentId = data.data?.torrent_id;
        if (!newTorrentId) return null;
        try {
          const listRes = await fetch(`https://api.torbox.app/v1/api/torrents/mylist?id=${newTorrentId}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(3e3)
          });
          if (listRes.ok) {
            const listData = await listRes.json();
            const files = listData.data?.files || [];
            if (Array.isArray(files) && files.length > 0) {
              const videoFiles = files.filter((f) => {
                const name = (f.name || f.short_name || "").toLowerCase();
                const mime = (f.mimetype || "").toLowerCase();
                return mime.startsWith("video/") || /\.(?:mkv|mp4|avi|mov|webm|m4v|ts)$/i.test(name);
              });
              const candidates = videoFiles.length > 0 ? videoFiles : files;
              candidates.sort((a, b) => (b.size || 0) - (a.size || 0));
              if (candidates[0]?.id !== void 0) {
                fileIndex = candidates[0].id;
              }
            }
          }
        } catch {
        }
        if (fileIndex === null || isNaN(fileIndex)) fileIndex = 0;
        const dlUrl = `https://api.torbox.app/v1/api/torrents/requestdl?token=${encodeURIComponent(token)}&torrent_id=${newTorrentId}&file_id=${fileIndex}&redirect=true`;
        const head = await fetch(dlUrl, {
          method: "HEAD",
          redirect: "manual",
          signal: AbortSignal.timeout(3500)
        });
        if (head.status >= 300 && head.status < 400 && head.headers.get("location")) {
          const loc = head.headers.get("location");
          return normalizeAllowedUrl2(loc) || dlUrl;
        }
        if (head.status === 200) {
          return dlUrl;
        }
      } catch (err) {
        console.warn("[Altyflix Stream Resolver] \xC9chec auto-repair TorBox :", err.message);
      }
      return null;
    }
    async function checkStreamStatus2(streamUrl, knownFilename = "", { enableAviTranscode = true, token = "" } = {}) {
      const safeStreamUrl = normalizeAllowedUrl2(streamUrl);
      if (!safeStreamUrl) {
        return { success: false, status: "error", isDead: true, statusCode: 400, error: "H\xF4te non autoris\xE9 pour la v\xE9rification." };
      }
      const isLegacyContainerExt = (str) => /\.(?:avi|wmv|flv|vob|mpe?g|divx)(?:["';?\s]|$)/i.test(String(str || ""));
      const isLegacyContainerMime = (ct) => /msvideo|avi|x-ms-wmv|video\/mpeg|x-flv/i.test(String(ct || ""));
      try {
        const res = await fetch(safeStreamUrl, {
          method: "HEAD",
          redirect: "manual",
          signal: AbortSignal.timeout(4500)
        });
        const location = res.headers.get("location") || "";
        if (res.status >= 300 && res.status < 400 && location) {
          let resolvedLocation;
          try {
            resolvedLocation = normalizeAllowedUrl2(new URL(location, safeStreamUrl).toString());
          } catch {
            return { success: false, status: "error", isDead: true, statusCode: 502, error: "Redirection invalide." };
          }
          if (!resolvedLocation) {
            return { success: false, status: "error", isDead: true, statusCode: 403, error: "H\xF4te de redirection non autoris\xE9." };
          }
          if (isDownloadingUrl(resolvedLocation)) {
            console.log(`[Altyflix Stream Poll] Flux en cours de t\xE9l\xE9chargement (${resolvedLocation.split("?")[0]})`);
            return {
              success: true,
              status: "downloading",
              ready: false,
              message: "Pr\xE9paration du flux vid\xE9o haute d\xE9finition..."
            };
          }
          let isAvi = isLegacyContainerExt(resolvedLocation) || isLegacyContainerExt(knownFilename);
          const isModernKnownContainer = /\.(mp4|mkv|webm|m4v|mov)(?:["';?\s]|$)/i.test(knownFilename || resolvedLocation);
          if (!isAvi && !isModernKnownContainer) {
            try {
              let probeUrl = resolvedLocation;
              for (let hop = 0; hop < 3; hop++) {
                const safeProbe = normalizeAllowedUrl2(probeUrl);
                if (!safeProbe) break;
                const headTarget = await fetch(safeProbe, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(4e3) });
                const nextLoc = headTarget.headers.get("location") || "";
                if (headTarget.status >= 300 && headTarget.status < 400 && nextLoc) {
                  try {
                    await headTarget.body?.cancel();
                  } catch {
                  }
                  const resolvedNext = normalizeAllowedUrl2(new URL(nextLoc, safeProbe).toString());
                  if (!resolvedNext) {
                    return { success: false, status: "error", isDead: true, statusCode: 403, error: "H\xF4te de redirection non autoris\xE9." };
                  }
                  if (isDownloadingUrl(resolvedNext)) {
                    return {
                      success: true,
                      status: "downloading",
                      ready: false,
                      message: "Pr\xE9paration du flux vid\xE9o haute d\xE9finition..."
                    };
                  }
                  probeUrl = resolvedNext;
                  resolvedLocation = resolvedNext;
                  if (isLegacyContainerExt(resolvedNext)) {
                    isAvi = true;
                    break;
                  }
                  continue;
                }
                const cType = (headTarget.headers.get("content-type") || "").toLowerCase();
                const cDisp = (headTarget.headers.get("content-disposition") || "").toLowerCase();
                try {
                  await headTarget.body?.cancel();
                } catch {
                }
                if (headTarget.status >= 400) {
                  if (token && safeStreamUrl.includes("/resolve/torbox/")) {
                    const repaired = await autoRepairTorboxTorrent(safeStreamUrl, token);
                    if (repaired) {
                      let isAviRep = isLegacyContainerExt(repaired) || isLegacyContainerExt(knownFilename);
                      if (!isAviRep) {
                        try {
                          const probeRep = await fetch(repaired, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(3e3) });
                          const cType2 = (probeRep.headers.get("content-type") || "").toLowerCase();
                          const cDisp2 = (probeRep.headers.get("content-disposition") || "").toLowerCase();
                          try {
                            await probeRep.body?.cancel();
                          } catch {
                          }
                          if (isLegacyContainerMime(cType2) || isLegacyContainerExt(cDisp2)) {
                            isAviRep = true;
                          }
                        } catch {
                        }
                      }
                      const canTranscodeRep = Boolean(isAviRep && enableAviTranscode);
                      const effectiveUrlRep = canTranscodeRep ? `/api/video-stream?url=${encodeURIComponent(repaired)}` : repaired;
                      return {
                        success: true,
                        status: "ready",
                        ready: true,
                        isAvi: isAviRep,
                        isTranscoded: canTranscodeRep,
                        playbackUrl: effectiveUrlRep,
                        directUrl: repaired
                      };
                    }
                  }
                  return {
                    success: false,
                    status: "error",
                    isDead: true,
                    statusCode: headTarget.status <= 599 ? headTarget.status : 502,
                    error: "Flux indisponible."
                  };
                }
                if (isLegacyContainerMime(cType) || isLegacyContainerExt(cDisp)) {
                  isAvi = true;
                }
                break;
              }
            } catch {
            }
          }
          console.log(`[Altyflix Stream Poll] Flux pr\xEAt ! Redirection vers : ${resolvedLocation.split("?")[0]}${isAvi ? " [Transcodage AVI->MP4 requis]" : ""}`);
          const canTranscodeAvi = Boolean(isAvi && enableAviTranscode);
          const effectivePlaybackUrl = canTranscodeAvi ? `/api/video-stream?url=${encodeURIComponent(resolvedLocation)}` : resolvedLocation;
          return {
            success: true,
            status: "ready",
            ready: true,
            isAvi,
            isTranscoded: canTranscodeAvi,
            playbackUrl: effectivePlaybackUrl,
            directUrl: resolvedLocation
          };
        }
        if (res.status === 200) {
          if (isDownloadingUrl(safeStreamUrl)) {
            return {
              success: true,
              status: "downloading",
              ready: false,
              message: "Pr\xE9paration du flux vid\xE9o haute d\xE9finition..."
            };
          }
          const cType = (res.headers.get("content-type") || "").toLowerCase();
          const cDisp = (res.headers.get("content-disposition") || "").toLowerCase();
          const isAvi = isLegacyContainerExt(safeStreamUrl) || isLegacyContainerExt(knownFilename) || isLegacyContainerExt(cDisp) || isLegacyContainerMime(cType);
          const canTranscodeAvi = Boolean(isAvi && enableAviTranscode);
          const effectivePlaybackUrl = canTranscodeAvi ? `/api/video-stream?url=${encodeURIComponent(safeStreamUrl)}` : safeStreamUrl;
          return {
            success: true,
            status: "ready",
            ready: true,
            isAvi,
            isTranscoded: canTranscodeAvi,
            playbackUrl: effectivePlaybackUrl,
            directUrl: safeStreamUrl
          };
        }
        if (token && safeStreamUrl.includes("/resolve/torbox/")) {
          const repaired = await autoRepairTorboxTorrent(safeStreamUrl, token);
          if (repaired) {
            let isAviRep = isLegacyContainerExt(repaired) || isLegacyContainerExt(knownFilename);
            if (!isAviRep) {
              try {
                const probeRep = await fetch(repaired, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(3e3) });
                const cType = (probeRep.headers.get("content-type") || "").toLowerCase();
                const cDisp = (probeRep.headers.get("content-disposition") || "").toLowerCase();
                try {
                  await probeRep.body?.cancel();
                } catch {
                }
                if (isLegacyContainerMime(cType) || isLegacyContainerExt(cDisp)) {
                  isAviRep = true;
                }
              } catch {
              }
            }
            const canTranscodeRep = Boolean(isAviRep && enableAviTranscode);
            const effectiveUrlRep = canTranscodeRep ? `/api/video-stream?url=${encodeURIComponent(repaired)}` : repaired;
            return {
              success: true,
              status: "ready",
              ready: true,
              isAvi: isAviRep,
              isTranscoded: canTranscodeRep,
              playbackUrl: effectiveUrlRep,
              directUrl: repaired
            };
          }
        }
        return {
          success: false,
          status: "error",
          isDead: true,
          statusCode: res.status >= 400 && res.status <= 599 ? res.status : 502,
          error: "Flux temporairement indisponible."
        };
      } catch (err) {
        console.error("[Altyflix Stream Poll] Erreur de v\xE9rification :", err.message);
        return {
          success: false,
          status: "error",
          statusCode: 502,
          error: "D\xE9lai d'attente d\xE9pass\xE9 lors de la v\xE9rification du flux."
        };
      }
    }
    async function findStreamsInTorboxLibrary({ title, type, season = 1, episode = 1, torboxToken }) {
      if (!torboxToken || !title) return [];
      try {
        let torrents = null;
        const mylistKey = sha256Short(torboxToken);
        const cachedMylist = torboxMylistCache.get(mylistKey);
        if (cachedMylist) {
          torrents = cachedMylist;
        } else {
          const res = await fetch("https://api.torbox.app/v1/api/torrents/mylist", {
            headers: { "Authorization": `Bearer ${torboxToken}` },
            redirect: "error",
            signal: AbortSignal.timeout(5e3)
          });
          if (!res.ok) return [];
          const json = await res.json();
          torrents = Array.isArray(json?.data) ? json.data : [];
          torboxMylistCache.set(mylistKey, torrents, TORBOX_MYLIST_TTL_MS);
        }
        if (!torrents || torrents.length === 0) return [];
        const norm = (str) => (str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, " ").trim();
        const searchWords = norm(title).split(/\s+/).filter((w) => w.length > 2);
        if (searchWords.length === 0) return [];
        const videoExts = [".mp4", ".mkv", ".avi", ".mov", ".webm", ".ts", ".m4v"];
        const episodePattern = /\b(?:s\d{1,2}e\d{1,2}|\d{1,2}x\d{2}|saison\s*\d+|season\s*\d+|integrale?|complete\s*series)\b/i;
        const candidateFiles = [];
        for (const t of torrents) {
          if (!t.download_present && t.download_state !== "completed") continue;
          const tNorm = norm(t.name);
          const isTitleMatch = searchWords.every((w) => tNorm.includes(w));
          if (!isTitleMatch) continue;
          if (type === "movie" && episodePattern.test(t.name || "")) continue;
          const files = Array.isArray(t.files) ? t.files : [];
          for (const f of files) {
            const fName = f.short_name || f.name || "";
            const isVideo = videoExts.some((ext) => fName.toLowerCase().endsWith(ext));
            if (!isVideo) continue;
            if (type === "tv") {
              const epRegex = new RegExp(`(?:^|[^a-z0-9])(?:s0?${season}e0?${episode}|${season}x0?${episode}|ep\\.?\\s*0?${episode})(?!\\d)`, "i");
              if (!epRegex.test(fName) && !epRegex.test(t.name)) continue;
            } else if (episodePattern.test(fName)) {
              continue;
            }
            candidateFiles.push({ torrent: t, file: f, fName, size: Number(f.size) || 0 });
          }
        }
        const candidateScore = (item) => {
          let sc = 0;
          const str = `${item.torrent?.name || ""} ${item.fName || ""}`.toLowerCase();
          if (/\b(?:aac|mp3|opus|flac)\b/i.test(str)) sc += 5e4;
          if (/(?:\bdd\+(?![a-z])|\b(?:ac3|ac-3|e-?ac-?3|eac3|ddp|dts|truehd|atmos)\b)/i.test(str) && !/\b(?:aac|mp3|opus|flac)\b/i.test(str)) sc -= 4e4;
          if (/\b1080p\b/i.test(str)) sc += 3e4;
          else if (/\b(?:4k|2160p|uhd)\b/i.test(str)) sc += 25e3;
          else if (/\b720p\b/i.test(str)) sc += 1e4;
          const gb = item.size / (1024 * 1024 * 1024);
          if (gb >= 1.2 && gb <= 6) sc += 15e3;
          else if (gb > 25) sc -= 2e4;
          return sc;
        };
        candidateFiles.sort((a, b) => candidateScore(b) - candidateScore(a));
        const topCandidates = candidateFiles.slice(0, 3);
        const resolved = await Promise.all(
          topCandidates.map(async ({ torrent: t, file: f, fName, size }) => {
            try {
              const dlQuery = new URLSearchParams({
                token: String(torboxToken),
                torrent_id: String(t.id),
                file_id: String(f.id)
              });
              const dlRes = await fetch(`https://api.torbox.app/v1/api/torrents/requestdl?${dlQuery.toString()}`, {
                redirect: "error",
                signal: AbortSignal.timeout(4500)
              });
              if (dlRes.ok) {
                const dlData = await dlRes.json();
                const safeDlUrl = dlData?.success ? normalizeAllowedUrl2(dlData.data) : null;
                if (safeDlUrl) {
                  const sizeGb = size ? (size / (1024 * 1024 * 1024)).toFixed(2) + " GB" : "";
                  const metaStr = `${t.name || ""} ${fName}`.replace(/_/g, " ");
                  const inferredRes = /\b(?:2160p|4k|uhd)\b/i.test(metaStr) ? "4K" : /\b1080p\b/i.test(metaStr) ? "1080p" : /\b720p\b/i.test(metaStr) ? "720p" : /\b(?:480p|dvdrip|xvid|divx)\b/i.test(metaStr) ? "480p" : "";
                  return {
                    name: `[TB+] Torbox Cloud${inferredRes ? `
${inferredRes}` : ""}`,
                    title: `${fName}
\u{1F464} 1 \u{1F4BE} ${sizeGb} \u2699\uFE0F Ma Biblioth\xE8que TorBox
\u{1F1EB}\u{1F1F7}`,
                    url: safeDlUrl,
                    isTorboxLibrary: true
                  };
                }
              }
            } catch (dlErr) {
              console.warn("[Altyflix Torbox Library] Erreur requestdl :", dlErr.message);
            }
            return null;
          })
        );
        return resolved.filter(Boolean);
      } catch (err) {
        console.warn("[Altyflix Torbox Library] Erreur inspection mylist :", err.message);
        return [];
      }
    }
    async function resolveStreamsServer2({
      id,
      imdbId: initialImdbId,
      type = "movie",
      season = 1,
      episode = 1,
      lang = "vf",
      title = "",
      userProvider = null,
      userToken = null,
      userFrenchioUrl = null,
      enableAudioRemux = false,
      enableAviTranscode = enableAudioRemux,
      videoStreamBaseUrl = "",
      tmdbApiKey = null,
      clientAc3 = true
    }) {
      const isTv = type === "tv";
      const streamBase = String(videoStreamBaseUrl || "").trim().replace(/\/+$/, "");
      const normalizedLang = String(lang || "vf").toLowerCase() === "vo" || String(lang || "vf").toLowerCase() === "vostfr" ? "vo" : "vf";
      const rawProvider = (userProvider && userProvider.trim() || process.env.DEBRID_PROVIDER || "torbox").toLowerCase();
      const provider = ALLOWED_PROVIDERS.has(rawProvider) ? rawProvider : "torbox";
      const token = userToken && userToken.trim() || process.env.DEBRID_TOKEN || process.env.TORBOX_TOKEN || "";
      const safeId = positiveInteger2(id) ? String(id) : "";
      const safeSeason = positiveInteger2(season, 1e4) ? Number(season) : 1;
      const safeEpisode = positiveInteger2(episode, 1e4) ? Number(episode) : 1;
      season = safeSeason;
      episode = safeEpisode;
      if (!token) {
        console.warn("[Altyflix Stream Resolver] Aucun jeton de d\xE9bridage disponible c\xF4t\xE9 serveur ou utilisateur.");
        return {
          success: false,
          reason: "NO_TOKEN",
          status: "no_token",
          message: "Service de diffusion non configur\xE9.",
          streams: []
        };
      }
      let imdbId = typeof initialImdbId === "string" && /^tt\d{5,10}$/.test(initialImdbId.trim()) ? initialImdbId.trim() : null;
      if (!imdbId && typeof id === "string" && /^tt\d{5,10}$/.test(id.trim())) {
        imdbId = id.trim();
      }
      let cleanTitle = (title || "").trim();
      const tmdbKey = tmdbApiKey && String(tmdbApiKey).trim() || process.env.TMDB_API_KEY || "";
      const finalizeStreamUrl = (s) => {
        if (!s) return s;
        const rawDirect = s.directUrl || s.originalUrl || s.url;
        const audioLangParam = s.isFrench ? "vf" : "vo";
        if (s.isAvi && enableAviTranscode && rawDirect) {
          if (s.url && s.url.startsWith("/api/video-stream")) {
            let updated = s.url.includes("lang=") ? s.url : `${s.url}&lang=${audioLangParam}`;
            if (!updated.includes("transcode=")) updated = `${updated}&transcode=1`;
            return streamBase ? { ...s, url: `${streamBase}${updated}`, isTranscoded: true } : { ...s, url: updated, isTranscoded: true };
          }
          if (rawDirect.startsWith("http")) {
            return { ...s, url: `${streamBase}/api/video-stream?transcode=1&lang=${audioLangParam}&url=${encodeURIComponent(rawDirect)}`, isTranscoded: true };
          }
        }
        if (!s.isAvi && enableAudioRemux && s.hasUnsupportedAudio && s.verifiedReady && s.url && s.url.startsWith("http")) {
          return {
            ...s,
            url: `${streamBase}/api/video-stream?audio=aac&lang=${audioLangParam}&url=${encodeURIComponent(s.url)}`,
            directUrl: s.directUrl || s.url,
            isTranscoded: true,
            audioRemuxed: true
          };
        }
        return s;
      };
      if ((!imdbId || !cleanTitle) && safeId && tmdbKey) {
        try {
          const detailUrl = tmdbUrl2(isTv ? `tv/${safeId}/external_ids` : `movie/${safeId}/external_ids`, {}, tmdbKey);
          const tmdbRes = await fetch(detailUrl, { redirect: "error", signal: AbortSignal.timeout(5e3) });
          if (tmdbRes.ok) {
            const tmdbData = await tmdbRes.json();
            if (!imdbId && /^tt\d{5,10}$/.test(String(tmdbData.imdb_id || ""))) imdbId = tmdbData.imdb_id;
          }
        } catch (e) {
          console.warn("[Altyflix Stream Resolver] \xC9chec de r\xE9cup\xE9ration de l'identifiant IMDb direct :", e.message);
        }
      }
      if (!cleanTitle && imdbId) {
        try {
          const cinemetaUrl = `https://v3-cinemeta.strem.io/meta/${isTv ? "series" : "movie"}/${imdbId}.json`;
          const cRes = await fetch(cinemetaUrl, { redirect: "error", signal: AbortSignal.timeout(3e3) });
          if (cRes.ok) {
            const cData = await cRes.json();
            const foundName = cData?.meta?.name;
            if (foundName && typeof foundName === "string") {
              cleanTitle = foundName.trim();
              console.log(`[Altyflix Stream Resolver] Titre r\xE9solu via Cinemeta : "${cleanTitle}" pour ${imdbId}`);
            }
          }
        } catch {
        }
      }
      if ((!imdbId || !cleanTitle) && safeId && tmdbKey) {
        try {
          const baseDetailUrl = tmdbUrl2(isTv ? `tv/${safeId}` : `movie/${safeId}`, { language: "fr-FR" }, tmdbKey);
          const baseRes = await fetch(baseDetailUrl, { redirect: "error", signal: AbortSignal.timeout(4e3) });
          if (baseRes.ok) {
            const baseData = await baseRes.json();
            const candidateImdb = baseData.imdb_id || baseData.external_ids?.imdb_id;
            if (!imdbId && /^tt\d{5,10}$/.test(String(candidateImdb || ""))) imdbId = candidateImdb;
            if (!cleanTitle) cleanTitle = baseData.title || baseData.name || baseData.original_title || baseData.original_name || "";
            if (!imdbId) {
              const searchTitle = cleanTitle || baseData.original_title || baseData.title;
              if (searchTitle) {
                const cinemetaUrl = `https://v3-cinemeta.strem.io/catalog/${isTv ? "series" : "movie"}/top/search=${encodeURIComponent(searchTitle)}.json`;
                const cRes = await fetch(cinemetaUrl, { redirect: "error", signal: AbortSignal.timeout(4e3) });
                if (cRes.ok) {
                  const cData = await cRes.json();
                  const cid = cData?.metas?.[0]?.id;
                  if (cid && /^tt\d{5,10}$/.test(cid)) {
                    imdbId = cid;
                    console.log(`[Altyflix Stream Resolver] IMDb ID identifi\xE9 via Cinemeta : ${imdbId} pour "${searchTitle}"`);
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn("[Altyflix Stream Resolver] Erreur de recherche IMDb \xE9tendue :", e.message);
        }
      }
      if (!imdbId && cleanTitle && tmdbKey) {
        try {
          const searchUrl = tmdbUrl2(isTv ? "search/tv" : "search/movie", { query: cleanTitle, language: "fr-FR" }, tmdbKey);
          const sRes = await fetch(searchUrl, { redirect: "error", signal: AbortSignal.timeout(3500) });
          if (sRes.ok) {
            const sData = await sRes.json();
            const topResult = sData.results?.[0];
            if (topResult?.id && positiveInteger2(topResult.id)) {
              const extUrl = tmdbUrl2(isTv ? `tv/${topResult.id}/external_ids` : `movie/${topResult.id}/external_ids`, {}, tmdbKey);
              const extRes = await fetch(extUrl, { redirect: "error", signal: AbortSignal.timeout(3e3) });
              if (extRes.ok) {
                const extData = await extRes.json();
                if (/^tt\d{5,10}$/.test(String(extData.imdb_id || ""))) {
                  imdbId = extData.imdb_id;
                  console.log(`[Altyflix Stream Resolver] IMDb ID trouv\xE9 via recherche TMDB : ${imdbId} pour "${cleanTitle}"`);
                }
              }
            }
          }
        } catch (sErr) {
          console.warn("[Altyflix Stream Resolver] Erreur recherche TMDB par titre :", sErr.message);
        }
      }
      if (!imdbId) {
        if (provider === "torbox" && cleanTitle) {
          try {
            const mylistStreams = await findStreamsInTorboxLibrary({
              title: cleanTitle,
              type,
              season,
              episode,
              torboxToken: token
            });
            if (mylistStreams.length > 0) {
              const curated = curateStreams(mylistStreams, provider, { enableAviTranscode, enableAudioRemux, preferredLang: normalizedLang, contentType: type });
              const readyFallback = curated.streams.map((s) => finalizeStreamUrl({ ...s, verifiedReady: true }));
              const activeFallback = curated.activeStream ? readyFallback.find((s) => s.id === curated.activeStream.id) || readyFallback[0] : readyFallback[0];
              return {
                success: true,
                status: "ready",
                imdbId: null,
                streams: readyFallback,
                activeStream: activeFallback,
                hasTrueVf: curated.hasTrueVf
              };
            }
          } catch {
          }
        }
        return {
          success: false,
          reason: "MISSING_IMDB_ID",
          status: "error",
          message: "Identifiant international introuvable pour ce titre.",
          streams: []
        };
      }
      const streamKey = isTv ? `${imdbId}:${season}:${episode}` : `${imdbId}`;
      const cacheKey = `${provider}:${sha256Short(token)}:${streamKey}:${normalizedLang}:${enableAudioRemux ? "remux" : "direct"}:${enableAviTranscode ? "avi" : "noavi"}:${sha256Short(streamBase)}`;
      const cachedResult = getCachedResolve(cacheKey);
      if (cachedResult) {
        console.log(`[Altyflix Stream Resolver] R\xE9ponse instantan\xE9e depuis le cache m\xE9moire pour ${streamKey}.`);
        return cachedResult;
      }
      if (inFlightResolves.has(cacheKey)) {
        return inFlightResolves.get(cacheKey);
      }
      const resolvePromise = (async () => {
        const ALL_PROVIDERS = "yts,eztv,rarbg,1337x,ext,thepiratebay,kickasstorrents,torrentgalaxy,uindex,knaben,magnetdl,horriblesubs,nyaasi,animetosho,tokyotosho,anidex,nekobt,torrent9,rutracker,rutor,cinemaz,ibit,torlock,comando,bludv,micoleaodublado,ilcorsaronero,mejortorrent,wolfmax4k,cinecalidad,besttorrents";
        console.log(`[Altyflix Stream Resolver] Recherche parall\xE8le des flux pour ${type} ${imdbId} (S${season}E${episode}) via ${provider}...`);
        try {
          const optionsPriorityFr = `providers=${ALL_PROVIDERS}|sort=qualitysize|foreign_lang=french|${provider}=${encodeURIComponent(token)}`;
          const endpointPriorityFr = `https://torrentio.strem.fun/${optionsPriorityFr}/stream/${isTv ? "series" : "movie"}/${streamKey}.json`;
          const optionsVf = `providers=${ALL_PROVIDERS}|sort=qualitysize|language=french|${provider}=${encodeURIComponent(token)}`;
          const endpointVf = `https://torrentio.strem.fun/${optionsVf}/stream/${isTv ? "series" : "movie"}/${streamKey}.json`;
          const optionsGlobal = `providers=${ALL_PROVIDERS}|sort=qualitysize|${provider}=${encodeURIComponent(token)}`;
          const endpointGlobal = `https://torrentio.strem.fun/${optionsGlobal}/stream/${isTv ? "series" : "movie"}/${streamKey}.json`;
          const fetchTorrentio = async (url, label) => {
            try {
              const res = await fetch(url, {
                headers: { "Accept": "application/json" },
                redirect: "error",
                signal: AbortSignal.timeout(4500)
              });
              if (res.ok) {
                const data = await res.json();
                return Array.isArray(data?.streams) ? data.streams : [];
              }
            } catch (e) {
              console.warn(`[Altyflix Stream Resolver] Timeout ou erreur fetch ${label} :`, e.message);
            }
            return [];
          };
          const fetchMylist = async () => {
            if (provider !== "torbox" || !cleanTitle) return [];
            try {
              const streams = await findStreamsInTorboxLibrary({
                title: cleanTitle,
                type,
                season,
                episode,
                torboxToken: token
              });
              if (streams.length > 0) {
                console.log(`[Altyflix Torbox Library] ${streams.length} flux trouv\xE9s dans le cloud TorBox pour "${cleanTitle}".`);
              }
              return streams;
            } catch (mlErr) {
              console.warn("[Altyflix Torbox Library] Erreur inspection cloud :", mlErr.message);
              return [];
            }
          };
          const [priorityFrStreams, vfStreams, globalStreams, mylistStreams] = await Promise.all([
            fetchTorrentio(endpointPriorityFr, "FR Priority"),
            fetchTorrentio(endpointVf, "VF"),
            fetchTorrentio(endpointGlobal, "Global"),
            fetchMylist()
          ]);
          const seenUrls = /* @__PURE__ */ new Set();
          const rawStreams = [];
          for (const s of [...mylistStreams || [], ...priorityFrStreams, ...vfStreams, ...globalStreams]) {
            if (s && s.url && !seenUrls.has(s.url)) {
              seenUrls.add(s.url);
              rawStreams.push(s);
            }
          }
          const errorStream = rawStreams.find((s) => isTorrentioErrorStream(s) && !isDownloadingUrl(s?.url));
          if (errorStream && rawStreams.length === 1) {
            return {
              success: false,
              reason: "INVALID_DEBRID_TOKEN",
              status: "error",
              message: "Acc\xE8s non reconnu. Veuillez v\xE9rifier vos param\xE8tres de lecture.",
              imdbId,
              streams: []
            };
          }
          if (provider === "torbox" && token && rawStreams.length > 0) {
            try {
              const hashRegex = /\/resolve\/torbox\/[^/]+\/([a-fA-F0-9]{40})\//i;
              const hashesSet = /* @__PURE__ */ new Set();
              const orderedForCacheCheck = type === "tv" ? rawStreams : [...rawStreams].sort((a, b) => {
                const aHd = /2160p|4k|uhd|1080p/i.test(`${a.name || ""} ${a.title || ""}`) ? 1 : 0;
                const bHd = /2160p|4k|uhd|1080p/i.test(`${b.name || ""} ${b.title || ""}`) ? 1 : 0;
                return bHd - aHd;
              });
              const extractTorrentHash = (s) => {
                const m = (s.url || "").match(hashRegex);
                if (m && m[1]) return m[1].toLowerCase();
                if (s.behaviorHints?.bingeGroup) {
                  const bg = s.behaviorHints.bingeGroup.match(/([a-fA-F0-9]{40})/i);
                  if (bg) return bg[1].toLowerCase();
                }
                return null;
              };
              for (const s of orderedForCacheCheck) {
                if (s.isTorboxLibrary) continue;
                const h = extractTorrentHash(s);
                if (h) hashesSet.add(h);
                if (hashesSet.size >= 40) break;
              }
              if (hashesSet.size > 0) {
                const hashesParam = Array.from(hashesSet).join(",");
                const cacheRes = await fetch(`https://api.torbox.app/v1/api/torrents/checkcached?hash=${hashesParam}&format=object`, {
                  headers: { "Authorization": `Bearer ${token}` },
                  redirect: "error",
                  signal: AbortSignal.timeout(2200)
                });
                if (cacheRes.ok) {
                  const cacheJson = await cacheRes.json();
                  if (cacheJson.success && cacheJson.data && typeof cacheJson.data === "object") {
                    const cachedMap = cacheJson.data;
                    for (const s of rawStreams) {
                      if (s.isTorboxLibrary) {
                        s._torboxVerifiedCached = true;
                        continue;
                      }
                      const h = extractTorrentHash(s);
                      if (h && hashesSet.has(h)) {
                        s._torboxVerifiedCached = Boolean(cachedMap[h]);
                      }
                    }
                  }
                }
              }
            } catch (e) {
              console.warn("[Altyflix Stream Resolver] V\xE9rification batch cache TorBox ignor\xE9e :", e.message);
            }
          }
          const curated = curateStreams(rawStreams, provider, { enableAviTranscode, enableAudioRemux, preferredLang: normalizedLang, contentType: type, cleanTitle });
          if (!curated.streams || curated.streams.length === 0) {
            return {
              success: false,
              reason: "NO_STREAMS_FOUND",
              status: "error",
              message: "Ce titre n'est pas disponible pour le moment. Veuillez s\xE9lectionner un autre titre.",
              imdbId,
              streams: []
            };
          }
          const supportsAc3 = Boolean(clientAc3);
          const wantVo = normalizedLang === "vo";
          const matchesLang = (s) => wantVo ? !s.isFrench : s.isFrench;
          const isPlayableFormat = (s) => !s.isAvi || enableAviTranscode;
          const pickBestCandidate = (list) => {
            if (!supportsAc3) {
              return list.find((s) => isPlayableFormat(s) && matchesLang(s) && s.isWebAudioSafe && !s.hasUnsupportedAudio && s.isH264 && s.tierKey === "1080p") || list.find((s) => isPlayableFormat(s) && matchesLang(s) && s.isWebAudioSafe && !s.hasUnsupportedAudio && s.tierKey === "1080p") || list.find((s) => isPlayableFormat(s) && matchesLang(s) && s.isWebAudioSafe && !s.hasUnsupportedAudio && s.tierKey === "4k") || list.find((s) => isPlayableFormat(s) && matchesLang(s) && s.isWebAudioSafe && !s.hasUnsupportedAudio) || list.find((s) => isPlayableFormat(s) && s.isWebAudioSafe && !s.hasUnsupportedAudio && s.isH264 && s.tierKey === "1080p") || list.find((s) => isPlayableFormat(s) && s.isWebAudioSafe && !s.hasUnsupportedAudio && s.tierKey === "1080p") || list.find((s) => isPlayableFormat(s) && s.isWebAudioSafe && !s.hasUnsupportedAudio && s.tierKey === "4k") || list.find((s) => isPlayableFormat(s) && s.isWebAudioSafe && !s.hasUnsupportedAudio) || list.find((s) => isPlayableFormat(s) && matchesLang(s) && s.isH264 && s.tierKey === "1080p") || list.find((s) => isPlayableFormat(s) && matchesLang(s) && s.tierKey === "1080p") || list.find((s) => isPlayableFormat(s) && matchesLang(s) && s.tierKey === "4k") || list.find((s) => isPlayableFormat(s) && matchesLang(s)) || list.find((s) => isPlayableFormat(s)) || list[0];
            }
            return list.find((s) => isPlayableFormat(s) && matchesLang(s) && !s.hasUnsupportedAudio && s.isH264 && s.tierKey === "1080p") || list.find((s) => isPlayableFormat(s) && matchesLang(s) && !s.hasUnsupportedAudio && s.tierKey === "1080p") || list.find((s) => isPlayableFormat(s) && matchesLang(s) && !s.hasUnsupportedAudio && s.tierKey === "4k") || list.find((s) => isPlayableFormat(s) && matchesLang(s) && !s.hasUnsupportedAudio) || list.find((s) => isPlayableFormat(s) && matchesLang(s) && s.isH264 && s.tierKey === "1080p") || list.find((s) => isPlayableFormat(s) && matchesLang(s) && s.isH264 && s.tierKey === "4k") || list.find((s) => isPlayableFormat(s) && matchesLang(s) && s.tierKey === "1080p") || list.find((s) => isPlayableFormat(s) && matchesLang(s) && s.tierKey === "4k") || list.find((s) => isPlayableFormat(s) && matchesLang(s)) || list.find((s) => isPlayableFormat(s) && !s.hasUnsupportedAudio && s.isH264 && s.tierKey === "1080p") || list.find((s) => isPlayableFormat(s) && !s.hasUnsupportedAudio && s.tierKey === "1080p") || list.find((s) => isPlayableFormat(s) && !s.hasUnsupportedAudio && s.tierKey === "4k") || list.find((s) => isPlayableFormat(s) && !s.hasUnsupportedAudio) || list.find((s) => isPlayableFormat(s)) || list[0];
          };
          let workingStreams = [...curated.streams];
          const cachedCandidates = workingStreams.filter((s) => s.isCached && !s.isDownloading);
          const pool = cachedCandidates.length > 0 ? cachedCandidates : workingStreams;
          let active = null;
          let initialStatus = cachedCandidates.length > 0 ? "ready" : "downloading";
          const testedIds = /* @__PURE__ */ new Set();
          while (testedIds.size < 3) {
            const remainingPool = pool.filter((s) => !testedIds.has(s.id) && !s.isDead);
            if (remainingPool.length === 0) break;
            const candidate = pickBestCandidate(remainingPool);
            if (!candidate) break;
            testedIds.add(candidate.id);
            if (candidate.isTorboxLibrary) {
              active = { ...candidate, isCached: true, isDownloading: false, verifiedReady: true };
              break;
            }
            const rawTarget = candidate.originalUrl || candidate.url;
            if (!rawTarget || !normalizeAllowedUrl2(rawTarget)) {
              continue;
            }
            try {
              const check = await checkStreamStatus2(rawTarget, candidate.filename || "", { enableAviTranscode, token });
              if (check.ready && check.playbackUrl) {
                const isAviNow = Boolean(candidate.isAvi || check.isAvi);
                active = {
                  ...candidate,
                  url: check.playbackUrl,
                  directUrl: check.directUrl || check.playbackUrl,
                  originalUrl: rawTarget,
                  isCached: true,
                  isDownloading: false,
                  isAvi: isAviNow,
                  isTranscoded: Boolean(isAviNow && enableAviTranscode),
                  verifiedReady: true
                };
                const idx = workingStreams.findIndex((s) => s.id === candidate.id);
                if (idx !== -1) workingStreams[idx] = active;
                break;
              } else if (check.status === "error" || check.isDead) {
                candidate.isDead = true;
                candidate.isCached = false;
                candidate.verifiedReady = false;
              }
            } catch {
              active = { ...candidate, verifiedReady: true };
              break;
            }
          }
          if (!active && cachedCandidates.length > 0) {
            const fallback = cachedCandidates.find((s) => !s.isDead) || cachedCandidates[0];
            active = { ...fallback, verifiedReady: true };
          }
          if (!active) {
            active = workingStreams[0];
            initialStatus = "downloading";
          }
          const otherCached = workingStreams.filter((s) => s.id !== active?.id && s.isCached && !s.isDownloading && !s.isDead && !s.directUrl);
          if (otherCached.length > 0 && token) {
            await Promise.allSettled(otherCached.map(async (candidate) => {
              const rawTarget = candidate.originalUrl || candidate.url;
              if (!rawTarget || !normalizeAllowedUrl2(rawTarget)) return;
              try {
                const check = await checkStreamStatus2(rawTarget, candidate.filename || "", { enableAviTranscode, token });
                const idx = workingStreams.findIndex((s) => s.id === candidate.id);
                if (idx !== -1) {
                  if (check.ready && check.playbackUrl) {
                    const isAviNow = Boolean(candidate.isAvi || check.isAvi);
                    workingStreams[idx] = {
                      ...candidate,
                      url: check.playbackUrl,
                      directUrl: check.directUrl || check.playbackUrl,
                      originalUrl: rawTarget,
                      isCached: true,
                      isDownloading: false,
                      isAvi: isAviNow,
                      isTranscoded: Boolean(isAviNow && enableAviTranscode),
                      verifiedReady: true
                    };
                  } else if (check.status === "error" || check.isDead) {
                    workingStreams[idx].isDead = true;
                  }
                }
              } catch {
              }
            }));
          }
          const cleanStreams = workingStreams.filter((s) => !s.isDead);
          const cachedClean = cleanStreams.filter((s) => s.isCached && !s.isDownloading);
          const baseList = cachedClean.length > 0 ? cachedClean : cleanStreams;
          const playableStreams = baseList.filter(isPlayableFormat);
          const finalStreams = playableStreams.length > 0 ? playableStreams : baseList;
          const finalActive = active ? finalizeStreamUrl({ ...active, originalUrl: active.originalUrl || active.url }) : null;
          const syncedStreams = finalStreams.map(
            (s) => finalActive && s.id === finalActive.id ? finalActive : finalizeStreamUrl(s)
          );
          console.log(`[Altyflix Stream Resolver] R\xE9solution termin\xE9e : ${syncedStreams.length} qualit\xE9s pr\xEAtes. Statut : ${initialStatus}.`);
          const responsePayload = {
            success: true,
            status: initialStatus,
            activeStream: finalActive,
            streams: syncedStreams,
            hasTrueVf: syncedStreams.some((s) => s.isFrench) || curated.hasTrueVf,
            imdbId
          };
          if (initialStatus === "ready") {
            setCachedResolve(cacheKey, responsePayload);
          }
          return responsePayload;
        } catch (err) {
          console.error("[Altyflix Stream Resolver] Erreur r\xE9seau lors de la r\xE9solution :", err.message);
          return {
            success: false,
            reason: "NETWORK_ERROR",
            status: "error",
            message: "Service de recherche temporairement indisponible.",
            imdbId,
            streams: []
          };
        }
      })();
      inFlightResolves.set(cacheKey, resolvePromise);
      try {
        return await resolvePromise;
      } finally {
        inFlightResolves.delete(cacheKey);
      }
    }
    module.exports = {
      normalizeAllowedUrl: normalizeAllowedUrl2,
      isAllowedUrl,
      isDownloadingUrl,
      isTorrentioErrorStream,
      parseStreamDetails,
      curateStreams,
      checkStreamStatus: checkStreamStatus2,
      resolveStreamsServer: resolveStreamsServer2
    };
  }
});

// netlify/functions-src/api.mjs
var import_stream_resolver = __toESM(require_stream_resolver(), 1);
var import_security = __toESM(require_security(), 1);
import zlib from "node:zlib";
import { promisify } from "node:util";
var gunzipAsync = promisify(zlib.gunzip);
var { resolveStreamsServer, checkStreamStatus, normalizeAllowedUrl } = import_stream_resolver.default;
var {
  SECURITY_HEADERS,
  DOCUMENTARY_CATEGORIES,
  HttpError,
  positiveInteger,
  arteLimit,
  tmdbUrl,
  BoundedCache,
  fetchJson,
  normalizeAllowedSubtitleUrl,
  readBoundedBuffer,
  decodeSubtitleBuffer,
  cleanSubtitleToVtt,
  rankOpenSubtitles
} = import_security.default;
var memoryCache = new BoundedCache(200);
function getEnv(name, fallback = "") {
  try {
    const netlifyVal = globalThis.Netlify?.env?.get?.(name);
    if (typeof netlifyVal === "string" && netlifyVal.trim() !== "") {
      return netlifyVal.trim();
    }
  } catch {
  }
  const procVal = process.env[name];
  if (typeof procVal === "string" && procVal.trim() !== "") {
    return procVal.trim();
  }
  return fallback;
}
function getStreamBackendUrl(rawInput = getEnv("STREAM_BACKEND_URL", "")) {
  const raw = String(rawInput || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return "";
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return "";
    if (parsed.pathname && parsed.pathname !== "/") return "";
    if (parsed.port) {
      const portNum = Number(parsed.port);
      if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) return "";
    }
    const host = parsed.hostname.toLowerCase();
    if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return "";
    if (host.endsWith("onrender.com") || host.endsWith("render.com")) return "";
    if (host.includes(":") || /^[\d.]+$/.test(host) || /^0x[\da-f]+$/i.test(host)) return "";
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(host)) return "";
    return parsed.origin;
  } catch {
    return "";
  }
}
function getCorsOrigin(req) {
  const origin = req?.headers?.get?.("origin") || "";
  if (!origin) return "*";
  const configured = getEnv("ALLOWED_ORIGINS", "");
  const allowed = configured ? configured.split(",").map((s) => s.trim()).filter(Boolean) : ["https://altyflix.netlify.app", "http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000", "http://127.0.0.1:5173"];
  try {
    const reqOrigin = new URL(req.url).origin;
    if (origin === reqOrigin) return origin;
  } catch {
  }
  return allowed.includes(origin) ? origin : "null";
}
function makeJsonResponse(req) {
  const corsOrigin = getCorsOrigin(req);
  return function jsonResponse(data, status = 200, extraHeaders = {}) {
    const safeStatus = status >= 200 && status <= 599 && status !== 204 && status !== 304 ? status : 502;
    return new Response(JSON.stringify(data), {
      status: safeStatus,
      headers: {
        ...SECURITY_HEADERS,
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": corsOrigin,
        "Vary": "Origin",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-debrid-token, x-debrid-provider, x-frenchio-url",
        ...extraHeaders
      }
    });
  };
}
async function handleRequest(req) {
  try {
    const corsOrigin = getCorsOrigin(req);
    const jsonResponse = makeJsonResponse(req);
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...SECURITY_HEADERS,
          "Access-Control-Allow-Origin": corsOrigin,
          "Vary": "Origin",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, x-debrid-token, x-debrid-provider, x-frenchio-url"
        }
      });
    }
    if (!["GET", "HEAD"].includes(req.method)) {
      return jsonResponse({ success: false, error: "M\xE9thode non autoris\xE9e." }, 405, {
        Allow: "GET, HEAD, OPTIONS"
      });
    }
    const parsedUrl = new URL(req.url);
    const pathname = parsedUrl.pathname.replace(/^\/\.netlify\/functions\/api/, "/api");
    const query = Object.fromEntries(parsedUrl.searchParams);
    const TMDB_API_KEY = getEnv("TMDB_API_KEY", "a0819950449844817a0942ca79a4ccb0");
    const SERVER_DEBRID_PROVIDER = getEnv("DEBRID_PROVIDER", "torbox");
    const SERVER_DEBRID_TOKEN = getEnv("DEBRID_TOKEN") || getEnv("TORBOX_TOKEN") || "";
    if (pathname === "/api" || pathname === "/api/" || pathname === "/api/health") {
      return jsonResponse({
        status: "ok",
        runtime: "netlify-functions",
        version: "3.2.0",
        debridConfigured: Boolean(SERVER_DEBRID_TOKEN),
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }, 200, { "Cache-Control": "no-store" });
    }
    if (pathname.startsWith("/api/tmdb/")) {
      try {
        const tmdbPath = pathname.replace("/api/tmdb/", "");
        const upstreamUrl = tmdbUrl(tmdbPath, parsedUrl.searchParams, TMDB_API_KEY);
        const cacheKey = upstreamUrl.toString();
        let data = memoryCache.get(cacheKey);
        if (!data) {
          data = await fetchJson(upstreamUrl);
          memoryCache.set(cacheKey, data);
        }
        return jsonResponse(data, 200, {
          "Cache-Control": "public, max-age=300, stale-while-revalidate=600"
        });
      } catch (err) {
        return jsonResponse(
          { success: false, error: err instanceof HttpError ? err.message : "Service TMDB indisponible." },
          err.status || 502
        );
      }
    }
    if (pathname === "/api/stream-resolve") {
      const { id, imdbId, type = "movie", season = 1, episode = 1, lang = "vf", title = "", clientAc3 } = query;
      const userProvider = req.headers.get("x-debrid-provider") || SERVER_DEBRID_PROVIDER;
      const userToken = req.headers.get("x-debrid-token") || SERVER_DEBRID_TOKEN;
      const userFrenchioUrl = req.headers.get("x-frenchio-url") || query.frenchioUrl || getEnv("FRENCHIO_URL");
      const streamBackendUrl = getStreamBackendUrl();
      const hasRemoteFfmpeg = Boolean(streamBackendUrl);
      const supportsClientAc3 = clientAc3 === void 0 ? true : clientAc3 === "1" || clientAc3 === "true";
      try {
        const result = await resolveStreamsServer({
          id,
          imdbId,
          type,
          season: positiveInteger(season, 1e4) ? Number(season) : 1,
          episode: positiveInteger(episode, 1e4) ? Number(episode) : 1,
          lang,
          title,
          userProvider,
          userToken,
          userFrenchioUrl,
          enableAudioRemux: hasRemoteFfmpeg,
          enableAviTranscode: hasRemoteFfmpeg,
          videoStreamBaseUrl: streamBackendUrl,
          tmdbApiKey: TMDB_API_KEY,
          clientAc3: supportsClientAc3
        });
        return jsonResponse(result, 200, { "Cache-Control": "no-store" });
      } catch (err) {
        console.error("[Netlify API /api/stream-resolve] Error:", err);
        return jsonResponse({
          success: false,
          status: "error",
          error: "Erreur interne lors de la r\xE9solution du flux."
        }, 500);
      }
    }
    if (pathname === "/api/stream-poll") {
      const targetUrl = query.url;
      if (!targetUrl) {
        return jsonResponse({ success: false, status: "error", error: "Param\xE8tre url manquant." }, 400);
      }
      const userToken = req.headers.get("x-debrid-token") || SERVER_DEBRID_TOKEN;
      const streamBackendUrl = getStreamBackendUrl();
      const hasRemoteFfmpeg = Boolean(streamBackendUrl);
      try {
        const statusData = await checkStreamStatus(targetUrl, "", { enableAviTranscode: hasRemoteFfmpeg, token: userToken });
        if (hasRemoteFfmpeg && typeof statusData?.playbackUrl === "string" && statusData.playbackUrl.startsWith("/api/video-stream")) {
          statusData.playbackUrl = `${streamBackendUrl}${statusData.playbackUrl}`;
        }
        const rawStatus = statusData.success === false ? statusData.statusCode || 400 : 200;
        const httpStatus = rawStatus === 200 || rawStatus >= 400 && rawStatus <= 599 ? rawStatus : 502;
        return jsonResponse(statusData, httpStatus, { "Cache-Control": "no-store" });
      } catch (err) {
        console.error("[Netlify API /api/stream-poll] Error:", err);
        return jsonResponse({
          success: false,
          status: "error",
          error: "Erreur lors de la v\xE9rification du flux."
        }, 500);
      }
    }
    if (pathname === "/api/video-stream") {
      const safeTargetUrl = normalizeAllowedUrl(query.url);
      if (!safeTargetUrl) {
        return jsonResponse({ error: "URL vid\xE9o non autoris\xE9e." }, 400);
      }
      const streamBackendUrl = getStreamBackendUrl();
      const redirectLocation = streamBackendUrl ? `${streamBackendUrl}/api/video-stream${parsedUrl.search}` : safeTargetUrl;
      return new Response(null, {
        status: 302,
        headers: {
          ...SECURITY_HEADERS,
          "Access-Control-Allow-Origin": corsOrigin,
          "Vary": "Origin",
          Location: redirectLocation,
          "Cache-Control": "no-store"
        }
      });
    }
    if (pathname === "/api/subtitles-vtt") {
      const safeTargetUrl = normalizeAllowedSubtitleUrl(query.url);
      if (!safeTargetUrl) {
        return jsonResponse({ error: "URL de sous-titres non autoris\xE9e." }, 400);
      }
      try {
        let currentUrl = safeTargetUrl;
        let vttRes = null;
        for (let hop = 0; hop < 4; hop++) {
          const safeHop = normalizeAllowedSubtitleUrl(currentUrl);
          if (!safeHop) {
            return jsonResponse({ error: "Redirection sous-titres non autoris\xE9e." }, 403);
          }
          vttRes = await fetch(safeHop, {
            headers: { "User-Agent": "TemporaryUserAgent" },
            redirect: "manual",
            signal: AbortSignal.timeout(8e3)
          });
          if (vttRes.status >= 300 && vttRes.status < 400 && vttRes.headers.get("location")) {
            try {
              await vttRes.body?.cancel();
            } catch {
            }
            currentUrl = new URL(vttRes.headers.get("location"), safeHop).toString();
            continue;
          }
          break;
        }
        if (!vttRes || vttRes.status >= 300 && vttRes.status < 400) {
          try {
            await vttRes?.body?.cancel();
          } catch {
          }
          return jsonResponse({ error: "Trop de redirections pour les sous-titres." }, 502);
        }
        if (!vttRes.ok) {
          const errStatus = vttRes.status >= 400 && vttRes.status <= 599 ? vttRes.status : 502;
          return jsonResponse({ error: "Erreur sous-titre." }, errStatus);
        }
        const rawBuf = await readBoundedBuffer(vttRes, 2 * 1024 * 1024);
        let decodedBuf = rawBuf;
        if (rawBuf.length >= 2 && rawBuf[0] === 31 && rawBuf[1] === 139) {
          try {
            decodedBuf = await gunzipAsync(rawBuf, { maxOutputLength: 5 * 1024 * 1024 });
          } catch (gzErr) {
            if (gzErr?.code === "ERR_BUFFER_TOO_LARGE") {
              throw new HttpError(413, "Fichier sous-titre trop volumineux apr\xE8s d\xE9compression.");
            }
            throw new HttpError(502, "Fichier sous-titre corrompu.");
          }
        }
        const text = cleanSubtitleToVtt(decodeSubtitleBuffer(decodedBuf));
        return new Response(req.method === "HEAD" ? null : text, {
          status: 200,
          headers: {
            ...SECURITY_HEADERS,
            "Content-Type": "text/vtt; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=86400"
          }
        });
      } catch (err) {
        return jsonResponse(
          { error: err instanceof HttpError ? err.message : "Service de sous-titres indisponible." },
          err instanceof HttpError ? err.status : 502
        );
      }
    }
    if (pathname === "/api/embedded-subtitles") {
      const streamBackendUrl = getStreamBackendUrl();
      const safeUrl = normalizeAllowedUrl(query.url);
      if (!streamBackendUrl || !safeUrl) {
        return jsonResponse({ success: true, subtitles: [] });
      }
      try {
        const r = await fetch(`${streamBackendUrl}/api/embedded-subtitles?url=${encodeURIComponent(safeUrl)}`, {
          redirect: "error",
          signal: AbortSignal.timeout(4e3)
        });
        if (!r.ok) return jsonResponse({ success: true, subtitles: [] });
        const data = await r.json();
        const subs = Array.isArray(data?.subtitles) ? data.subtitles.map((s) => ({
          ...s,
          url: typeof s.url === "string" && s.url.startsWith("/api/embedded-subtitles-vtt?") ? `${streamBackendUrl}${s.url}` : s.url
        })) : [];
        return jsonResponse({ success: true, subtitles: subs });
      } catch {
        return jsonResponse({ success: true, subtitles: [] });
      }
    }
    if (pathname === "/api/subtitles") {
      const { id, imdbId: queryImdbId, type = "movie", season = 1, episode = 1, filename = "" } = query;
      const safeType = type === "tv" ? "tv" : "movie";
      const safeSeason = positiveInteger(season, 1e4) ? Number(season) : 1;
      const safeEpisode = positiveInteger(episode, 1e4) ? Number(episode) : 1;
      const safeFilename = String(filename || "").slice(0, 260);
      try {
        let imdbId = /^tt\d{5,10}$/i.test(String(queryImdbId || "")) ? String(queryImdbId).toLowerCase() : null;
        if (!imdbId && TMDB_API_KEY && positiveInteger(id)) {
          try {
            const extUrl = tmdbUrl(safeType === "tv" ? `tv/${id}/external_ids` : `movie/${id}/external_ids`, {}, TMDB_API_KEY);
            const extRes = await fetch(extUrl, { signal: AbortSignal.timeout(3500) });
            if (extRes.ok) {
              const extData = await extRes.json();
              if (/^tt\d{5,10}$/.test(String(extData.imdb_id || ""))) {
                imdbId = extData.imdb_id;
              }
            }
          } catch {
          }
        }
        const formatted = [];
        const cleanImdb = imdbId ? imdbId.replace("tt", "") : null;
        if (cleanImdb) {
          const fetchOsLang = async (osLang, timeoutMs) => {
            try {
              const osUrl = safeType === "tv" ? `https://rest.opensubtitles.org/search/sublanguageid-${osLang}/imdbid-${cleanImdb}/season-${safeSeason}/episode-${safeEpisode}` : `https://rest.opensubtitles.org/search/sublanguageid-${osLang}/imdbid-${cleanImdb}`;
              const osRes = await fetch(osUrl, { headers: { "User-Agent": "TemporaryUserAgent" }, signal: AbortSignal.timeout(timeoutMs) });
              if (!osRes.ok) return [];
              const osData = await osRes.json();
              return Array.isArray(osData) ? osData : [];
            } catch {
              return [];
            }
          };
          const [frRaw, enRaw] = await Promise.all([
            fetchOsLang("fre", 4e3),
            fetchOsLang("eng", 3500)
          ]);
          rankOpenSubtitles(frRaw, { filename: safeFilename, limit: 4 }).forEach(({ item: s, hint }, idx) => {
            formatted.push({
              id: `fr-os-${idx}`,
              label: idx === 0 ? "Fran\xE7ais" : `Fran\xE7ais (Option ${idx + 1})`,
              hint,
              fps: parseFloat(s.MovieFPS) || null,
              lang: "fr",
              url: `/api/subtitles-vtt?url=${encodeURIComponent(s.SubDownloadLink)}`
            });
          });
          rankOpenSubtitles(enRaw, { filename: safeFilename, limit: 3 }).forEach(({ item: s, hint }, idx) => {
            formatted.push({
              id: `en-os-${idx}`,
              label: idx === 0 ? "Anglais" : `Anglais (Option ${idx + 1})`,
              hint,
              fps: parseFloat(s.MovieFPS) || null,
              lang: "en",
              url: `/api/subtitles-vtt?url=${encodeURIComponent(s.SubDownloadLink)}`
            });
          });
        }
        if (formatted.length === 0 && imdbId) {
          try {
            const stremPath = safeType === "tv" ? `https://opensubtitles-v3.strem.io/subtitles/series/${imdbId}:${safeSeason}:${safeEpisode}.json` : `https://opensubtitles-v3.strem.io/subtitles/movie/${imdbId}.json`;
            const stremRes = await fetch(stremPath, { redirect: "error", signal: AbortSignal.timeout(3500) });
            if (stremRes.ok) {
              const data = await stremRes.json();
              const list = Array.isArray(data?.subtitles) ? data.subtitles : [];
              let frAdded = 0;
              let enAdded = 0;
              for (const s of list) {
                const rawLang = String(s.lang || "").toLowerCase();
                const isFr = rawLang === "fre" || rawLang === "fra" || rawLang === "fr";
                const isEn = rawLang === "eng" || rawLang === "en";
                if (!isFr && !isEn) continue;
                if (isFr && frAdded >= 3) continue;
                if (isEn && enAdded >= 2) continue;
                const safeSubUrl = normalizeAllowedSubtitleUrl(s.url);
                if (!safeSubUrl) continue;
                if (isFr) {
                  frAdded++;
                  formatted.push({
                    id: `strem-fr-${frAdded}`,
                    label: frAdded === 1 ? "Fran\xE7ais" : `Fran\xE7ais (Option ${frAdded})`,
                    lang: "fr",
                    url: `/api/subtitles-vtt?url=${encodeURIComponent(safeSubUrl)}`
                  });
                } else {
                  enAdded++;
                  formatted.push({
                    id: `strem-en-${enAdded}`,
                    label: enAdded === 1 ? "Anglais" : `Anglais (Option ${enAdded})`,
                    lang: "en",
                    url: `/api/subtitles-vtt?url=${encodeURIComponent(safeSubUrl)}`
                  });
                }
              }
            }
          } catch {
          }
        }
        return jsonResponse({ success: true, subtitles: formatted }, 200, {
          "Cache-Control": "public, max-age=1800"
        });
      } catch {
        return jsonResponse({ success: true, subtitles: [] });
      }
    }
    if (pathname === "/api/documentaries/categories") {
      return jsonResponse({
        success: true,
        total_categories: DOCUMENTARY_CATEGORIES.length,
        categories: DOCUMENTARY_CATEGORIES
      }, 200, { "Cache-Control": "public, max-age=3600" });
    }
    if (pathname === "/api/documentaries/arte") {
      try {
        const limit = arteLimit(query.limit);
        const cacheKey = `arte_api_${limit}`;
        const cachedData = memoryCache.get(cacheKey);
        if (cachedData) {
          return jsonResponse({ ...cachedData, cached: true }, 200, { "Cache-Control": "public, max-age=900" });
        }
        const data = await fetchJson(`https://api.arte.tv/api/opa/v3/programs/fr?limit=${limit}`);
        const docs = (data.programs || []).map((item) => ({
          id: item.id,
          title: item.title,
          subtitle: item.subtitle || "",
          teaser: item.teaserText || item.description || "",
          poster: item.images?.landscape?.url || item.images?.portrait?.url || null,
          duration: item.duration ? Math.round(item.duration / 60) + " min" : null,
          player_embed: `https://www.arte.tv/player/v7/index.html?json_url=https://api.arte.tv/api/player/v2/config/fr/${item.id}`,
          language: "VF (Fran\xE7ais)"
        }));
        const payload = {
          success: true,
          category: "Documentaires ARTE TV",
          total: docs.length,
          documentaries: docs
        };
        memoryCache.set(cacheKey, payload, 15 * 60 * 1e3);
        return jsonResponse(payload, 200, { "Cache-Control": "public, max-age=900" });
      } catch (error) {
        return jsonResponse(
          { success: false, error: error instanceof HttpError ? error.message : "Service ARTE indisponible." },
          error.status || 502
        );
      }
    }
    return jsonResponse({ success: false, error: "Route API introuvable." }, 404);
  } catch (fatalErr) {
    console.error("[Netlify Function api] Fatal unhandled error:", fatalErr);
    return new Response(JSON.stringify({
      success: false,
      error: "Erreur interne du serveur (Netlify Function)."
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}
async function universalHandler(reqOrEvent, context) {
  const isFetchApi = reqOrEvent && typeof reqOrEvent.text === "function" && typeof reqOrEvent.headers?.get === "function";
  let request;
  if (isFetchApi) {
    request = reqOrEvent;
  } else {
    const event = reqOrEvent || {};
    const method = event.httpMethod || "GET";
    const rawHeaders = event.headers || {};
    const host = rawHeaders["host"] || "altyflix.netlify.app";
    const proto = rawHeaders["x-forwarded-proto"] || "https";
    const path = event.path || "/api";
    const qs = event.rawQuery || (event.queryStringParameters ? new URLSearchParams(event.queryStringParameters).toString() : "");
    const fullUrl = `${proto}://${host}${path}${qs ? `?${qs}` : ""}`;
    const headers = new Headers();
    for (const [k, v] of Object.entries(rawHeaders)) {
      if (v != null) headers.set(k, String(v));
    }
    const body = method !== "GET" && method !== "HEAD" && event.body ? event.isBase64Encoded ? Buffer.from(event.body, "base64") : event.body : void 0;
    request = new Request(fullUrl, { method, headers, body });
  }
  const response = await handleRequest(request, context);
  if (isFetchApi) {
    return response;
  }
  const resHeaders = {};
  response.headers.forEach((v, k) => {
    resHeaders[k] = v;
  });
  const textBody = await response.text();
  return {
    statusCode: response.status,
    headers: resHeaders,
    body: textBody
  };
}
var handler = universalHandler;
var config = {
  path: ["/api", "/api/*"]
};
export {
  config,
  universalHandler as default,
  getStreamBackendUrl,
  handler
};
