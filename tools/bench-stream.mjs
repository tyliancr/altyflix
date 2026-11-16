import server from '../server/server-vf-api.cjs';
import {once} from 'node:events';
import {performance} from 'node:perf_hooks';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
server.listen(0,'127.0.0.1');await once(server,'listening');
const base='http://127.0.0.1:'+server.address().port;
const result={date:new Date().toISOString(),environment:'Local Node HTTP, real TMDB and Mux, no CDN',samples:{}};
async function measure(path,validate){
 const start=performance.now();const res=await fetch(base+path);assert.equal(res.status,200,path);
 validate(await res.json());return performance.now()-start;
}
const p95=ms=>Math.round(ms.sort((a,b)=>a-b)[Math.ceil(ms.length*.95)-1]*100)/100;
try{
 for(const [name,path,validate] of [
  ['search','/api/search?q=interstellar',r=>assert.ok(r.results.length)],
  ['metadata','/api/movies/10378',r=>assert.equal(r.id,10378)],
  ['resolve','/api/stream/movie/10378',r=>assert.equal(r.status,'available')]
 ]){
  const cold=await measure(path,validate);const timings=[];
  for(let i=0;i<5;i++)timings.push(...await Promise.all(Array.from({length:6},()=>measure(path,validate))));
  result.samples[name]={coldSingleMs:Math.round(cold),warmCount:timings.length,concurrency:6,warmP95Ms:p95(timings)};
 }
 const uncached=[];
 for(const q of ['Lupin','Matrix','Arrival','Alien','Up','Avatar','Jaws','Amélie']){
  uncached.push(await measure('/api/search?q='+encodeURIComponent(q),r=>assert.ok(r.results.length)));
 }
 result.coldHttpSearch={count:uncached.length,p95Ms:p95(uncached)};
 // Cold discovery in independent router instances (network and resolver only).
 const {createRouter}=await import('../server/stream-router.cjs');
 const {providers}=await import('../server/stream-providers.cjs'); const cold=[];
 for(let i=0;i<8;i++){
  const router=createRouter(providers());const start=performance.now();
  assert.equal((await router.resolve({key:'movie:10378'})).status,'available');cold.push(performance.now()-start);
 }
 result.coldDiscovery={count:cold.length,p95Ms:p95(cold)};
 console.log(JSON.stringify(result,null,2));if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(result,null,2));
}finally{server.closeAllConnections();server.close();}

