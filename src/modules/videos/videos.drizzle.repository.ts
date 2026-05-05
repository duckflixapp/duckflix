import { and, eq, inArray } from 'drizzle-orm';
import { db, type Transaction } from '@shared/configs/db';
import {
    movieGenres,
    movies,
    moviesToGenres,
    series,
    seriesEpisodes,
    seriesGenres,
    seriesSeasons,
    seriesToGenres,
    subtitles,
    videos,
    videoVersions,
    watchHistory,
    type SeriesStatus,
    type Video,
} from '@shared/schema';
import { AppError } from '@shared/errors';
import { isDuplicateKey } from '@shared/db.errors';
import { tmdbClient } from '@shared/lib/tmdb';
import { logger } from '@shared/configs/logger';
import { syncEpisodeCast, syncMovieCast } from '@shared/services/cast.service';
import type { EpisodeMetadata, MovieMetadata, VideoMetadata } from '@shared/services/metadata/metadata.types';
import { VideoNotCreatedError } from './video.errors';
import type { VideoSubtitlesRepository, VideosRepository, VideoVersionsRepository } from './videos.ports';

type UploadHandler<T extends VideoMetadata> = (tx: Transaction, video: Video, data: T) => Promise<void>;

const movieUploadHandler: UploadHandler<MovieMetadata> = async (tx, video, data) => {
    try {
        const [movie] = await tx
            .insert(movies)
            .values({
                videoId: video.id,
                title: data.title,
                overview: data.overview,
                bannerUrl: data.bannerUrl,
                posterUrl: data.posterUrl,
                rating: data.rating ?? null,
                tmdbId: data.tmdbId,
                releaseYear: data.releaseYear,
            })
            .returning({ id: movies.id });

        if (!movie) throw new VideoNotCreatedError();

        if (data.genres.length > 0) {
            const movieGenresRaw = await tx
                .select({ id: movieGenres.id })
                .from(movieGenres)
                .where(inArray(movieGenres.name, data.genres))
                .orderBy(movieGenres.name);

            const genreIds = movieGenresRaw.map(({ id }) => id);
            if (genreIds.length > 0) await tx.insert(moviesToGenres).values(genreIds.map((genreId) => ({ movieId: movie.id, genreId })));
        }

        if (data.tmdbId) {
            await syncMovieCast(movie.id, data.tmdbId, tx).catch((err) => {
                logger.warn({ err, movieId: movie.id, tmdbId: data.tmdbId }, 'Failed to sync movie cast during upload');
            });
        }
    } catch (e) {
        if (isDuplicateKey(e)) throw new AppError('Movie already exists', { statusCode: 409 });
        throw e;
    }
};

