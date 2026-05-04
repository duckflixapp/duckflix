import { and, count, desc, eq, ilike, sql } from 'drizzle-orm';

import { db } from '@shared/configs/db';
import { isDuplicateKey } from '@shared/db.errors';
import { auditLogs, libraries, libraryItems, movies, series } from '@schema/index';
import {
    DuplicateLibraryItemError,
    DuplicateLibraryNameError,
    LibraryCreateFailedError,
    LibraryLimitReachedError,
    type ContentType,
    type LibraryRepository,
} from './library.ports';

const resolveLibraryFilter = (profileId: string, libraryId: string) => {
    const conditions = [eq(libraries.profileId, profileId)];
    if (libraryId === 'watchlist') conditions.push(eq(libraries.type, 'watchlist'));
    else conditions.push(eq(libraries.id, libraryId));

    return and(...conditions);
};

export const drizzleLibraryRepository: LibraryRepository = {
    async listByProfile(profileId: string, options?: { custom?: boolean }) {
        const custom = options?.custom ? eq(libraries.type, 'custom') : null;
        const conditions = [custom, eq(libraries.profileId, profileId)];
        const filters = and(...conditions.filter((condition) => condition != null));

        return db.select().from(libraries).where(filters);
    },

    async createCustom(data: { profileId: string; accountId: string; name: string; maxLibraries: number }) {
        return db.transaction(async (tx) => {
            const [userLibraries] = await tx
                .select({ value: count() })
                .from(libraries)
                .where(and(eq(libraries.profileId, data.profileId), eq(libraries.type, 'custom')));

            if (!userLibraries || userLibraries.value >= data.maxLibraries) throw new LibraryLimitReachedError(data.maxLibraries);

            const [result] = await tx
                .insert(libraries)
                .values({
                    name: data.name,
                    profileId: data.profileId,
                    type: 'custom',
                })
                .returning()
                .catch((error) => {
                    if (isDuplicateKey(error)) throw new DuplicateLibraryNameError();
                    throw error;
                });

            if (!result) throw new LibraryCreateFailedError();

            await tx.insert(auditLogs).values({
                actorAccountId: data.accountId,
                action: 'library.created',
                targetType: 'library',
                targetId: result.id,
                metadata: {
                    name: result.name,
                    type: result.type,
                },
            });

            return result;
        });
    },

    async deleteCustom(data: { profileId: string; libraryId: string; accountId: string }) {
        return db.transaction(async (tx) => {
            const [library] = await tx
                .select({ id: libraries.id, type: libraries.type, name: libraries.name })
                .from(libraries)
                .where(and(eq(libraries.profileId, data.profileId), eq(libraries.id, data.libraryId)));

            if (!library) return 'not_found';
            if (library.type !== 'custom') return 'not_custom';

            await tx.delete(libraries).where(eq(libraries.id, library.id));
            await tx.insert(auditLogs).values({
                actorAccountId: data.accountId,
                action: 'library.deleted',
                targetType: 'library',
                targetId: library.id,
                metadata: {
                    name: library.name,
                    type: library.type,
                },
            });

            return 'deleted';
        });
    },

    async addContent(data: { profileId: string; libraryId: string; contentId: string; type: ContentType }) {
        return db.transaction(async (tx) => {
            const [library] = await tx
                .select({ id: libraries.id })
                .from(libraries)
                .where(resolveLibraryFilter(data.profileId, data.libraryId));
            if (!library) return 'library_not_found';

            try {
                if (data.type === 'movie') {
                    const [movie] = await tx.select({ id: movies.id }).from(movies).where(eq(movies.id, data.contentId));
                    if (!movie) return 'content_not_found';

                    await tx.insert(libraryItems).values({ libraryId: library.id, movieId: movie.id });
                    return 'added';
                }

                const [tvSeries] = await tx.select({ id: series.id }).from(series).where(eq(series.id, data.contentId));
                if (!tvSeries) return 'content_not_found';

                await tx.insert(libraryItems).values({ libraryId: library.id, seriesId: tvSeries.id });
                return 'added';
            } catch (error) {
                if (isDuplicateKey(error)) throw new DuplicateLibraryItemError();
                throw error;
            }
        });
    },

    async removeContent(data: { profileId: string; libraryId: string; contentId: string; type: ContentType }) {
        return db.transaction(async (tx) => {
            const [library] = await tx
                .select({ id: libraries.id })
                .from(libraries)
                .where(resolveLibraryFilter(data.profileId, data.libraryId));
            if (!library) return 'library_not_found';

            const deleteFilter =
                data.type === 'movie'
                    ? and(eq(libraryItems.libraryId, library.id), eq(libraryItems.movieId, data.contentId))
                    : and(eq(libraryItems.libraryId, library.id), eq(libraryItems.seriesId, data.contentId));

            const [item] = await tx.select({ id: libraryItems.id }).from(libraryItems).where(deleteFilter);
            if (!item) return 'item_not_found';

            await tx.delete(libraryItems).where(deleteFilter);
            return 'removed';
        });
    },

    async findById(data: { profileId: string; libraryId: string }) {
        return (
            (await db.query.libraries.findFirst({
                where: and(eq(libraries.profileId, data.profileId), eq(libraries.id, data.libraryId)),
                with: {
                    profile: true,
                },
            })) ?? null
        );
    },

    async listItems(data: { profileId: string; libraryId: string; page: number; limit: number; search?: string }) {
        const offset = (data.page - 1) * data.limit;

        const searchFilter = data.search
            ? sql`(${ilike(movies.title, `%${data.search}%`)} OR ${ilike(series.title, `%${data.search}%`)})`
            : null;

        const conditions = [searchFilter, eq(libraryItems.libraryId, data.libraryId)];
        const filters = and(...conditions.filter((condition) => condition != null));

        return db.transaction(async (tx) => {
            const [library] = await tx
                .select({ id: libraries.id })
                .from(libraries)
                .where(and(eq(libraries.id, data.libraryId), eq(libraries.profileId, data.profileId)));

            if (!library) return null;

            const [results, total] = await Promise.all([
                tx
                    .select({
                        id: libraryItems.id,
                        libraryId: libraryItems.libraryId,
                        addedAt: libraryItems.addedAt,
                        movie: movies,
                        series: series,
                    })
                    .from(libraryItems)
                    .leftJoin(movies, eq(libraryItems.movieId, movies.id))
                    .leftJoin(series, eq(libraryItems.seriesId, series.id))
                    .where(filters)
                    .orderBy(desc(libraryItems.addedAt))
                    .limit(data.limit)
                    .offset(offset),
                tx
                    .select({ value: count() })
                    .from(libraryItems)
                    .leftJoin(movies, eq(libraryItems.movieId, movies.id))
                    .leftJoin(series, eq(libraryItems.seriesId, series.id))
                    .where(filters),
            ]);

            return {
                results,
                totalItems: total[0]?.value ?? 0,
            };
        });
    },
};
