/**
 * Module partagé de parsing des flux Torrentio / Debrid
 * Utilisé par le serveur (server/stream-resolver.cjs) et le fallback client (src/services/streamingGateway.js).
 */

function parseBytes(str) {
  if (!str) return 0;
  const m = String(str).match(/([\d.]+)\s*([KMGT]B)/i);
  if (!m) return 0;
  const val = parseFloat(m[1]);
  const unit = m[2].toUpperCase();
  if (unit === 'KB') return val * 1024;
  if (unit === 'MB') return val * 1024 * 1024;
  if (unit === 'GB') return val * 1024 * 1024 * 1024;
  if (unit === 'TB') return val * 1024 * 1024 * 1024 * 1024;
  return val;
}

function isDownloadingUrl(urlStr) {
  if (!urlStr) return false;
  const clean = String(urlStr).toLowerCase();
  return clean.includes('downloading_') || clean.includes('/videos/downloading') || clean.includes('downloading.mp4') || clean.includes('slate.elfhosted.com') || clean.includes('slate.mp4') || clean.includes('slate.m3u8') || clean.includes('docs.elfhosted.com');
}

function isTorrentioErrorStream(stream) {
  if (!stream) return true;
  const url = String(stream.url || '');
  const title = String(stream.title || stream.description || '').toLowerCase();
  const name = String(stream.name || '').toLowerCase();
  const fullText = (title + ' ' + name).toLowerCase();

  if (url.includes('failed_access') || url.includes('/videos/failed_') || url.includes('slate.elfhosted.com') || url.includes('slate.') || url.includes('docs.elfhosted.com')) return true;
  if (isDownloadingUrl(url)) return true;
  if (name.includes('[❌]') || fullText.includes('obsolete configuration') || /\b(?:tb|rd|ad|pm|dl)?\s*error\b/i.test(name)) return true;
  if (/(?:invalid\s+(?:api|token|key|debrid|auth)|access\s+denied|rate\s+limit\s+exceeded|failed\s+to\s+(?:resolve|access|connect)|not\s+a\s+valid\s+debrid)/i.test(fullText)) return true;

  return false;
}

