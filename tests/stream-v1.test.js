import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createRouter}=require('../server/stream-router.cjs');
const {providers}=require('../server/stream-providers.cjs');
const {safeUrl,publicLookup}=require('../server/stream-network.cjs');
const {handle}=require('../server/stream-api.cjs');
const hosts=new Set(['media.example']);
const key='movie:42';
const row=(change={})=>({key,url:'https://media.example/movie.mp4',format:'mp4',height:720,language:'fr',...change});
const provider=(find)=>({id:'test',public:true,hosts,find});
const resolve=(entries,opts={})=>createRouter([provider(async()=>entries)],async()=>true).resolve({key,...opts});

test('available movie, VF, VOSTFR, low bandwidth and compatible formats',async()=>{
 const rows=[row({height:2160}),row({height:480}),row({language:'en',subtitles:[{language:'fr',url:'https://media.example/fr.vtt'}]})];
 assert.equal((await resolve(rows)).playback.language,'fr');
 assert.equal((await resolve(rows,{language:'vostfr'})).playback.language,'en');
 assert.equal((await resolve(rows,{downlink:1})).playback.height,480);
 assert.equal((await resolve(rows,{supported:['dash']})).status,'unavailable');
});
test('missing episode never substitutes another episode or film; expired URL is discarded',async()=>{
 const r=createRouter([provider(async({key:k})=>[row({key:'tv:9:1:2'}),row({key:'tv:9:2:1'})].filter(x=>x.key===k))],async()=>true);
 for(const k of ['tv:9:1:2','tv:9:2:1'])assert.equal((await r.resolve({key:k})).status,'available');
 assert.equal((await r.resolve({key:'tv:9:2:2'})).status,'unavailable');
 assert.equal((await resolve([row({expiresAt:new Date(Date.now()-100).toISOString()})])).status,'unavailable');
});
test('private library entitlements and cache isolation',async()=>{
 const list=providers({STREAM_LIBRARY_HOSTS:'media.example',STREAM_LIBRARY_JSON:JSON.stringify([row({externalPlayback:true,allowedUids:['alice']})])});
 const router=createRouter(list,async()=>true);
 for(const uid of ['alice','bob',''])assert.equal((await router.resolve({key,uid})).status,uid==='alice'?'available':'unavailable');
});
test('provider failure, healthy fallback and circuit breaker',async()=>{
 let calls=0;
 const broken={...provider(async()=>{calls++;throw Error('offline');}),id:'bad'};
 const router=createRouter([broken,provider(async({key:k})=>[row({key:k})])],async()=>true);
 for(const n of [1,2,3,4])assert.equal((await router.resolve({key:'movie:'+n})).playback.provider,'test');
 assert.equal(calls,3);assert.ok(router.health().providers[0].openUntil>Date.now());
});
test('coalesces concurrent identical lookups and filters unreachable media',async()=>{
 let calls=0;const router=createRouter([provider(async()=>{calls++;return [row(),row({url:'https://media.example/bad'})];})],async s=>!s.url.endsWith('/bad'));
 const data=await Promise.all(Array.from({length:25},()=>router.resolve({key})));assert.equal(calls,1);
 assert.ok(data.every(x=>x.status==='available'&&!x.fallbackAvailable));
});
test('rejects SSRF, private DNS answers, injections and unauthenticated progress',async()=>{
 for(const u of ['http://media.example/x','https://media.example.evil/x','https://u@media.example/x','https://media.example:9000/x','https://127.0.0.1/x'])assert.throws(()=>safeUrl(u,hosts));
 await new Promise(resolve=>publicLookup('localhost',{},err=>{assert.ok(err);resolve();}));
 for(const path of ['/api/movies/1%2f2','/api/stream/tv/1/1/0','/api/stream/movie/3?x='])assert.ok((await handle({path})).status>=400);
 const params={type:'movie',tmdbId:'42',profileId:'abc'};
 assert.equal((await handle({path:'/api/playback/progress',params})).status,401);
 assert.equal((await handle({path:'/api/playback/progress',method:'POST',body:'x'.repeat(5000)})).status,413);
});
test('progress API writes and reads authenticated viewer document, refuses bad time',async()=>{
 const original=global.fetch;const saved={};const token='Bearer '+'a'.repeat(40);
 process.env.FIREBASE_WEB_API_KEY='test';process.env.FIREBASE_PROJECT_ID='demo-test';
 global.fetch=async(url,options)=>{if(String(url).startsWith('https://identitytoolkit'))return Response.json({users:[{localId:'alice'}]});
 assert.match(String(url),/users\/alice\/profiles\/p\/playback\/movie%3A42$/);assert.equal(options.headers.Authorization,token);
 if(options.body)Object.assign(saved,JSON.parse(options.body));return Response.json(saved);};
 try{
 const params={type:'movie',tmdbId:42,profileId:'p',position:12,duration:120};
 const call=(method,data=params)=>handle({path:'/api/playback/progress',method,params:data,body:JSON.stringify(data),auth:token});
 assert.deepEqual((await call('POST')).data,{position:12,duration:120});assert.equal((await call('GET')).data.position,12);
 assert.equal((await call('POST',{...params,position:300})).status,400);
 }finally{global.fetch=original;}
});
test('concurrent searches share catalogue request and preserve pagination',async()=>{
 const original=global.fetch;let calls=0;process.env.TMDB_API_KEY='test';
 global.fetch=async url=>{calls++;assert.equal(new URL(url).searchParams.get('page'),'2');return Response.json({page:2,results:[{id:42}]});};
 try{const all=await Promise.all(Array.from({length:30},()=>handle({path:'/api/search',params:{q:'alice',page:2}})));assert.equal(calls,1);assert.ok(all.every(r=>r.data.page===2));}finally{global.fetch=original;}
});

