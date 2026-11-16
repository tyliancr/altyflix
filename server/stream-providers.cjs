const { requestBytes } = require('./stream-network.cjs');
const demoUrl = 'https://test-streams.mux.dev/x36xhzz/';
const demo = {
  id: 'blender-demo', public: true, hosts: new Set(['test-streams.mux.dev']),
  async find({ key }) {
    if (key !== 'movie:10378') return [];
    return [
      ['x36xhzz.m3u8',1080], ['url_6/193039199_mp4_h264_aac_hq_7.m3u8',480]
    ].map(([path,height]) => ({
      key, url: demoUrl + path, format: 'hls', language: 'zxx', height,
      credit: 'Big Buck Bunny © Blender Foundation · CC BY 3.0 · Flux de démonstration Mux'
    }));
  }
};
function hostSet(value = '') {
  return new Set(value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
}
// StreamProvider: id, public, hosts, async find({key, uid, signal}) -> Source[].
// Non-public providers are called only after Firebase verifies the viewer.
function providers(env = process.env) {
  const result = [demo];
  if (env.STREAM_LIBRARY_JSON) {
    const rows = JSON.parse(env.STREAM_LIBRARY_JSON);
    if (!Array.isArray(rows) || rows.length > 10000) throw Error('Invalid library');
    const index = new Map();
    for (const row of rows) {
      const list = index.get(row.key) || [];
      list.push(row); index.set(row.key, list);
    }
    result.push({ id:'personal-library', public:false, hosts:hostSet(env.STREAM_LIBRARY_HOSTS),
      async find({key, uid}) {
        return (index.get(key) || []).filter(r => r.externalPlayback === true &&
          Array.isArray(r.allowedUids) && r.allowedUids.includes(uid));
      }
    });
  }
  if (env.STREAM_PARTNER_ENDPOINT && env.STREAM_PARTNER_TOKEN) {
    result.push({ id:'licensed-partner', public:false, hosts:hostSet(env.STREAM_PARTNER_MEDIA_HOSTS),
      async find({key, uid, signal}) {
        const url = new URL(env.STREAM_PARTNER_ENDPOINT);
        url.searchParams.set('key',key); url.searchParams.set('viewer',uid);
        const raw = await requestBytes(url, hostSet(env.STREAM_PARTNER_API_HOSTS), {
          signal, headers:{Authorization:'Bearer '+env.STREAM_PARTNER_TOKEN}
        });
        const data = JSON.parse(raw);
        if (data.viewer !== uid || data.key !== key || data.externalPlayback !== true) return [];
        return Array.isArray(data.sources) ? data.sources.filter(r => r.expiresAt) : [];
      }
    });
  }
  return result;
}
module.exports = { providers, demo };

