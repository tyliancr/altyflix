const https = require('node:https');
const dns = require('node:dns');
const ipaddr = require('ipaddr.js');

function safeUrl(raw, allowed) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash ||
      (url.port && url.port !== '443') || !allowed.has(url.hostname) ||
      ipaddr.isValid(url.hostname.replace(/^\[|\]$/g, ''))) throw Error('Disallowed URL');
  return url;
}

// Validate and use the same DNS answer for the connection, including IPv4-mapped IPv6.
function publicLookup(host, options, done) {
  dns.lookup(host, { all: true, family: options.family || 0 }, (err, records) => {
    if (err) return done(err);
    if (!records.length || records.some(r => ipaddr.process(r.address).range() !== 'unicast')) {
      return done(Error('Private address'));
    }
    return options.all ? done(null, records) : done(null, records[0].address, records[0].family);
  });
}
function requestBytes(raw, allowed, { signal, headers = {}, limit = 65536, prefix = false } = {}) {
  const url = safeUrl(raw, allowed);
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers, lookup: publicLookup, signal, agent: false }, res => {
      if (![200,206].includes(res.statusCode)) {
        res.destroy();
        return reject(Error('Upstream rejected request'));
      }
      const parts = [];
      let size = 0;
      res.on('error', reject);
      res.on('data', chunk => {
        const remaining = limit - size;
        parts.push(chunk.subarray(0, remaining));
        size += chunk.length;
        if (prefix && size >= limit) {
          resolve(Buffer.concat(parts)); res.destroy();
        } else if (size > limit) {
          reject(Error('Response too large')); res.destroy();
        }
      });
      res.on('end', () => resolve(Buffer.concat(parts)));
    });
    request.on('error', reject);
  });
}
async function probe(source, allowed, signal) {
  const bytes = await requestBytes(source.url, allowed, {
    signal, headers: { Range: 'bytes=0-2047' }, prefix: true, limit: 2048
  });
  const text = bytes.toString('utf8').trimStart();
  return source.format === 'mp4' ? bytes.toString('ascii',4,8) === 'ftyp' :
    source.format === 'hls' ? text.startsWith('#EXTM3U') : /<MPD[\s>]/.test(text);
}
module.exports = { safeUrl, publicLookup, requestBytes, probe };

