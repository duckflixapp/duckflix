import { count } from 'drizzle-orm';
import { db } from '@shared/configs/db';
import { movieGenres } from '@shared/schema/movie.schema';
import { getTMDBMovieGenres } from '@shared/services/metadata/providers/tmdb.provider';

const seedGenres = async () => {
    const data = await getTMDBMovieGenres();
    const values = data.map((g) => ({ name: g }));
    await db.insert(movieGenres).values(values);
};

export const seedDatabase = async () => {
    const [totalGenres] = await db.select({ value: count(movieGenres.id) }).from(movieGenres);
    if (totalGenres?.value === 0) await seedGenres();
};
