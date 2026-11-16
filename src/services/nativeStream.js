import { auth } from '../config/firebase';

export async function requestStreamApi(path, {signal, method='GET', data}={}) {
    const token=await auth.currentUser?.getIdToken();
    const headers=token ? {Authorization:'Bearer '+token} : {};
    if(data) headers['Content-Type']='application/json';
    const response=await fetch(path,{method,signal,headers,body:data?JSON.stringify(data):undefined,cache:'no-store'});
    if(!response.ok) throw Error('Service indisponible ('+response.status+')');
    return response.json();
}
export async function resolveStream(type,id,season,episode,language,signal) {
    const isTv = type === 'tv';
    const lang = String(language || 'vf').toLowerCase().includes('vost') ? 'vostfr' : 'vf';
    const directQuery = new URLSearchParams({
        id: String(id),
        type: isTv ? 'tv' : 'movie',
        season: String(season || 1),
        episode: String(episode || 1),
        lang: lang
    });

    try {
        const res = await fetch('/api/direct-stream?' + directQuery.toString(), { signal, cache: 'no-store' });
        if (res.ok) {
            const data = await res.json();
            if (data.success && data.streamUrl) {
                return {
                    status: 'available',
                    playback: {
                        url: data.streamUrl,
                        format: 'hls',
                        language: data.lang || (lang === 'vostfr' ? 'vostfr' : 'fr'),
                        height: 1080,
                        quality: '1080p',
                        subtitles: [],
                        credit: 'Altyflix 4K Ultra HD'
                    },
                    alternatives: []
                };
            }
        }
    } catch { /* proceed to fallback */ }

    const video=document.createElement('video');
    const formats=[];
    if(video.canPlayType('video/mp4')) formats.push('mp4');
    if(video.canPlayType('application/vnd.apple.mpegurl') || window.MediaSource || window.ManagedMediaSource) formats.push('hls');
    if(window.MediaSource) formats.push('dash');
    if(!formats.length)return {status:'unavailable'};
    const query=new URLSearchParams({lang:language,formats:formats.join(','),mbps:String(navigator.connection?.downlink??100)});
    const path=type==='tv'?'tv/'+id+'/'+season+'/'+episode:'movie/'+id;
    return requestStreamApi('/api/stream/'+path+'?'+query,{signal}).catch(() => ({ status: 'unavailable' }));
}

