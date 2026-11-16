const {HttpError}=require('./security.cjs');
const {providers}=require('./stream-providers.cjs');
const {createRouter,formats}=require('./stream-router.cjs');
const {catalogue}=require('./stream-catalogue.cjs');
let router;
const bad=()=>new HttpError(400,'Paramètres invalides.');
function integer(s,max=1000000000){if(!/^[1-9]\d{0,9}$/.test(String(s))||Number(s)>max)throw bad();return Number(s);}
async function identity(auth){
  if(!/^Bearer [\w.\-]{20,8192}$/.test(auth||''))throw new HttpError(401,'Connexion requise.');
  const token=auth.slice(7);
  const key=process.env.VITE_FIREBASE_API_KEY||process.env.FIREBASE_WEB_API_KEY;
  if(!key)throw new HttpError(503,'Authentification serveur à configurer.');
  const r=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+encodeURIComponent(key),{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token}),signal:AbortSignal.timeout(3500)});
  if(!r.ok)throw new HttpError(r.status>=500?503:401,'Session à vérifier.');
  const user=(await r.json()).users?.[0];
  if(!user?.localId||user.disabled)throw new HttpError(401,'Session invalide.');
  return {uid:user.localId,token};
}
function mediaKey(type,id,s,e){return type==='movie'?'movie:'+integer(id):'tv:'+integer(id)+':'+integer(s,10000)+':'+integer(e,10000);}
async function progress(method,params,body,auth){
  if(!['GET','POST'].includes(method))throw new HttpError(405,'Méthode invalide.');
  let input=params;
  if(method==='POST'){
    try {input=JSON.parse(body);} catch {throw bad();}
  }
  if(!input || !['movie','tv'].includes(input.type)||!/^[-\w]{1,100}$/.test(input.profileId||''))throw bad();
  const key=mediaKey(input.type,input.tmdbId,input.season,input.episode);
  const {uid,token}=await identity(auth);
  const project=process.env.VITE_FIREBASE_PROJECT_ID||process.env.FIREBASE_PROJECT_ID;
  if(!/^[a-z0-9-]{4,63}$/.test(project||''))throw new HttpError(503,'Firestore à configurer.');
  const url='https://firestore.googleapis.com/v1/projects/'+project+'/databases/(default)/documents/users/'+encodeURIComponent(uid)+'/profiles/'+input.profileId+'/playback/'+encodeURIComponent(key);
  const options={headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},signal:AbortSignal.timeout(4000)};
  if(method==='POST'){
    const {position,duration}=input;
    if(!Number.isFinite(position)||!Number.isFinite(duration)||duration<=0||duration>604800||position<0||position>duration)throw bad();
    options.method='PATCH';options.body=JSON.stringify({fields:{position:{doubleValue:position},duration:{doubleValue:duration}}});
  }
  const r=await fetch(url,options);
  if(r.status===404&&method==='GET')return {position:0,duration:null};
  if(!r.ok)throw new HttpError([401,403].includes(r.status)?r.status:502,'Progression indisponible.');
  const f=(await r.json()).fields;return {position:Number(f.position.doubleValue??f.position.integerValue),duration:Number(f.duration.doubleValue??f.duration.integerValue)};
}
async function handle({path,method='GET',params={},auth,body=''}){
  if(path==='/api/streams'){
    try{
      if(!['GET','HEAD'].includes(method))throw new HttpError(405,'Méthode invalide.');
      const kind=params.type||'movie';if(!['movie','tv'].includes(kind))throw bad();
      const key=mediaKey(kind,params.id,params.season||1,params.episode||1);
      const reply=await handle({path:'/api/stream/'+key.replaceAll(':','/'),params:{lang:params.lang==='vostfr'?'vostfr':'fr'},auth});
      if(reply.status!==200)return reply;
      const d=reply.data;
      return {status:200,data:{success:true,tmdb_id:d.tmdbId,content_type:kind,season:kind==='tv'?Number(params.season||1):null,
        episode:kind==='tv'?Number(params.episode||1):null,status:d.status,streams:[d.playback,...d.alternatives].filter(Boolean).map(s=>({...s,player_url:s.url}))}};
    }catch(e){return {status:e.status||400,data:{error:'Paramètres invalides.'}};}
  }
  if(!/^\/api\/(search|movies|series|stream|playback)(\/|$)/.test(path))return null;
  try{
    if(Buffer.byteLength(body)>4096)throw new HttpError(413,'Corps trop long.');
    if(path==='/api/playback/progress')return {status:200,data:await progress(method,params,body,auth)};
    if(!['GET','HEAD'].includes(method))throw new HttpError(405,'Méthode invalide.');
    if(path.startsWith('/api/stream/')){
      router ||= createRouter(providers());
      if(path.endsWith('/health') && path==='/api/stream/health')return {status:200,data:router.health()};
      if(path==='/api/stream/providers')return {status:200,data:router.providers()};
      const m=path.match(/^\/api\/stream\/(movie)\/(\d+)$|^\/api\/stream\/(tv)\/(\d+)\/(\d+)\/(\d+)$/);
      if(!m)throw bad();
      const key=mediaKey(m[1]||m[3],m[2]||m[4],m[5],m[6]);
      const language=(params.lang||'fr').toLowerCase();
      const supported=(params.formats||formats.join(',')).split(',');
      const downlink=Number(params.mbps??100);
      if(!/^(?:[a-z]{2,3}|vostfr)$/.test(language)||supported.some(s=>!formats.includes(s))||!Number.isFinite(downlink)||downlink<0)throw bad();
      const privateEnabled=router.providers().some(p=>p.access==='authenticated');
      const uid=auth&&privateEnabled?(await identity(auth)).uid:'';
      return {status:200,data:await router.resolve({key,uid,language,supported,downlink})};
    }
    const query={...params};let endpoint;
    if(path==='/api/search'){
      if(!query.q?.trim()||query.q.length>160)throw bad();
      endpoint='search/multi';query.query=query.q.trim();delete query.q;
    }else if(path==='/api/movies/trending'){endpoint='trending/movie/week';}
    else{
      const m=path.match(/^\/api\/(movies|series)\/(\d+)(?:\/season\/(\d+))?$/);
      if(!m || (m[3] && m[1]!=='series'))throw new HttpError(404,'Route inconnue.');
      endpoint=(m[1]==='movies'?'movie/':'tv/')+integer(m[2]);
      if(m[3])endpoint+='/season/'+integer(m[3],10000);
      else query.append_to_response ||= 'videos,credits,similar,recommendations,external_ids';
    }
    return {status:200,data:await catalogue(endpoint,query,process.env.TMDB_API_KEY)};
  }catch(e){return {status:e instanceof HttpError?e.status:503,data:{error:e instanceof HttpError?e.message:'Service momentanément indisponible.'}};}
}
module.exports={handle,mediaKey};

