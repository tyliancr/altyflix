import { MenuOption } from './PlayerParts';
import { menuPanel } from './playerUtils';

const SIZES = [
    { id: 's', label: 'Petits', className: 'text-xs' },
    { id: 'm', label: 'Moyens', className: 'text-sm' },
    { id: 'l', label: 'Grands', className: 'text-base' },
    { id: 'xl', label: 'Très grands', className: 'text-lg' },
];

const heading = 'font-bold text-gray-400 uppercase tracking-wider text-xs mb-3';

/** Menu « Audio et sous-titres » : pistes audio à gauche, sous-titres à droite. */
export function AudioSubtitlesMenu({ audioTracks, audioTrack, onAudio, subtitleTracks, subtitleTrack, onSubtitle, subtitleSize, onSubtitleSize }) {
    return (
        <div role="menu" aria-label="Audio et sous-titres" className={`${menuPanel} absolute right-0 bottom-12 w-[min(34rem,calc(100vw-2rem))] p-5 z-50`}>
            <div className="grid grid-cols-2 gap-6">
                <div role="group" aria-labelledby="player-audio-heading">
                    <h4 id="player-audio-heading" className={heading}>Audio</h4>
                    <div className="space-y-1 max-h-56 overflow-y-auto">
                        {audioTracks.length === 0 && <p className="text-gray-500 px-2">Piste unique</p>}
                        {audioTracks.map(track => (
                            <MenuOption key={track.index} selected={audioTrack === track.index} onSelect={() => onAudio(track.index)}>{track.name}</MenuOption>
                        ))}
                    </div>
                </div>
                <div role="group" aria-labelledby="player-subs-heading">
                    <h4 id="player-subs-heading" className={heading}>Sous-titres</h4>
                    <div className="space-y-1 max-h-56 overflow-y-auto">
                        <MenuOption selected={subtitleTrack === -1} onSelect={() => onSubtitle(-1)}>Désactivés</MenuOption>
                        {subtitleTracks.map(track => (
                            <MenuOption key={track.index} selected={subtitleTrack === track.index} onSelect={() => onSubtitle(track.index)}>{track.name}</MenuOption>
                        ))}
                    </div>
                </div>
            </div>
            <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between gap-3" role="group" aria-label="Taille des sous-titres">
                <span className="text-gray-400 text-xs uppercase tracking-wider font-bold">Taille</span>
                <div className="flex items-center gap-1.5">
                    {SIZES.map(size => (
                        <button
                            key={size.id}
                            type="button"
                            role="menuitemradio"
                            aria-checked={subtitleSize === size.id}
                            aria-label={`Sous-titres ${size.label.toLowerCase()}`}
                            title={size.label}
                            onClick={() => onSubtitleSize(size.id)}
                            className={`w-9 h-9 rounded font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white ${size.className} ${subtitleSize === size.id ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}
                        >
                            A
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

/** Menu de qualité : automatique (adaptatif) ou qualité fixe. */
export function QualityMenu({ levels, level, activeHeight, onLevel }) {
    return (
        <div role="menu" aria-label="Qualité vidéo" className={`${menuPanel} absolute right-0 bottom-12 w-60 p-5 z-50`}>
            <h4 className={heading}>Qualité</h4>
            <div className="space-y-1">
                <MenuOption selected={level === -1} onSelect={() => onLevel(-1)} hint={level === -1 && activeHeight ? `${activeHeight}p` : undefined}>Automatique</MenuOption>
                {levels.map(item => (
                    <MenuOption key={item.index} selected={level === item.index} onSelect={() => onLevel(item.index)} hint={`${(item.bitrate / 1e6).toFixed(1)} Mb/s`}>
                        {item.height}p
                    </MenuOption>
                ))}
                {levels.length === 0 && <p className="text-gray-500 px-2 text-xs">Sur cet appareil, la qualité s&apos;adapte automatiquement à la connexion.</p>}
            </div>
        </div>
    );
}
