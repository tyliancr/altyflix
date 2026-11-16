/**
 * Conversion SubRip (.srt) → WebVTT.
 * Accepte un Buffer (UTF-8 avec ou sans BOM, sinon Windows-1252) ou une chaîne.
 */
export function srtToVtt(input, { hls = false } = {}) {
  let text = input;
  if (typeof input !== 'string') {
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(input);
    } catch {
      // Beaucoup de .srt français sont en Windows-1252 : sans ce repli, les accents sont perdus.
      text = new TextDecoder('windows-1252').decode(input);
    }
  }
  text = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim();

  const cues = [];
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split('\n');
    const timeIndex = lines.findIndex(line => line.includes('-->'));
    if (timeIndex === -1) continue;
    const match = lines[timeIndex].match(/(\d+):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d+):(\d{2}):(\d{2})[,.](\d{1,3})/);
    if (!match) continue;
    const stamp = (h, m, s, ms) => `${h.padStart(2, '0')}:${m}:${s}.${ms.padEnd(3, '0')}`;
    const body = lines.slice(timeIndex + 1).join('\n')
      .replace(/\{\\an?\d+\}/g, '') // balises de position ASS
      .replace(/<\/?font[^>]*>/gi, '')
      .trim();
    if (!body) continue;
    cues.push(`${stamp(...match.slice(1, 5))} --> ${stamp(...match.slice(5, 9))}\n${body}`);
  }

  // X-TIMESTAMP-MAP : exigé par Safari pour synchroniser du WebVTT servi en HLS.
  const header = hls ? 'WEBVTT\nX-TIMESTAMP-MAP=MPEGTS:0,LOCAL:00:00:00.000' : 'WEBVTT';
  return `${header}\n\n${cues.join('\n\n')}\n`;
}
