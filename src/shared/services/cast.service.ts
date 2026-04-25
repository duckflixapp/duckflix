import { asc, eq } from 'drizzle-orm';
import { db, type Transaction } from '@shared/configs/db';
import { tmdbClient } from '@shared/lib/tmdb';
import { toCastMemberDTOFromDB, toCastProfileImageUrl } from '@shared/mappers/cast.mapper';
import { casts, episodesToCasts, moviesToCasts, type CastCreditType } from '@shared/schema/cast.schema';

type DBExecutor = Transaction | typeof db;

const withWriteExecutor = async <T>(executor: DBExecutor, fn: (tx: Transaction) => Promise<T>): Promise<T> => {
    if (executor === db) return db.transaction(fn);
    return fn(executor as Transaction);
};

const upsertCastMember = async (
    executor: DBExecutor,
    member: {
        id: number;
        name: string;
        original_name: string;
        gender: number;
        known_for_department: string;
        popularity: number;
        profile_path: string | null;
    }
) => {
    const values = {
        tmdbId: member.id,
        name: member.name,
        originalName: member.original_name,
        gender: member.gender,
        knownForDepartment: member.known_for_department,
        popularity: member.popularity,
        profileUrl: toCastProfileImageUrl(member.profile_path),
    };

    const [cast] = await executor
        .insert(casts)
        .values(values)
        .onConflictDoUpdate({
            target: casts.tmdbId,
            set: values,
        })
        .returning({ id: casts.id });

    if (!cast) throw new Error('Failed to upsert cast member');
    return cast.id;
};

export const getMovieCast = async (movieId: string, executor: DBExecutor = db) => {
    const rows = await executor
        .select({
            tmdbId: casts.tmdbId,
            name: casts.name,
            character: moviesToCasts.character,
            profileUrl: casts.profileUrl,
            order: moviesToCasts.order,
        })
        .from(moviesToCasts)
        .innerJoin(casts, eq(moviesToCasts.castId, casts.id))
        .where(eq(moviesToCasts.movieId, movieId))
        .orderBy(asc(moviesToCasts.order), asc(casts.name));

    return rows.map(toCastMemberDTOFromDB);
};

export const getEpisodeCast = async (episodeId: string, executor: DBExecutor = db) => {
    const rows = await executor
        .select({
            tmdbId: casts.tmdbId,
            name: casts.name,
            character: episodesToCasts.character,
            profileUrl: casts.profileUrl,
            order: episodesToCasts.order,
        })
        .from(episodesToCasts)
        .innerJoin(casts, eq(episodesToCasts.castId, casts.id))
        .where(eq(episodesToCasts.episodeId, episodeId))
        .orderBy(asc(episodesToCasts.order), asc(casts.name));

    return rows.map(toCastMemberDTOFromDB);
};

export const syncMovieCast = async (movieId: string, tmdbMovieId: number, executor: DBExecutor = db) => {
    const credits = await tmdbClient.getMovieCredits(tmdbMovieId);
    const castMembers = [...credits.cast].sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
    return withWriteExecutor(executor, async (tx) => {
        await tx.delete(moviesToCasts).where(eq(moviesToCasts.movieId, movieId));

        if (castMembers.length === 0) return [];

        const values = [];
        for (const member of castMembers) {
            const castId = await upsertCastMember(tx, member);
            values.push({
                movieId,
                castId,
                creditId: member.credit_id,
                type: 'cast' as CastCreditType,
                character: member.character || null,
                order: member.order ?? null,
            });
        }

        await tx.insert(moviesToCasts).values(values);
        return getMovieCast(movieId, tx);
    });
};

export const syncEpisodeCast = async (
    episodeId: string,
    data: { seriesId: number; seasonNumber: number; episodeNumber: number },
    executor: DBExecutor = db
) => {
    const credits = await tmdbClient.getEpisodeCredits(data.seriesId, data.seasonNumber, data.episodeNumber);
    const castMembers = [
        ...credits.cast.map((member) => ({ ...member, type: 'cast' as CastCreditType })),
        ...credits.guest_stars.map((member) => ({ ...member, type: 'guest_star' as CastCreditType })),
    ].sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
    return withWriteExecutor(executor, async (tx) => {
        await tx.delete(episodesToCasts).where(eq(episodesToCasts.episodeId, episodeId));

        if (castMembers.length === 0) return [];

        const values = [];
        for (const member of castMembers) {
            const castId = await upsertCastMember(tx, member);
            values.push({
                episodeId,
                castId,
                creditId: member.credit_id,
                type: member.type,
                character: member.character || null,
                order: member.order ?? null,
            });
        }

        await tx.insert(episodesToCasts).values(values);
        return getEpisodeCast(episodeId, tx);
    });
};

export const getOrSyncMovieCast = async (movieId: string, tmdbMovieId: number | null) => {
    const existing = await getMovieCast(movieId);
    if (existing.length > 0 || !tmdbMovieId) return existing;
    return syncMovieCast(movieId, tmdbMovieId);
};

export const getOrSyncEpisodeCast = async (
    episodeId: string,
    data: { seriesId: number | null; seasonNumber: number; episodeNumber: number }
) => {
    const existing = await getEpisodeCast(episodeId);
    if (existing.length > 0 || !data.seriesId) return existing;
    return syncEpisodeCast(episodeId, {
        seriesId: data.seriesId,
        seasonNumber: data.seasonNumber,
        episodeNumber: data.episodeNumber,
    });
};
