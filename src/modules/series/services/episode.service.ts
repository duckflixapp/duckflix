import { db } from '@shared/configs/db';
import { toEpisodeDTO } from '@shared/mappers/series.mapper';
import { seriesEpisodes } from '@schema/series.schema';
import { eq } from 'drizzle-orm';
import { SeasonEpisodeNotFound } from '../errors';

export const getEpisodeById = async (episodeId: string) => {
    const episode = await db.query.seriesEpisodes.findFirst({
        where: eq(seriesEpisodes.id, episodeId),
        with: {
            video: {
                with: {
                    versions: true,
                    uploader: true,
                    subtitles: true,
                },
            },
            season: true,
        },
    });

    if (!episode) throw new SeasonEpisodeNotFound();
    return toEpisodeDTO(episode);
};
