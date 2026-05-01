// series.mapper.ts
import { type Series, type SeriesSeason, type SeriesEpisode, type SeriesGenre } from '@schema/series.schema';
import type {
    SeriesMinDTO,
    SeriesDTO,
    SeriesDetailedDTO,
    SeasonMinDTO,
    SeasonDTO,
    EpisodeMinDTO,
    EpisodeDTO,
    SeriesGenreDTO,
} from '@duckflixapp/shared';
import type { RichVideo } from './video.mapper';
import { toVideoDTO } from './video.mapper';

const TMDB_SHOW_BASE_URL = 'https://www.themoviedb.org/tv/';

export const toShowTMDbUrl = (tmdbId: number | null) => (tmdbId ? TMDB_SHOW_BASE_URL + tmdbId : null);
export const toSeriesTMDbUrl = (showTmdbId: number | null, seasonNumber: number) =>
    showTmdbId ? TMDB_SHOW_BASE_URL + showTmdbId + '/season/' + seasonNumber : null;
export const toEpisodeTMDbUrl = (tmdbId: number | null) => (tmdbId ? TMDB_SHOW_BASE_URL + 'episode/' + tmdbId : null);

// ---- Genre ----
export const toSeriesGenreDTO = (genre: SeriesGenre): SeriesGenreDTO => ({
    id: genre.id,
    name: genre.name,
});

// ---- Episode ----
export const toEpisodeMinDTO = (episode: SeriesEpisode): EpisodeMinDTO => ({
    id: episode.id,
    seasonId: episode.seasonId,
    episodeNumber: episode.episodeNumber,
    tmdbId: episode.tmdbId,
    tmdbUrl: toEpisodeTMDbUrl(episode.tmdbId),
    name: episode.name,
    stillUrl: episode.stillUrl,
    airDate: episode.airDate,
    runtime: episode.runtime,
    rating: episode.rating?.toFixed(1) ?? null,
    videoId: episode.videoId ?? null,
});

export const toEpisodeDTO = (episode: SeriesEpisode & { season: SeriesSeason; video: RichVideo | null }): EpisodeDTO => ({
    ...toEpisodeMinDTO(episode),
    overview: episode.overview ?? null,
    season: toSeasonMinDTO(episode.season),
    video: episode.video ? toVideoDTO(episode.video) : null,
    cast: [],
});

// ---- Season ----
export const toSeasonMinDTO = (season: SeriesSeason & { episodeCount?: number }): SeasonMinDTO => ({
    id: season.id,
    seriesId: season.seriesId,
    seasonNumber: season.seasonNumber,
    name: season.name,
    posterUrl: season.posterUrl ?? null,
    airDate: season.airDate ?? null,
    episodeCount: season.episodeCount,
});

export const toSeasonDTO = (season: SeriesSeason & { series: Series; episodes: SeriesEpisode[] }): SeasonDTO => ({
    ...toSeasonMinDTO(season),
    tmdbUrl: toSeriesTMDbUrl(season.series.tmdbId, season.seasonNumber),
    overview: season.overview ?? null,
    series: toSeriesMinDTO(season.series),
    episodes: season.episodes.map(toEpisodeMinDTO),
});

// ---- Series ----
export const toSeriesMinDTO = (s: Series): SeriesMinDTO => ({
    id: s.id,
    tmdbId: s.tmdbId,
    tmdbUrl: toShowTMDbUrl(s.tmdbId),
    title: s.title,
    overview: s.overview ?? null,
    posterUrl: s.posterUrl ?? null,
    bannerUrl: s.bannerUrl ?? null,
    rating: s.rating?.toFixed(1) ?? null,
    firstAirDate: s.firstAirDate ?? null,
    status: s.status ?? null,
});

export const toSeriesDTO = (
    s: Series & {
        genres: { genre: SeriesGenre }[];
        seasons: (SeriesSeason & { episodeCount?: number })[];
    }
): SeriesDTO => ({
    ...toSeriesMinDTO(s),
    genres: s.genres.map((g) => toSeriesGenreDTO(g.genre)),
    seasons: s.seasons.map(toSeasonMinDTO),
});

export const toSeriesDetailedDTO = (
    s: Series & {
        genres: { genre: SeriesGenre }[];
        seasons: (SeriesSeason & { episodeCount?: number })[];
    },
    inUserLibrary?: boolean | null
): SeriesDetailedDTO => ({
    ...toSeriesDTO(s),
    lastAirDate: s.lastAirDate ?? null,
    inUserLibrary: inUserLibrary ?? null,
});