const episodeUploadHandler: UploadHandler<EpisodeMetadata> = async (tx, video, data) => {
    const existingSeries = await tx.query.series.findFirst({
        where: eq(series.tmdbId, data.tmdbShowId),
        with: {
            seasons: true,
        },
    });

    let seriesId = existingSeries?.id;
    if (!seriesId) {
        const raw = await tmdbClient.getSeriesDetails(data.tmdbShowId);

        const allowedStatus: SeriesStatus[] = ['returning', 'ended', 'canceled', 'in_production'] as const;
        const status = allowedStatus.find((s) => s === raw.status) ?? null;

        const value = {
            title: raw.name,
            overview: raw.overview,
            posterUrl: raw.poster_path ? `https://image.tmdb.org/t/p/w500${raw.poster_path}` : undefined,
            bannerUrl: raw.backdrop_path ? `https://image.tmdb.org/t/p/original${raw.backdrop_path}` : undefined,
            rating: raw.vote_average,
            firstAirDate: raw.first_air_date,
            lastAirDate: raw.last_air_date,
            status,
            tmdbId: raw.id,
        };

        const [inserted] = await tx
            .insert(series)
            .values(value)
            .onConflictDoUpdate({ target: series.tmdbId, set: value })
            .returning({ id: series.id });

        seriesId = inserted!.id;

        const genreNames = raw.genres.map((genre) => genre.name.toLowerCase());
        if (genreNames.length > 0) {
            const seriesGenresRaw = await tx
                .select({ id: seriesGenres.id })
                .from(seriesGenres)
                .where(inArray(seriesGenres.name, genreNames));

            const genreIds = seriesGenresRaw.map(({ id }) => id);
            if (genreIds.length > 0) await tx.insert(seriesToGenres).values(genreIds.map((genreId) => ({ seriesId: seriesId!, genreId })));
        }
    }

    let seasonId = existingSeries?.seasons.find((season) => season.seasonNumber === data.seasonNumber)?.id;
    if (!seasonId) {
        const raw = await tmdbClient.getSeasonDetails(data.tmdbShowId, data.seasonNumber);

        const value = {
            name: raw.name,
            overview: raw.overview,
            posterUrl: raw.poster_path ? `https://image.tmdb.org/t/p/w500${raw.poster_path}` : undefined,
            airDate: raw.air_date,
            seriesId,
            seasonNumber: raw.season_number,
        };

        const [inserted] = await tx
            .insert(seriesSeasons)
            .values(value)
            .onConflictDoUpdate({
                target: [seriesSeasons.seriesId, seriesSeasons.seasonNumber],
                set: value,
            })
            .returning({ id: seriesSeasons.id });

        seasonId = inserted!.id;
    }

    try {
        const [episode] = await tx
            .insert(seriesEpisodes)
            .values({
                seasonId,
                videoId: video.id,
                episodeNumber: data.episodeNumber,
                name: data.name,
                overview: data.overview,
                airDate: data.airDate?.toDateString() ?? null,
                runtime: data.runtime,
                stillUrl: data.stillUrl,
                rating: data.rating ?? null,
                tmdbId: data.tmdbId,
            })
            .returning({ id: seriesEpisodes.id });

        if (episode && data.tmdbShowId) {
            await syncEpisodeCast(
                episode.id,
                {
                    seriesId: data.tmdbShowId,
                    seasonNumber: data.seasonNumber,
                    episodeNumber: data.episodeNumber,
                },
                tx
            ).catch((err) => {
                logger.warn(
                    {
                        err,
                        episodeId: episode.id,
                        tmdbSeriesId: data.tmdbShowId,
                        seasonNumber: data.seasonNumber,
                        episodeNumber: data.episodeNumber,
                    },
                    'Failed to sync episode cast during upload'
                );
            });
        }
    } catch (e) {
        if (isDuplicateKey(e)) throw new AppError('Episode already exists', { statusCode: 409 });
        throw e;
    }
};

const uploadHandlerFactory = (metadata: VideoMetadata) => {
    if (metadata.type === 'movie') return (tx: Transaction, video: Video) => movieUploadHandler(tx, video, metadata);
    if (metadata.type === 'episode') return (tx: Transaction, video: Video) => episodeUploadHandler(tx, video, metadata);
    throw new AppError('Upload type not supported', { statusCode: 501 });
};

export const drizzleVideosRepository: VideosRepository = {
    async initiateUpload(metadata, data) {
        return await db.transaction(async (tx) => {
            const [dbVideo] = await tx
                .insert(videos)
                .values({
                    duration: null,
                    status: data.status,
                    uploaderId: data.accountId,
                    type: metadata.type,
                })
                .returning();

            if (!dbVideo) throw new VideoNotCreatedError();

            const handler = uploadHandlerFactory(metadata);
            await handler(tx, dbVideo);

            return dbVideo;
        });
    },

    async findById(videoId) {
        return (
            (await db.query.videos.findFirst({
                where: eq(videos.id, videoId),
                with: {
                    versions: true,
                    subtitles: true,
                    uploader: {
                        columns: {
                            id: true,
                            email: true,
                            role: true,
                            system: true,
                        },
                    },
                },
            })) ?? null
        );
    },

    async findStatus(videoId) {
        const [video] = await db.select({ id: videos.id, status: videos.status }).from(videos).where(eq(videos.id, videoId));
        return video ?? null;
    },

    async findForDelete(videoId) {
        return (
            (await db.query.videos.findFirst({
                where: eq(videos.id, videoId),
                with: {
                    versions: true,
                    movie: { columns: { id: true, title: true } },
                    episode: { columns: { id: true, name: true } },
                },
            })) ?? null
        );
    },

    async deleteById(videoId) {
        await db.delete(videos).where(eq(videos.id, videoId));
    },

    async findProgress(data) {
        const [video] = await db
            .select({ id: videos.id, history: watchHistory })
            .from(videos)
            .where(eq(videos.id, data.videoId))
            .leftJoin(watchHistory, and(eq(watchHistory.videoId, data.videoId), eq(watchHistory.profileId, data.profileId)));

        return video ?? null;
    },

    async findDuration(videoId) {
        const [video] = await db.select({ id: videos.id, duration: videos.duration }).from(videos).where(eq(videos.id, videoId));
        return video ?? null;
    },

    async findExistingProgress(data) {
        const [progress] = await db
            .select()
            .from(watchHistory)
            .where(and(eq(watchHistory.profileId, data.profileId), eq(watchHistory.videoId, data.videoId)));

        return progress ?? null;
    },

    async upsertProgress(data) {
        const [result] = await db
            .insert(watchHistory)
            .values({
                profileId: data.profileId,
                videoId: data.videoId,
                lastPosition: data.positionSec,
                isFinished: data.isFinished,
                updatedAt: data.updatedAt,
            })
            .onConflictDoUpdate({
                target: [watchHistory.profileId, watchHistory.videoId],
                set: {
                    lastPosition: data.positionSec,
                    isFinished: data.isFinished,
                    updatedAt: data.updatedAt,
                },
            })
            .returning();

        return result ?? null;
    },

    async findForResolve(videoId) {
        return (
            (await db.query.videos.findFirst({
                where: eq(videos.id, videoId),
                columns: { id: true, type: true },
                with: {
                    movie: { columns: { id: true, title: true } },
                    episode: { columns: { id: true, name: true } },
                },
            })) ?? null
        );
    },
};

