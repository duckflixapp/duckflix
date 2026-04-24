import type { CastMemberDTO } from '@duckflixapp/shared';
import type { TMDBCastMember } from '@shared/types/movie.tmdb';

const TMDB_PROFILE_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w185';
const TMDB_PROFILE_BASE_URL = 'https://themoviedb.org/person/';

export const toCastProfileImageUrl = (profilePath: string | null) => (profilePath ? `${TMDB_PROFILE_IMAGE_BASE_URL}${profilePath}` : null);
export const toCastTMDbUrl = (tmdbId: number) => TMDB_PROFILE_BASE_URL + tmdbId;

export const toCastMemberDTOFromTMDB = (member: TMDBCastMember): CastMemberDTO => ({
    id: String(member.id),
    name: member.name,
    character: member.character || null,
    profileUrl: toCastProfileImageUrl(member.profile_path),
    tmdbUrl: toCastTMDbUrl(member.id),
    order: typeof member.order === 'number' ? member.order : null,
});

export const toCastMemberDTOFromDB = (member: {
    tmdbId: number;
    name: string;
    character: string | null;
    profileUrl: string | null;
    order: number | null;
}): CastMemberDTO => ({
    id: String(member.tmdbId),
    name: member.name,
    character: member.character,
    profileUrl: member.profileUrl,
    tmdbUrl: toCastTMDbUrl(member.tmdbId),
    order: member.order,
});
