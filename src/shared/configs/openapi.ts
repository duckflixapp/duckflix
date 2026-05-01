export const documentationTags = [
    // --- FOUNDATION & SECURITY ---
    {
        name: 'Health',
        description:
            'System vitals and service status monitoring. Provides real-time connectivity checks for database, storage, and processing workers.',
    },
    {
        name: 'Auth',
        description:
            'Handles user identity, secure session management, and registration. Supports dual-factor authentication via HTTP-only cookies or standard Bearer tokens.',
    },
    {
        name: 'User',
        description:
            'Personal profile management and user-specific data. Handles account settings, notification preferences, and personal watch history.',
    },
    {
        name: 'Account',
        description: 'Change account security & privacy settings, authentication methods and other',
    },
    {
        name: 'Profiles',
        description: 'Manage account profiles.',
    },

    // --- DISCOVERY & COLLECTIONS ---
    {
        name: 'Search',
        description:
            'Unified discovery engine. Implements high-speed indexing and filtered queries across movies, series, and cast members.',
    },
    {
        name: 'Library',
        description:
            'User-defined collections and content organization. Manages custom folders, watchlists, and the relational mapping between users and media assets.',
    },

    // --- CONTENT CATALOG (Metadata) ---
    {
        name: 'Movies',
        description:
            'Feature-length film management. Handles metadata for standalone titles, featured content curation, and specific movie-related attributes.',
    },
    {
        name: 'Movie Genres',
        description:
            'Taxonomy and classification management. Defines and organizes movie categories used for filtering and personalized recommendations.',
    },
    {
        name: 'TV Series',
        description:
            'Parent-level management for episodic content. Controls top-level metadata, production status, and global settings for shows.',
    },
    {
        name: 'Seasons',
        description: 'Intermediate organization for TV shows. Manages episode grouping, seasonal metadata, and release schedules.',
    },
    {
        name: 'Episodes',
        description:
            'Granular control of episodic media. Manages individual video assets, runtime metadata, and their relation within a specific season.',
    },

    // --- CORE MEDIA ENGINE---
    {
        name: 'Videos',
        description:
            'Core media library controller. Manages asset lifecycle, automated metadata enrichment via external providers, and video file organization.',
    },
    {
        name: 'Video Versions',
        description:
            'Management of multi-resolution video files. Handles different encodes (4K, 1080p, 720p) and specialized formats for adaptive streaming.',
    },
    {
        name: 'Video Subtitles',
        description:
            'Dedicated subtitle management for video assets. Includes manual uploads, automated provider discovery, and direct subtitle cloud-importing.',
    },
    {
        name: 'Tasks',
        description:
            'Monitoring and orchestration of background jobs. Manages FFmpeg transcoding pipelines, thumbnail generation, and complex video processing workflows.',
    },

    // --- DELIVERY & PLAYBACK ---
    {
        name: 'Media',
        description: 'General media utilities and shared session validation endpoints for cross-resource access and integrity checks.',
    },
    {
        name: 'Streaming',
        description:
            'High-performance delivery of media assets. Features adaptive bitrate HLS streaming, static file serving, and bandwidth-optimized delivery.',
    },
    {
        name: 'Live Streaming',
        description:
            'Real-time content delivery engine. Orchestrates master manifests, dynamic segment playlists, and secure session-based stream validation.',
    },
    {
        name: 'Subtitles',
        description: 'Subtitle delivery and format processing (SRT, VTT, ASS) for active streaming sessions.',
    },

    // --- ADMINISTRATION ---
    {
        name: 'Admin',
        description:
            'Administrative control plane. Provides tools for system configuration, user moderation, global analytics, and infrastructure health metrics.',
    },
];
