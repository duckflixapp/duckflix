// series.mapper.ts
import type { Series, SeriesSeason, SeriesEpisode, SeriesGenre } from '@schema/series.schema';
import type {
    SeriesMinDTO,
    SeriesDTO,
    SeriesDetailedDTO,
    SeasonMinDTO,
    SeasonDTO,
    EpisodeMinDTO,
    EpisodeDTO,
    SeriesGenreDTO,
} from '@duckflix/shared';
import type { RichVideo } from './video.mapper';
import { toVideoDTO } from './video.mapper';

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
    name: episode.name,
    stillUrl: episode.stillUrl,
    airDate: episode.airDate,
    runtime: episode.runtime,
    rating: episode.rating,
    videoId: episode.videoId ?? null,
});

export const toEpisodeDTO = (episode: SeriesEpisode & { season: SeriesSeason; video: RichVideo | null }): EpisodeDTO => ({
    ...toEpisodeMinDTO(episode),
    overview: episode.overview ?? null,
    season: toSeasonMinDTO(episode.season),
    video: episode.video ? toVideoDTO(episode.video) : null,
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
    overview: season.overview ?? null,
    series: toSeriesMinDTO(season.series),
    episodes: season.episodes.map(toEpisodeMinDTO),
});

// ---- Series ----
export const toSeriesMinDTO = (s: Series): SeriesMinDTO => ({
    id: s.id,
    title: s.title,
    overview: s.overview ?? null,
    posterUrl: s.posterUrl ?? null,
    bannerUrl: s.bannerUrl ?? null,
    rating: s.rating ?? null,
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
    tmdbId: s.tmdbId ? String(s.tmdbId) : null,
    lastAirDate: s.lastAirDate ?? null,
    inUserLibrary: inUserLibrary ?? null,
});