export const drizzleVideoVersionsRepository: VideoVersionsRepository = {
    async listByVideoId(videoId) {
        return await db.transaction(async (tx) => {
            const video = await tx.query.videos.findFirst({
                where: eq(videos.id, videoId),
                columns: { id: true },
            });
            if (!video) return null;

            return await tx.query.videoVersions.findMany({
                where: eq(videoVersions.videoId, videoId),
            });
        });
    },

    async findVideoWithReadyOriginal(videoId) {
        return (
            (await db.query.videos.findFirst({
                where: eq(videos.id, videoId),
                with: {
                    versions: {
                        where: and(eq(videoVersions.isOriginal, true), eq(videoVersions.status, 'ready')),
                    },
                },
            })) ?? null
        );
    },

    async findExistingHlsVersion(data) {
        return (
            (await db.query.videoVersions.findFirst({
                where: and(
                    eq(videoVersions.videoId, data.videoId),
                    eq(videoVersions.height, data.height),
                    eq(videoVersions.mimeType, 'application/x-mpegURL'),
                    inArray(videoVersions.status, ['ready', 'processing', 'waiting'])
                ),
            })) ?? null
        );
    },

    async findById(data) {
        return (
            (await db.query.videoVersions.findFirst({
                where: and(eq(videoVersions.id, data.versionId), eq(videoVersions.videoId, data.videoId)),
            })) ?? null
        );
    },

    async deleteById(versionId) {
        await db.delete(videoVersions).where(eq(videoVersions.id, versionId));
    },
};

export const drizzleVideoSubtitlesRepository: VideoSubtitlesRepository = {
    async videoExists(videoId) {
        const [video] = await db.select({ id: videos.id }).from(videos).where(eq(videos.id, videoId)).limit(1);
        return !!video;
    },

    async findVideoForSearch(videoId) {
        return (
            (await db.query.videos.findFirst({
                where: eq(videos.id, videoId),
                columns: { id: true, type: true },
                with: {
                    episode: { columns: { tmdbId: true } },
                    movie: { columns: { tmdbId: true } },
                },
            })) ?? null
        );
    },

    async listSubtitleNames(videoId) {
        return await db
            .select({ language: subtitles.language, externalId: subtitles.externalId, name: subtitles.name })
            .from(subtitles)
            .where(eq(subtitles.videoId, videoId));
    },

    async insertSubtitle(data) {
        const [subtitle] = await db.insert(subtitles).values(data).returning();
        return subtitle ?? null;
    },

    async insertSubtitleWithDuplicateCheck(data) {
        return await db.transaction(async (tx) => {
            const externalId = data.externalId;
            const existing = await tx
                .select({ externalId: subtitles.externalId })
                .from(subtitles)
                .where(eq(subtitles.videoId, data.videoId));

            if (existing.find((subtitle) => subtitle.externalId === externalId)) return 'duplicate';

            const [insertedSubtitle] = await tx.insert(subtitles).values(data).returning();
            return insertedSubtitle ?? null;
        });
    },

    async findSubtitle(data) {
        const [subtitle] = await db
            .select()
            .from(subtitles)
            .where(and(eq(subtitles.videoId, data.videoId), eq(subtitles.id, data.subtitleId)));

        return subtitle ?? null;
    },

    async deleteSubtitleById(subtitleId) {
        await db.delete(subtitles).where(eq(subtitles.id, subtitleId));
    },
};
