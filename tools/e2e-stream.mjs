import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {once} from 'node:events';
import {writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
import backend from '../server/server-vf-api.cjs';
const root=process.cwd();
backend.listen(0,'127.0.0.1');await once(backend,'listening');
const profile = { id: 'ui-test-profile', userId: 'ui-test-user', name: 'Tylian', language: 'fr', avatar: '/avatars/users-1.png', autoplayTrailers: false, autoplayNext: false };
// Only this isolated Vite test server substitutes the account and profile.
// Catalogue requests and video playback exercise the real network.
const profileModule = `const profile=${JSON.stringify(profile)};
const history=[{contentId:96677,type:'tv',media_type:'tv',season:2,episode:3,progress:42,lastWatchedPosition:900,title:'Lupin'}];
const noop=async()=>({success:true});const empty=[];
const value={currentProfile:profile,profiles:[profile],loading:false,get watchHistory(){return JSON.parse(sessionStorage.getItem('fixtureHistory')||'[]');},myList:empty,addToHistory:async(c,s,e,progress,time)=>sessionStorage.setItem('fixtureHistory',JSON.stringify([{...c,contentId:c.id,season:s,episode:e,progress,lastWatchedPosition:time}])),markAsWatched:noop,addToMyList:noop,removeFromMyList:noop,isInMyList:()=>false,switchProfile:noop,updateProfile:noop,createProfile:noop,deleteProfile:noop,removeFromHistory:noop,clearWatchHistory:noop,patchHistoryItem:noop};
export const useProfile=()=>value; export const ProfileProvider=({children})=>children; export default {};`;
const server = await createServer({ root, optimizeDeps:{include:['hls.js']}, server: { host: '127.0.0.1', port: 0, proxy: {"/api":"http://127.0.0.1:"+backend.address().port} }, plugins: [{ name: 'local-ui-fixtures', enforce: 'pre', transform(code,id) {
  const path=id.replaceAll('\\','/').split('?')[0];
  if(path.endsWith('/features/auth/AuthContext.jsx')) return `const user={uid:'ui-test-user',email:'preview@example.invalid'};export const useAuth=()=>({currentUser:user,loading:false,logout:async()=>({success:true})});export const AuthProvider=({children})=>children;export const formatAuthErrorMessage=()=>'';export default {};`;
  if(path.endsWith('/features/profiles/ProfileContext.jsx')) return profileModule;
  if(path.endsWith('/core/config/firebase.js')) return `export const auth={currentUser:null};export const db={};export const isFirebaseConfigured=false;export default {};`;
  if(path.endsWith('/services/reviewService.js')) return `export const getReviewsByContent=async()=>[];export const getUserReview=async()=>null;export const addOrUpdateReview=async()=>({success:true});export const deleteReview=async()=>({success:true});`;
  if(path.endsWith('/services/statsService.js')) return `export const recordView=async()=>{};export const getTopWatched=async()=>[];export default {recordView,getTopWatched};`;
  return null;
} }] });
let browser;
try{
 await server.listen();
 const base='http://127.0.0.1:'+server.httpServer.address().port;
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:820}});page.setDefaultTimeout(30000);
 const errors=[];page.on('pageerror',err=>errors.push(err.message));
 await page.goto(base+'/movie/10378');
 await page.getByText('Disponible en lecture',{exact:true}).waitFor();
 const timeToStart=[];
 const play=async()=>{
  const start=performance.now();
  await page.getByRole('button',{name:/^(REGARDER|REPRENDRE)/i}).first().click();
  await page.waitForFunction(()=>{const v=document.querySelector('[role=dialog] video');return v && !v.paused && v.currentTime>0.1;},null,{timeout:45000});
  timeToStart.push(performance.now()-start);
  return page.locator('[role=dialog] video').first();
 };
 for(let i=0;i<5;i++){
  let v=await play();
  if(i===0){
   await v.evaluate(video=>{video.currentTime=40;});
   await page.waitForFunction(()=>document.querySelector('[role=dialog] video')?.currentTime>40.1);
   await v.evaluate(video=>{video.dataset.firstRendition='yes';video.dispatchEvent(new Event('error'));});
   await page.waitForFunction(()=>{const v=document.querySelector('[role=dialog] video');return v && !v.dataset.firstRendition && !v.paused && v.currentTime>40.2;},null,{timeout:45000});
   assert.equal(await page.locator('[role=dialog] iframe').count(),0);
  }else assert.ok(await v.evaluate(video=>video.currentTime)>39,'Expected resume position');
  await page.getByRole('button',{name:'Fermer le lecteur'}).click();
 }
 await page.setViewportSize({width:390,height:844});
 await page.goto(base+'/tv/96677');
 await page.getByText('Référencé au catalogue · aucune vidéo compatible',{exact:true}).waitFor();
 await page.getByRole('button',{name:/^REGARDER/i}).first().click();
 await page.getByText('Ce titre est au catalogue.',{exact:false}).waitFor();
 assert.equal(await page.locator('[role=dialog] iframe').count(),0);
 assert.equal(errors.length,0,errors.join(' | '));
 const result={date:new Date().toISOString(),scope:'Chrome, actual Mux HLS, test profile, real local API',count:timeToStart.length,clickToAdvancingVideoMs:timeToStart.map(Math.round),p95Ms:Math.round(Math.max(...timeToStart)),fallback:true,resume:true,unavailableEpisode:true};
 console.log(JSON.stringify(result));if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(result,null,2));
}finally{await browser?.close();await server.close();backend.closeAllConnections();backend.close();}
