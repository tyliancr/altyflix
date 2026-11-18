import SmartImage from '../common/SmartImage';

const CastMember = ({ member, onClick }) => {
    const photoUrl = member.profile_path
        ? `https://image.tmdb.org/t/p/w185${member.profile_path}`
        : '';

    const placeholder = (
        <div className="w-full h-full flex items-center justify-center">
            <svg className="w-10 h-10 text-white/20" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.67 0 8 1.34 8 4v2H4v-2c0-2.66 5.33-4 8-4zm0-2a4 4 0 100-8 4 4 0 000 8z" />
            </svg>
        </div>
    );

    return (
        <button
            type="button"
            onClick={() => onClick(member.id)}
            aria-label={`Voir la fiche de ${member.name}`}
            className="flex-shrink-0 w-[7.5rem] text-left cursor-pointer group select-none relative transition-transform duration-300 hover:-translate-y-1"
        >
            <div className="w-full aspect-[2/3] rounded-xl overflow-hidden bg-[#101016] relative ring-1 ring-inset ring-white/[0.07] group-hover:ring-white/25 transition-all duration-300">
                <SmartImage
                    src={photoUrl}
                    alt={member.name}
                    className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
                    loading="lazy"
                    decoding="async"
                    fallback={placeholder}
                />
            </div>
            <p className="text-white/90 text-[13px] font-semibold line-clamp-1 mt-2.5 transition-colors group-hover:text-white">{member.name}</p>
            {member.character && <p className="text-white/45 text-xs line-clamp-1">{member.character}</p>}
        </button>
    );
};

export default CastMember;
