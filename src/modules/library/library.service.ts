import type { LibraryDTO, LibraryItemDTO, LibraryMinDTO, PaginatedResponse } from '@duckflix/shared';
import { db } from '@shared/configs/db';
import { libraries, libraryItems, movies, series } from '@schema/index';
import { and, count, desc, eq, ilike, sql } from 'drizzle-orm';
import { toLibraryDTO, toLibraryItemDTO, toLibraryMinDTO } from '@shared/mappers/library.mapper';
import { AppError } from '@shared/errors';
import { isDuplicateKey } from '@shared/db.errors';
import { LibraryNotFoundError } from './library.errors';

export const getUserLibraries = async (userId: string, options?: { custom?: boolean }): Promise<LibraryMinDTO[]> => {
    const custom = !!options?.custom ? eq(libraries.type, 'custom') : null;

    const conditions = [custom, eq(libraries.userId, userId)];
    const filters = and(...conditions.filter((c) => c != null));

    const results = await db.select().from(libraries).where(filters);

    return results.map(toLibraryMinDTO);
};

const reservedLibraryNames = ['watchlist'];
const MAX_LIBRARIES = 10;
export const createUserLibrary = async (userId: string, context: { name: string }): Promise<LibraryMinDTO> => {
    if (reservedLibraryNames.includes(context.name.toLowerCase())) throw new AppError('Name is unavailable', { statusCode: 409 });

    try {
        const result = await db.transaction(async (tx) => {
            const [userLibraries] = await tx
                .select({ value: count() })
                .from(libraries)
                .where(and(eq(libraries.userId, userId), eq(libraries.type, 'custom')));

            if (!userLibraries || userLibraries?.value >= MAX_LIBRARIES)
                throw new AppError(`You have reached the library limit (max ${MAX_LIBRARIES}).`, { statusCode: 403 });
            const [result] = await tx
                .insert(libraries)
                .values({
                    name: context.name,
                    userId: userId,
                    type: 'custom',
                })
                .returning();

            if (!result) throw new AppError('Library not created', { statusCode: 500 });

            return result;
        });

        return toLibraryMinDTO(result);
    } catch (e) {
        if (isDuplicateKey(e)) throw new AppError(`You already have library with that name.`, { statusCode: 409 });
        throw e;
    }
};

export const deleteUserLibrary = async (userId: string, libraryId: string): Promise<void> => {
    await db.transaction(async (tx) => {
        const [library] = await tx
            .select({ id: libraries.id, type: libraries.type })
            .from(libraries)
            .where(and(eq(libraries.userId, userId), eq(libraries.id, libraryId)));

        if (!library) throw new LibraryNotFoundError();

        if (library.type !== 'custom') throw new AppError(`You can only delete custom playlists`, { statusCode: 403 });

        await tx.delete(libraries).where(eq(libraries.id, library.id));
    });
};
export const addContentToUserLibrary = async (
    userId: string,
    libraryId: string,
    contentId: string,
    type: 'movie' | 'series'
): Promise<void> => {
    try {
        const conditions = [eq(libraries.userId, userId)];
        if (libraryId === 'watchlist') conditions.push(eq(libraries.type, 'watchlist'));
        else conditions.push(eq(libraries.id, libraryId));

        await db.transaction(async (tx) => {
            const [library] = await tx
                .select({ id: libraries.id })
                .from(libraries)
                .where(and(...conditions));
            if (!library) throw new LibraryNotFoundError();

            if (type === 'movie') {
                const [movie] = await tx.select({ id: movies.id }).from(movies).where(eq(movies.id, contentId));
                if (!movie) throw new AppError('Movie not found', { statusCode: 404 });
                await tx.insert(libraryItems).values({ libraryId: library.id, movieId: movie.id });
            } else {
                const [s] = await tx.select({ id: series.id }).from(series).where(eq(series.id, contentId));
                if (!s) throw new AppError('Series not found', { statusCode: 404 });
                await tx.insert(libraryItems).values({ libraryId: library.id, seriesId: s.id });
            }

            await tx
                .update(libraries)
                .set({ size: sql`${libraries.size} + 1` })
                .where(eq(libraries.id, library.id));
        });
    } catch (err) {
        if (isDuplicateKey(err)) throw new AppError(`Content is already in library.`, { statusCode: 409 });
        throw err;
    }
};

export const removeContentFromUserLibrary = async (
    userId: string,
    libraryId: string,
    contentId: string,
    type: 'movie' | 'series'
): Promise<void> => {
    const conditions = [eq(libraries.userId, userId)];
    if (libraryId === 'watchlist') conditions.push(eq(libraries.type, 'watchlist'));
    else conditions.push(eq(libraries.id, libraryId));

    await db.transaction(async (tx) => {
        const [library] = await tx
            .select({ id: libraries.id })
            .from(libraries)
            .where(and(...conditions));
        if (!library) throw new LibraryNotFoundError();

        const deleteFilter =
            type === 'movie'
                ? and(eq(libraryItems.libraryId, library.id), eq(libraryItems.movieId, contentId))
                : and(eq(libraryItems.libraryId, library.id), eq(libraryItems.seriesId, contentId));

        const modified = await tx.delete(libraryItems).where(deleteFilter);
        if (modified.rowCount === 0) throw new AppError('Content not found in library', { statusCode: 404 });

        await tx
            .update(libraries)
            .set({ size: sql`${libraries.size} - 1` })
            .where(eq(libraries.id, library.id));
    });
};

export const getUserLibrary = async (userId: string, libraryId: string): Promise<LibraryDTO> => {
    const result = await db.query.libraries.findFirst({
        where: and(eq(libraries.userId, userId), eq(libraries.id, libraryId)),
        with: { user: true },
    });

    if (!result) throw new LibraryNotFoundError();

    return toLibraryDTO(result);
};

export const getUserLibraryItems = async (
    userId: string,
    libraryId: string,
    options: {
        page: number;
        limit: number;
        search?: string;
    }
): Promise<PaginatedResponse<LibraryItemDTO>> => {
    const offset = (options.page - 1) * options.limit;

    const searchFilter = options.search
        ? sql`(${ilike(movies.title, `%${options.search}%`)} OR ${ilike(series.title, `%${options.search}%`)})`
        : null;

    const conditions = [searchFilter, eq(libraryItems.libraryId, libraryId)];
    const filters = and(...conditions.filter((c) => c != null));

    const [results, total] = await db.transaction(async (tx) => {
        const [library] = await tx
            .select({ id: libraries.id })
            .from(libraries)
            .where(and(eq(libraries.id, libraryId), eq(libraries.userId, userId)));

        if (!library) throw new LibraryNotFoundError();

        return Promise.all([
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
                .limit(options.limit)
                .offset(offset),
            tx
                .select({ value: count() })
                .from(libraryItems)
                .leftJoin(movies, eq(libraryItems.movieId, movies.id))
                .leftJoin(series, eq(libraryItems.seriesId, series.id))
                .where(filters),
        ]);
    });

    const totalItems = total[0]?.value ?? 0;

    return {
        data: results.map(toLibraryItemDTO),
        meta: {
            totalItems,
            itemCount: results.length,
            itemsPerPage: options.limit,
            totalPages: Math.ceil(totalItems / options.limit),
            currentPage: options.page,
        },
    };
};
