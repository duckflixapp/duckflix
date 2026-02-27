import type { LibraryDTO, LibraryItemDTO, LibraryMinDTO } from '@duckflix/shared';
import { db } from '../../shared/configs/db';
import { libraries, libraryItems, movies } from '../../shared/schema';
import { and, count, eq, sql } from 'drizzle-orm';
import { toLibraryDTO, toLibraryItemDTO, toLibraryMinDTO } from '../../shared/mappers/library.mapper';
import { AppError } from '../../shared/errors';
import { isDuplicateKey } from '../../shared/db.errors';
import { LibraryNotFoundError } from './library.errors';

export const getUserLibraries = async (userId: string, options?: { custom?: boolean }): Promise<LibraryMinDTO[]> => {
    const custom = !!options?.custom ? eq(libraries.type, 'custom') : null;

    const conditions = [custom, eq(libraries.userId, userId)];
    const filters = and(...conditions.filter((c) => c != null));

    const results = await db.select().from(libraries).where(filters);

    return results.map(toLibraryMinDTO);
};

const unallowedLibraryNames = ['watchlist', 'library'];
const MAX_LIBRARIES = 10;
export const createUserLibrary = async (userId: string, context: { name: string }): Promise<LibraryMinDTO> => {
    if (unallowedLibraryNames.includes(context.name.toLowerCase()))
        throw new AppError('Name is in not-allowed list: ' + unallowedLibraryNames, { statusCode: 409 });

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

export const addMovieToUserLibrary = async (userId: string, libraryId: string, movieId: string): Promise<void> => {
    try {
        await db.transaction(async (tx) => {
            const [library] = await tx
                .select({ id: libraries.id })
                .from(libraries)
                .where(and(eq(libraries.id, libraryId), eq(libraries.userId, userId)));
            if (!library) throw new LibraryNotFoundError();

            const [movie] = await tx.select({ id: movies.id }).from(movies).where(eq(movies.id, movieId));
            if (!movie) throw new AppError('Movie not found', { statusCode: 404 });

            await tx.insert(libraryItems).values({
                libraryId: library.id,
                movieId: movie.id,
            });
            await tx
                .update(libraries)
                .set({ size: sql`${libraries.size} + 1` })
                .where(eq(libraries.id, library.id));
        });
    } catch (err) {
        if (isDuplicateKey(err)) throw new AppError(`Movie is already in library.`, { statusCode: 409 });
        throw err;
    }
};

export const removeMovieFromUserLibrary = async (userId: string, libraryId: string, movieId: string): Promise<void> => {
    await db.transaction(async (tx) => {
        const [library] = await tx
            .select({ id: libraries.id })
            .from(libraries)
            .where(and(eq(libraries.id, libraryId), eq(libraries.userId, userId)));
        if (!library) throw new LibraryNotFoundError();

        await tx.delete(libraryItems).where(and(eq(libraryItems.libraryId, libraryId), eq(libraryItems.movieId, movieId)));
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

export const getUserLibraryItems = async (userId: string, libraryId: string): Promise<LibraryItemDTO[]> => {
    const results = await db.transaction(async (tx) => {
        const [library] = await tx
            .select({ id: libraries.id })
            .from(libraries)
            .where(and(eq(libraries.id, libraryId), eq(libraries.userId, userId)));

        if (!library) throw new LibraryNotFoundError();

        return await tx.query.libraryItems.findMany({
            where: eq(libraryItems.libraryId, library.id),
            with: { movie: true },
        });
    });

    return results.map(toLibraryItemDTO);
};
