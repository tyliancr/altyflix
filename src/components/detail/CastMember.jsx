import { useState } from 'react';

const CastMember = ({ member, onClick }) => {
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(false);
    const photoUrl = member.profile_path
        ? `https://image.tmdb.org/t/p/w185${member.profile_path}`
        : null;

    return (
        <div
            onClick={(e) => {
                e.preventDefault();
                onClick(member.id);
            }}
            className="flex-shrink-0 w-[8.5rem] text-center cursor-pointer group select-none animate-fade-in relative transition-all duration-300 hover:-translate-y-1"
        >
            <div className="w-full aspect-[2/3] rounded-2xl overflow-hidden bg-white/[0.02] relative border border-white/[0.06] group-hover:border-white/20 shadow-md group-hover:shadow-[0_8px_24px_rgba(0,0,0,0.5)] transition-all duration-300">
                {!loaded && !error && <div className="absolute inset-0 skeleton" />}
                {photoUrl && !error ? (
                    <img
                        src={photoUrl}
                        alt={member.name}
                        className={`w-full h-full object-cover transition-transform duration-500 ease-out ${
                            loaded ? 'opacity-100' : 'opacity-0'
                        } group-hover:scale-110`}
                        onLoad={() => setLoaded(true)}
                        onError={() => setError(true)}
                        loading="lazy"
                        decoding="async"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <svg className="w-10 h-10 text-white/20" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 12c2.67 0 8 1.34 8 4v2H4v-2c0-2.66 5.33-4 8-4zm0-2a4 4 0 100-8 4 4 0 000 8z" />
                        </svg>
                    </div>
                )}

                {/* Premium hover overlay for character/role */}
                {member.character && (
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 flex flex-col justify-end p-2.5 text-left pointer-events-none">
                        <span className="text-[8px] uppercase tracking-widest text-[#E50914] font-black mb-0.5">Rôle</span>
                        <p className="text-white text-[10px] font-bold line-clamp-2 leading-tight">{member.character}</p>
                    </div>
                )}
            </div>
            <p className="text-white/80 text-xs font-bold line-clamp-1 mt-2.5 transition-colors group-hover:text-white">{member.name}</p>
        </div>
    );
};

export default CastMember;
