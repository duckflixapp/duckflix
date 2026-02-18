interface SubtitleUploader {
    uploader_id: number;
    name: string;
    rank: string;
}

export interface SubtitleFile {
    file_id: number;
    cd_number: number;
    file_name: string;
}

export interface SubtitleData {
    id: string;
    type: string;
    attributes: {
        subtitle_id: string;
        language: string;
        download_count: number;
        new_download_count: number;
        hearing_impaired: boolean;
        hd: boolean;
        fps: number;
        votes: number;
        ratings: number;
        from_trusted: boolean;
        foreign_parts_only: boolean;
        upload_date: string;
        ai_translated: boolean;
        nb_cd: number;
        slug: string;
        machine_translated: boolean;
        release: string;
        comments: string;
        legacy_subtitle_id: number;
        legacy_uploader_id: number;
        uploader: SubtitleUploader;
        feature_details: unknown;
        url: string;
        related_links: unknown[];
        files: SubtitleFile[];
    };
}

export interface SmallSubtitleData {
    id: string;
    language: string;
    files: SubtitleFile[];
    url: string;
}

export interface SearchSubsResponse {
    total_pages: number;
    total_count: number;
    per_page: number;
    page: number;
    data: SubtitleData[];
}

export interface DownloadSubResponse {
    link: string;
    file_name: string;
    requests: number;
    remaining: number;
    message: string;
    reset_time: string;
    reset_time_utc: string;
}
