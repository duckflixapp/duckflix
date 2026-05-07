import type { CastMemberDTO } from '@duckflixapp/shared';
import type { RichVideo } from '@shared/mappers/video.mapper';
import type { Series, SeriesEpisode, SeriesGenre, SeriesSeason } from '@shared/schema';

export type SeriesDetailedRecord = Series & {
    genres: { genre: SeriesGenre }[];
    seasons: (SeriesSeason & { episodeCount?: number })[];
};

export type SeasonDetailedRecord = SeriesSeason & {
    series: Series;
    episodes: SeriesEpisode[];
};

export type EpisodeDetailedRecord = SeriesEpisode & {
    season: SeriesSeason & {
        series: Series;
    };
    video: RichVideo | null;
};

export type SeriesDeleteResult =
    | {
          status: 'deleted';
          deletedVideos: string[];
          deletedSubtitles: { id: string; storageKey: string }[];
          series: { id: string; title: string; tmdbId: number | null };
      }
    | { status: 'not_found' };

export type SeasonDeleteResult =
    | {
          status: 'deleted';
          deletedVideos: string[];
          deletedSubtitles: { id: string; storageKey: string }[];
          season: {
              id: string;
              name: string;
              seasonNumber: number;
              series: { id: string; title: string } | null;
          };
      }
    | { status: 'not_found' };

export interface SeriesRepository {
    findSeriesById(seriesId: string): Promise<SeriesDetailedRecord | null>;
    countSeriesInWatchlist(data: { seriesId: string; profileId: string }): Promise<number>;
    deleteSeriesById(data: { seriesId: string; accountId: string }): Promise<SeriesDeleteResult>;
    findSeasonById(seasonId: string): Promise<SeasonDetailedRecord | null>;
    deleteSeasonById(data: { seasonId: string; accountId: string }): Promise<SeasonDeleteResult>;
    findEpisodeById(episodeId: string): Promise<EpisodeDetailedRecord | null>;
}

export interface EpisodeCastService {
    getOrSyncEpisodeCast(
        episodeId: string,
        data: { seriesId: number | null; seasonNumber: number; episodeNumber: number }
    ): Promise<CastMemberDTO[]>;
}

export interface SeriesLogger {
    warn(data: unknown, message: string): void;
}
