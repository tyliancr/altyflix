const { tmdbUrl,HttpError }=require('./security.cjs');
const cache=new Map(), loading=new Map();
const ids=new Map();
const cursors={movie:{page:1},tv:{page:1}};
let nextCheck=0, syncTask, blockedUntil=0;
function store(k,data,ttl,id){
  if(cache.size>=400) evict(cache.keys().next().value);
  cache.set(k,{data,until:Date.now()+ttl,id});
  if(id){
    if(!ids.has(id)) ids.set(id,new Set());
    ids.get(id).add(k);
  }
}
function evict(k){
  const id=cache.get(k)?.id;
  cache.delete(k);
  if(id){const keys=ids.get(id);keys?.delete(k);if(!keys?.size)ids.delete(id);}
}
async function upstream(url){
  if(Date.now()<blockedUntil) throw new HttpError(429,'Quota catalogue temporairement atteint.');
  const r=await fetch(url,{signal:AbortSignal.timeout(4500),redirect:'error'});
  if(r.status===429){blockedUntil=Date.now()+1000*Math.min(300,Math.max(1,Number(r.headers.get('retry-after'))||30));throw new HttpError(429,'Quota catalogue temporairement atteint.');}
  if(!r.ok)throw new HttpError(r.status===404?404:502,'Catalogue indisponible.');
  return r.json();
}
async function sync(key){
  if(!ids.size || !key || Date.now()<nextCheck || syncTask)return;
  nextCheck=Date.now()+60000;
  syncTask=Promise.all(Object.entries(cursors).map(async([type,c])=>{
    const day=t=>new Date(t).toISOString().slice(0,10);
    c.from ||= day(Date.now()-86400000); c.to ||= day(Date.now());
    const u=new URL('https://api.themoviedb.org/3/'+type+'/changes');
    u.search=new URLSearchParams({api_key:key,start_date:c.from,end_date:c.to,page:String(c.page)});
    const data=await upstream(u);
    for(const item of data.results||[])for(const k of ids.get(type+':'+item.id)||[])evict(k);
    if(c.page<Math.min(500,data.total_pages))c.page++;
    else {c.page=1;c.from=c.to;c.to=null;}
  })).finally(()=>{syncTask=null;});
  await syncTask;
}
async function catalogue(endpoint,params,key){
  const url=tmdbUrl(endpoint,params,key);
  const k=endpoint+'?'+new URLSearchParams(params);
  const hit=cache.get(k);if(hit?.until>Date.now())return hit.data;
  if(loading.has(k))return loading.get(k);
  if(loading.size>=32)throw new HttpError(429,'Catalogue occupé.');
  const task=(async()=>{
    await sync(key).catch(()=>{});
    const data=await upstream(url);
    const m=endpoint.match(/^(movie|tv)\/(\d+)(?:\/|$)/);
    store(k,data,m?600000:60000,m?m[1]+':'+m[2]:null);
    return data;
  })().finally(()=>loading.delete(k));
  loading.set(k,task);return task;
}
module.exports={catalogue};

