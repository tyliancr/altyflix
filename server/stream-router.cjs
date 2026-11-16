const { safeUrl, probe } = require('./stream-network.cjs');
const { setTimeout: delay } = require('node:timers/promises');
const { performance } = require('node:perf_hooks');
const { HttpError } = require('./security.cjs');
const formats = ['mp4','hls','dash'];
const plain = v => typeof v === 'string' && v.length <= 180 ? v : '';
function clean(row, key, provider, now) {
  try {
    if (row.drm || row.key !== key || !formats.includes(row.format)) return null;
    const url = safeUrl(row.url,provider.hosts).href;
    const expires = row.expiresAt ? Date.parse(row.expiresAt) : Infinity;
    if (!(expires > now + 5000)) return null;
    const subtitles = (row.subtitles || []).slice(0,16).map(t => ({
      url:safeUrl(t.url,provider.hosts).href, language:plain(t.language), label:plain(t.label || t.language)
    }));
    const height = Number.isInteger(row.height) && row.height > 0 && row.height <= 4320 ? row.height : 0;
    const intro = row.intro && Number.isFinite(row.intro.start) && row.intro.start >= 0 &&
      Number.isFinite(row.intro.end) && row.intro.end > row.intro.start ? row.intro : null;
    return {url, format:row.format, language:plain(row.language)||'und', height,
      quality:height ? height+'p' : 'auto', subtitles, intro, credit:plain(row.credit),
      expiresAt: Number.isFinite(expires) ? new Date(expires).toISOString() : null};
  } catch {return null;}
}
function createRouter(providers, check = probe, timeout = 2200) {
  const cache = new Map(), pending = new Map();
  const stats = new Map(providers.map(p=>[p.id,{failures:0,openUntil:0,requests:0,success:0,latency:0}]));
  let inFlight=0;
  async function discover(p, key, uid) {
    const state=stats.get(p.id);
    if (state.openUntil>Date.now()) return {sources:[],failed:true};
    const signal=AbortSignal.timeout(timeout);
    const start=performance.now();
    state.requests++;
    try {
      const rows=await p.find({key,uid,signal});
      const candidates=rows.slice(0,6).map(r=>clean(r,key,p,Date.now())).filter(Boolean);
      const sources=[];
      // Limit media probes per provider. A failed rendition does not hide healthy ones.
      let cursor=0;
      async function worker(){
        while(cursor<candidates.length && !signal.aborted){
          const source=candidates[cursor++];
          for(let attempt=0;attempt<2;attempt++){
            try {
              if(await check(source,p.hosts,signal)) sources.push(source);
              break;
            } catch {
              if(attempt===0 && !signal.aborted) await delay(80,null,{signal});
            }
          }
        }
      }
      await Promise.all([worker(),worker()]);
      if(candidates.length && !sources.length) throw Error('No reachable media');
      state.failures=0; state.success++;
      state.latency=Math.round(performance.now()-start);
      return {sources:sources.map(s=>({...s,provider:p.id})),failed:false};
    } catch {
      if(++state.failures>=3) state.openUntil=Date.now()+15000;
      return {sources:[],failed:true};
    }
  }
  async function resolve({key,uid='',language='fr',supported=formats,downlink=100}) {
    const cacheKey=JSON.stringify([uid,key]);
    let item=cache.get(cacheKey);
    if(!item || item.until<=Date.now()){
      if(!pending.has(cacheKey)){
        if(inFlight>=24) throw new HttpError(429,'Résolution occupée.');
        inFlight++;
        const task=Promise.all(providers.filter(p=>p.public||uid).map(p=>discover(p,key,uid))).then(groups=>{
          const sources=groups.flatMap(g=>g.sources);
          const failed=groups.some(g=>g.failed);
          const until=Math.min(Date.now()+(failed?1000:sources.length?45000:5000),
            ...sources.filter(s=>s.expiresAt).map(s=>Date.parse(s.expiresAt)-5000));
          const record={sources,until,failed};
          if(cache.size>=500)cache.delete(cache.keys().next().value);
          cache.set(cacheKey,record);
          return record;
        }).finally(()=>{pending.delete(cacheKey);inFlight--;});
        pending.set(cacheKey,task);
      }
      item=await pending.get(cacheKey);
    }
    const max=downlink<2?480:downlink<5?720:downlink<15?1080:4320;
    function score(s){
      const state=stats.get(s.provider);
      const sub=s.subtitles.some(t=>t.language.startsWith('fr'));
      const preference=language==='vostfr' ? Number(sub && !s.language.startsWith('fr')) : Number(s.language.startsWith(language));
      return preference*100000 + (s.height>max && s.format==='mp4'?-s.height:Math.min(max,s.height))
        + 100*(state.success/Math.max(1,state.requests))-Math.min(100,state.latency/20);
    }
    const list=item.sources.filter(s=>supported.includes(s.format) && (!s.expiresAt||Date.parse(s.expiresAt)>Date.now()+3000))
      .sort((a,b)=>score(b)-score(a));
    return {type:key.split(':')[0],tmdbId:Number(key.split(':')[1]),status:list.length?'available':item.failed?'temporarily_unavailable':'unavailable',
      playback:list[0]||null, alternatives:list.slice(1),fallbackAvailable:list.length>1};
  }
  return {resolve, health:()=>({inFlight,cacheEntries:cache.size,providers:providers.map(p=>({id:p.id,...stats.get(p.id)}))}),
    providers:()=>providers.map(p=>({id:p.id,access:p.public?'public':'authenticated'}))};
}
module.exports={createRouter,formats};

