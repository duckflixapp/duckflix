import { videoService } from './services/video.service';
import { videoSubtitlesService } from './services/subtitles.service';
import { videoVersionsService } from './services/versions.service';
import { drizzleVideosRepository, drizzleVideoSubtitlesRepository, drizzleVideoVersionsRepository } from './videos.drizzle.repository';

export const videosRepository = drizzleVideosRepository;
export const videoVersionsRepository = drizzleVideoVersionsRepository;
export const videoSubtitlesRepository = drizzleVideoSubtitlesRepository;

export { videoService, videoVersionsService, videoSubtitlesService };
