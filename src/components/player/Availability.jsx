import {useEffect,useState} from 'react';
import {resolveStream} from '../../services/nativeStream';
import {useProfile} from '../../contexts/ProfileContext';

export default function Availability({type,id,season=1,episode=1}){
    const {currentProfile}=useProfile();
    const lang=currentProfile?.preferredAudio?.toUpperCase().startsWith('VO')?'vostfr':'fr';
    const [label,setLabel]=useState('');
    useEffect(()=>{
        const ctrl=new AbortController();
        setLabel('Vérification de la disponibilité…');
        resolveStream(type,id,season,episode,lang,ctrl.signal).then(data=>{
            if(ctrl.signal.aborted)return;
            setLabel(data.status==='available'?'Disponible en lecture':data.status==='unavailable'?'Référencé au catalogue · aucune vidéo compatible':'Disponibilité à vérifier');
        }).catch(()=>{if(!ctrl.signal.aborted)setLabel('Disponibilité à vérifier');});
        return ()=>ctrl.abort();
    },[type,id,season,episode,lang,currentProfile?.id]);
    return <p aria-live="polite" className="mb-3 text-sm text-white/80">{label}</p>;
}

