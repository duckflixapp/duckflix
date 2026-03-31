import { count } from 'drizzle-orm';
import { db } from '@shared/configs/db';
import { movieGenres } from '@shared/schema/movie.schema';
import { seriesGenres } from '@shared/schema';
import { tmdbClient } from '@shared/lib/tmdb';

const seedMovieGenres = async () => {
    const { genres } = await tmdbClient.getMovieGenres({ language: 'en' });

    const values = genres.map(({ name }) => ({ name: name.toLowerCase() }));
    await db.insert(movieGenres).values(values);
};

const seendSeriesGenres = async () => {
    const { genres } = await tmdbClient.getTVGenres({ language: 'en' });

    const values = genres.map(({ name }) => ({ name: name.toLowerCase() }));
    await db.insert(seriesGenres).values(values);
};

export const seedDatabase = async () => {
    const [totalMovieGenres] = await db.select({ value: count(movieGenres.id) }).from(movieGenres);
    if (totalMovieGenres?.value === 0) await seedMovieGenres();

    const [totalSeriesGenres] = await db.select({ value: count(seriesGenres.id) }).from(seriesGenres);
    if (totalSeriesGenres?.value === 0) await seendSeriesGenres();
};