function parseStreamDetails(stream, { isFrenchOriginal = false } = {}) {
  const rawTitle = stream.title || stream.description || '';
  const rawName = stream.name || '';
  const filename = stream.behaviorHints?.filename || rawTitle.split('\n')[0] || '';
  const fullText = (rawTitle + ' ' + rawName + ' ' + filename).toLowerCase().replace(/_/g, ' ');

  let isCached = /\[(?:tb|rd|ad|pm|dl)?(?:\+|⚡)\]/i.test(rawName) || /\[\+\]/.test(rawName) || rawName.includes('⚡') || Boolean(stream.isTorboxLibrary);
  let isDownloading = !isCached && (rawName.includes('⬇️') || /\[(?:tb|rd|ad|pm|dl)\s+download\]/i.test(rawName) || /download/i.test(rawName));
  if (typeof stream._torboxVerifiedCached === 'boolean') {
    isCached = stream._torboxVerifiedCached;
    isDownloading = !isCached;
  }

  let resolution = '1080p FHD';
  let tierKey = '1080p';
  if (/\b(?:4k|2160p|uhd)\b/i.test(fullText)) {
    resolution = '4K Ultra HD';
    tierKey = '4k';
  } else if (/\b(?:1080p|fhd)\b/i.test(fullText)) {
    resolution = '1080p FHD';
    tierKey = '1080p';
  } else if (/\b720p\b/i.test(fullText)) {
    resolution = '720p HD';
    tierKey = '720p';
  } else if (/\b(?:480p|360p|sd|dvdrip|xvid|divx)\b/i.test(fullText)) {
    resolution = '480p SD';
    tierKey = '480p';
  } else if (/\bhd\b/i.test(fullText)) {
    resolution = '720p HD';
    tierKey = '720p';
  }

  const titleLines = rawTitle.split('\n');
  const mainReleaseName = (titleLines[0] || '').toLowerCase().replace(/_/g, ' ');
  const metaLines = titleLines.slice(1).join('\n').toLowerCase().replace(/_/g, ' ');
  const cleanFilename = filename.toLowerCase().replace(/_/g, ' ');
  const nameNoMultiSub = mainReleaseName.replace(/\bmulti[\s._-]*subs?\b/gi, '');
  const fileNoMultiSub = cleanFilename.replace(/\bmulti[\s._-]*subs?\b/gi, '');

  const isExplicitVostfr = /\b(?:vostfr|subfrench|fansub[\s._-]*vostfr|vost)\b/i.test(fullText) ||
    /\b(?:vostfr|subfrench)\b/i.test(filename) ||
    metaLines.includes('subfrench') ||
    metaLines.includes('vostfr') ||
    (metaLines.includes('multi subs') && !metaLines.includes('multi audio') && !rawTitle.toLowerCase().includes('multi audio'));

  const hasFrenchFlag = rawTitle.includes('🇫🇷');
  const hasEnglishFlag = rawTitle.includes('🇬🇧') || rawTitle.includes('🇺🇸');
  const hasForeignFlag = rawTitle.includes('🇮🇹') || rawTitle.includes('🇪🇸') || rawTitle.includes('🇩🇪') || rawTitle.includes('🇷🇺') || rawTitle.includes('🇯🇵') || rawTitle.includes('🇧🇷') || rawTitle.includes('🇵🇹') || rawTitle.includes('🇮🇳');
  const isMultiFlagVostfr = hasFrenchFlag && (hasEnglishFlag || hasForeignFlag);

  const isTorrent9 = fullText.includes('torrent9') || fullText.includes('oxtorrent') || fullText.includes('cpasbien');
  const isFrenchGroup = /\b(?:extreme|pop|f4st|supply|bll|fw|fr5|wawacity|torrent9|qtz|dav1nci|gh0st|duff|ulysse|batgirl|glados|slay3r|nbdy|rzp|jaskier|andremor|zone-telechargement|zt|wawa)\b/i.test(fullText);

  const hasFrenchDubInName = /\b(?:truefrench|vff|vfq|vfi|vf2|french|francais|audio[\s._-]*fr|vf[\s._-]*hd|fr-ca)\b/i.test(nameNoMultiSub) ||
    /\b(?:truefrench|vff|vfq|vfi|vf2|french|francais|audio[\s._-]*fr|vf[\s._-]*hd|fr-ca)\b/i.test(fileNoMultiSub) ||
    /\b(?:truefrench|vff|vfq|vfi|vf2|french|francais)\b/i.test(mainReleaseName) ||
    /\bvf\b/i.test(mainReleaseName) ||
    /\bvf\b/i.test(cleanFilename) ||
    /\b(?:fr-en|en-fr|fr\/en|en\/fr|fre-aac)\b/i.test(mainReleaseName);

  const isSceneMulti = /\b(?:multi|multisite)\b/i.test(mainReleaseName) || /\b(?:multi)\b/i.test(cleanFilename);
  const isForeignOnlyMulti = /\b(?:tam\s*\+\s*hin|dub\s*\+\s*(?:\d+x\s*)?mvo|ita\s*[-/]\s*eng|ger\s*[-/]\s*eng|spa\s*[-/]\s*eng|latino|hindi|tamil|telugu|rus\s*[-/]\s*eng)\b/i.test(fullText);

  const isInternationalMultiWithoutFr = isMultiFlagVostfr || (
    (isSceneMulti || /\bmulti\s*audio\b/i.test(fullText)) &&
    !isTorrent9 &&
    !isFrenchGroup &&
    !hasFrenchDubInName &&
    !isFrenchOriginal
  );

  const isFrenchMulti = isSceneMulti && !isForeignOnlyMulti && !isInternationalMultiWithoutFr && (
    isTorrent9 ||
    isFrenchGroup ||
    hasFrenchDubInName ||
    /\b(?:vff|vf2|vfq|vfi|truefrench)\b/i.test(fullText) ||
    (hasFrenchFlag && !isMultiFlagVostfr && !/\b(?:thepiratebay|1337x|rarbg|torrentgalaxy|rutor|rutracker)\b/i.test(fullText))
  );

  const isEnglishPrimaryMulti = isInternationalMultiWithoutFr ||
    /\b(?:en(?:g)?\s*[/|-]\s*(?:ita|es|fr|de|ger|spa|multi))\b/i.test(rawTitle) ||
    /\b(?:en\/ita\/fr|en\/fr|en\/es|english.*french|eng\s*[/|-]\s*fre)\b/i.test(fullText) ||
    /\b(?:multi(?:ple)?\s*audio.*(?:en|eng|english))\b/i.test(fullText) ||
    /\b(?:dual.*(?:eng|en))\b/i.test(fullText);

  const isForeignPrimaryMulti = isEnglishPrimaryMulti ||
    /\b(?:dub\s*\+\s*(?:\d+x\s*)?mvo|rus\s*[/|-]\s*eng)\b/i.test(fullText) ||
    /\b(?:ita\s*[-/]\s*eng|ger\s*[-/]\s*eng|spa\s*[-/]\s*eng|ita[/._-]*ac3|ger[/._-]*ac3|spa[/._-]*ac3)\b/i.test(fullText);

  const isNonFrenchDub = /\b(?:german|deutsch|italian|italiano|spanish|espanol|castellano|portuguese|russian|japanese|korean|hindi|tamil)\s*dub\b/i.test(fullText) ||
    /\b(?:ita\s*[-/]\s*eng|ger\s*[-/]\s*eng|spa\s*[-/]\s*eng|latino|hindi|tamil|telugu)\b/i.test(fullText);

  const hasFrenchAudio = Boolean(!isExplicitVostfr && !isForeignPrimaryMulti && (
    hasFrenchDubInName ||
    isFrenchMulti ||
    (isTorrent9 && !isExplicitVostfr) ||
    (hasFrenchFlag && !isMultiFlagVostfr && !isInternationalMultiWithoutFr && !isExplicitVostfr) ||
    (isFrenchOriginal && !isNonFrenchDub)
  ));
  const isPureFrench = Boolean(hasFrenchAudio && !isEnglishPrimaryMulti);
  const isFrench = hasFrenchAudio;

  const isVostfr = !isFrench && Boolean(
    isExplicitVostfr ||
    isMultiFlagVostfr ||
    isEnglishPrimaryMulti ||
    metaLines.includes('subfrench') ||
    metaLines.includes('multi subs') ||
    metaLines.includes('vostfr') ||
    hasFrenchFlag
  );

  const isMp4 = /\.mp4(?:\?|$)/i.test(stream?.url || '') || /\.mp4(?:$|\?|\s|["')\]])/i.test(filename);
  const isAvi = /\.avi(?:\?|$)/i.test(stream?.url || '') || /\.avi(?:$|\?|\s|["')\]])/i.test(filename) || /\b(?:xvid|divx)\b/i.test(fullText);
  const isMkv = /\.mkv(?:\?|$)/i.test(stream?.url || '') || /\.mkv(?:$|\?|\s|["')\]])/i.test(filename) || (!isMp4 && !isAvi);

  const isAv1 = /\b(?:av1|d?av1nci|av01)\b/i.test(fullText);
  const isH265 = /\b(?:[xh][.\s_-]?265|hevc|10bit)\b/i.test(fullText);
  const isH264 = /\b(?:[xh][.\s_-]?264|avc(?:-?1)?)\b/i.test(fullText);

  const sizeMatch = rawTitle.match(/💾\s*([\d.]+\s*[KMGT]B)/i);
  const size = sizeMatch ? sizeMatch[1] : '';
  const sizeBytes = size ? parseBytes(size) : 0;

  const hasAac = /\b(?:he-?)?aac(?:\s*[-_.]?\s*[257](?:\s*[-_.]?\s*[01])?)?\b/i.test(fullText);
  const hasMp3 = /\bmp3\b/i.test(fullText);
  const hasOpus = /\bopus(?:\s*\.?\s*[257]\.?[01])?\b/i.test(fullText);
  const hasFlac = /\bflac\b/i.test(fullText);
  const hasFrenchStereoRip = /\b(?:ld|md|line[\s._-]*dub(?:bed)?|mic[\s._-]*dub(?:bed)?)\b/i.test(fullText) ||
    (/\b(?:hdtv|pdtv|dsr|tvrip)\b/i.test(fullText) && !/\b(?:5\.1|7\.1|ddp|eac3|ac3|dts)\b/i.test(fullText));
  const isWebAudioGroup = /\b(?:yts|yify|galaxytv|tgx|joy|ozlem|psa|megusta|qxr|tigole|utr|qman|ion10|ion265|kontrast|vyndros|minx|vxt|rapta|pir8|lordvako)\b/i.test(fullText);

  const has71Or8ch = !hasAac && /\b(?:7\.1|8ch)\b/i.test(fullText);
  const hasOpusMultichannel = !hasAac && /\bopus(?:\s*\.?\s*[7]\.?[01]|\s*\.?\s*8ch)\b/i.test(fullText);
  const hasMultichannelSilence = has71Or8ch || hasOpusMultichannel;

  const isAc3OrDdp = /(?:\bdd\+(?![a-z])|\b(?:ac3|ac-3|e-?ac-?3|eac3|ddp(?:\s*\.?\s*[257]\.?[01])?|dd\s*\.?\s*[257]\.?[01])\b)/i.test(fullText);
  const isDtsOrTrueHd = /(?:\b(?:truehd|atmos|dts(?:-?hd)?|dts-?x|dts-?ma|lpcm)\b)/i.test(fullText);
  const isDtsOrTrueHdWithoutAac = isDtsOrTrueHd && !hasAac;
  const hasUnsupportedAudioCodec = (isAc3OrDdp && !hasAac) || isDtsOrTrueHdWithoutAac;
  const hasExplicitWebAudio = Boolean(hasAac || hasMp3 || (hasOpus && !hasMultichannelSilence) || hasFlac || hasFrenchStereoRip);

  const isWebAudioSafe = Boolean(
    (hasExplicitWebAudio && !isDtsOrTrueHdWithoutAac && !hasMultichannelSilence) ||
    ((isWebAudioGroup || isMp4) && !hasUnsupportedAudioCodec && !hasMultichannelSilence)
  );

  const hasUnsupportedAudio = Boolean(
    (!hasExplicitWebAudio && (isAc3OrDdp || !isWebAudioSafe)) ||
    isDtsOrTrueHdWithoutAac ||
    hasMultichannelSilence
  );

  const isRemuxOrHeavyUnplayable = Boolean(
    (isDtsOrTrueHdWithoutAac && !hasExplicitWebAudio) ||
    /\b(?:remux|bdremux|uhd[\s._-]*remux)\b/i.test(fullText) ||
    (sizeBytes && sizeBytes > 35 * 1024 * 1024 * 1024)
  );

  const isMkvHevcUnplayable = Boolean(isMkv && isH265 && !isAv1 && isRemuxOrHeavyUnplayable);
  const isHighQualitySource = /\b(?:bluray|bdrip|brrip|web-?dl|web-?rip|hdtv)\b/i.test(fullText);
  const isCamOrLowQuality = /\b(?:cam|camrip|hdcam|telesync|ts|hdts|telecine|tc|scr|screener|dvdscr|r5|workprint|wp)\b/i.test(fullText);
  const isVffOrTrueFrench = /\b(truefrench|vff)\b/i.test(fullText);
  const isMulti = /\bmulti\b/i.test(fullText);
  const isProper = /\b(?:proper|repack|rerip)\b/i.test(fullText);
  const isTrustedGroup = /\b(?:extreme|pop|f4st|supply|bll|fw|fr5|wawacity|torrent9|qtz|dav1nci|gh0st|duff|yts|yify|vxt|galaxytv|tgx|qxr|tigole|utr|joy|psa|bone|minx|flux|ntb)\b/i.test(fullText);

  const seedsMatch = rawTitle.match(/👤\s*(\d+)/);
  const seeds = seedsMatch ? parseInt(seedsMatch[1], 10) : 0;

  let languageLabel = 'Version Originale';
  if (isFrenchOriginal && isFrench && !hasFrenchDubInName && !hasFrenchFlag) languageLabel = 'Français (Original)';
  else if (isPureFrench) languageLabel = 'Français (VF)';
  else if (isFrench) languageLabel = 'Français (MULTI · VF)';
  else if (isVostfr) languageLabel = 'VOSTFR (Sous-titres FR)';

  return {
    resolution,
    tierKey,
    isCached,
    isDownloading,
    isFrench,
    isVostfr,
    isWebAudioSafe,
    hasUnsupportedAudio,
    hasBadAudio: hasUnsupportedAudio,
    isDtsOrTrueHdWithoutAac,
    hasMultichannelSilence,
    isRemuxOrHeavyUnplayable,
    isH264,
    isH265,
    isAv1,
    isMp4,
    isAvi,
    isMkv,
    isMkvHevcUnplayable,
    isHighQualitySource,
    isCamOrLowQuality,
    isPureFrench,
    isVffOrTrueFrench,
    isMulti,
    isProper,
    isTrustedGroup,
    size,
    sizeBytes,
    seeds,
    filename: filename || 'Vidéo',
    languageLabel
  };
}

module.exports = {
  parseBytes,
  isDownloadingUrl,
  isTorrentioErrorStream,
  parseStreamDetails
};
