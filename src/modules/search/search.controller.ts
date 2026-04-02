import { catchAsync } from '@shared/utils/catchAsync';
import type { Request, Response } from 'express';
import { searchQuerySchema } from './search.validator';
import { unifiedSearch } from './search.service';

export const search = catchAsync(async (req: Request, res: Response) => {
    const query = searchQuerySchema.parse(req.query);

    const options = { q: query.q ?? null, limit: query.limit, page: query.page, sort: query.sort, genres: query.genres };

    const paginatedData = await unifiedSearch(options);

    return res.status(200).json({
        status: 'success',
        ...paginatedData,
    });
});
