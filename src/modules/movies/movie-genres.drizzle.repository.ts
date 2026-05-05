import { inArray } from 'drizzle-orm';

import { db } from '@shared/configs/db';
import { movieGenres } from '@shared/schema/movie.schema';
import type { MovieGenresRepository } from './movies.ports';

export const drizzleMovieGenresRepository: MovieGenresRepository = {
    async create(name: string) {
        const results = await db.insert(movieGenres).values({ name }).returning();
        return results[0] ?? null;
    },

    async list() {
        return db.select().from(movieGenres).orderBy(movieGenres.name);
    },

    async findIdsByNames(names: string[]) {
        if (!names.length) return [];

        const results = await db
            .select({ id: movieGenres.id })
            .from(movieGenres)
            .where(inArray(movieGenres.name, names))
            .orderBy(movieGenres.name);

        return results.map(({ id }) => id);
    },
};
