import type { TMDBCastMember, TMDBCrewMember } from './movie.tmdb';

export interface TMDBExternalIds {
    imdb_id: string | null;
}

export interface TMDBSeriesBase {
    external_ids?: TMDBExternalIds;
}

export interface TMDBSeriesGenre {
    id: number;
    name: string;
}

export interface TMDBSeriesDetails extends TMDBSeriesBase {
    adult: false;
    backdrop_path: string;
    created_by: unknown[];
    episode_run_time: number[];
    first_air_date: string;
    genres: TMDBSeriesGenre[];
    homepage: string;
    id: number;
    in_production: boolean;
    languages: string[];
    last_air_date: string;
    last_episode_to_air: TMDBEpisodeDetails[];
    name: string;
    networks: unknown[];
    number_of_episodes: number;
    number_of_seasons: number;
    origin_country: string[];
    original_language: string;
    original_name: string;
    overview: string;
    popularity: number;
    poster_path: string;
    production_companies: unknown[];
    production_countries: unknown[];
    seasons: {
        air_date: string;
        episode_count: number;
        id: number;
        name: string;
        overview: string;
        poster_path: string;
        season_number: number;
        vote_average: number;
    }[];
    spoken_languages: unknown[];
    status: string;
    tagline: string;
    type: string;
    vote_average: number;
    vote_count: number;
}

export interface TMDBSeasonDetails extends TMDBSeriesBase {
    air_date: string;
    episodes: TMDBEpisodeDetails[];
    name: string;
    networks: unknown[];
    overview: string;
    id: number;
    poster_path: string;
    season_number: number;
    vote_average: number;
}

export interface TMDBEpisodeDetails extends TMDBSeriesBase {
    id: number;
    name: string;
    overview: string;
    air_date: string;
    runtime: number;
    still_path: string;
    vote_average: number;
    vote_count: number;
    episode_number: number;
    season_number: number;
}

export interface TMDBEpisodeCreditsResponse {
    id: number;
    cast: TMDBCastMember[];
    crew: TMDBCrewMember[];
    guest_stars: TMDBCastMember[];
}
