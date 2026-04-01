import { catchAsync } from '@shared/utils/catchAsync';
import type { Request, Response } from 'express';
import { searchQuerySchema } from './search.validator';
import { searchMovies, searchSeries } from './search.service';

export const search = catchAsync(async (req: Request, res: Response) => {
    const query = searchQuerySchema.parse(req.query);

    const options = { q: query.q ?? null, limit: query.limit, page: query.page, sort: query.sort };

    const [movies, series] = await Promise.all([
        query.type.includes('movies') ? searchMovies(options) : Promise.resolve(undefined),
        query.type.includes('series') ? searchSeries(options) : Promise.resolve(undefined),
    ]);

    return res.status(200).json({
        status: 'success',
        data: {
            movies,
            series,
        },
    });
});
