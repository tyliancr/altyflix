export const seasonLabel = (season) => season?.name?.trim() || `Saison ${season?.season_number}`;
export const getSeasons = (show) => {
    if (Array.isArray(show?.seasons)) return show.seasons.filter(s => s.season_number > 0);
    return Array.from({ length: Math.max(0, Number(show?.number_of_seasons) || 0) }, (_, i) => ({ season_number: i + 1 }));
};
