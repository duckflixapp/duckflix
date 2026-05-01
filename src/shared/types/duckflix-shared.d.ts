import type {
    EpisodeDTO as SharedEpisodeDTO,
    LibraryDTO as SharedLibraryDTO,
    LibraryMinDTO as SharedLibraryMinDTO,
    MovieDetailedDTO as SharedMovieDetailedDTO,
    MovieDTO as SharedMovieDTO,
    NotificationDTO as SharedNotificationDTO,
    UserRole,
    VideoDTO as SharedVideoDTO,
    VideoMinDTO as SharedVideoMinDTO,
    WatchHistoryDTO as SharedWatchHistoryDTO,
} from '@duckflixapp/shared';

declare module '@duckflixapp/shared' {
    export interface AccountRefDTO {
        id: string;
        email: string;
        role: UserRole;
        system: boolean;
    }

    export type AccountVideoMinDTO = Omit<SharedVideoMinDTO, 'uploaderId'> & {
        accountId: string | null;
    };

    export type AccountVideoDTO = Omit<SharedVideoDTO, 'uploader' | 'uploaderId'> &
        AccountVideoMinDTO & {
            user: AccountRefDTO | null;
        };

    export type AccountWatchHistoryDTO = Omit<SharedWatchHistoryDTO, 'userId'> & {
        accountId: string;
    };

    export type AccountLibraryMinDTO = Omit<SharedLibraryMinDTO, 'userId'> & {
        accountId: string;
    };

    export type AccountLibraryDTO = Omit<SharedLibraryDTO, 'user' | 'userId'> &
        AccountLibraryMinDTO & {
            user: AccountRefDTO;
        };

    export type AccountNotificationDTO = Omit<SharedNotificationDTO, 'userId'> & {
        accountId: string | null;
    };

    export type AccountMovieDTO = Omit<SharedMovieDTO, 'video'> & {
        video: AccountVideoDTO;
    };

    export type AccountMovieDetailedDTO = Omit<SharedMovieDetailedDTO, 'video'> & {
        video: AccountVideoDTO;
    };

    export type AccountEpisodeDTO = Omit<SharedEpisodeDTO, 'video'> & {
        video: AccountVideoDTO | null;
    };
}

export {};
