CREATE TABLE `system_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`settings` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`metadata` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_logs_actor_user_id_idx` ON `audit_logs` (`actor_user_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_action_idx` ON `audit_logs` (`action`);--> statement-breakpoint
CREATE INDEX `audit_logs_created_at_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `account_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`type` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`is_used` integer DEFAULT false NOT NULL,
	`user_agent` text,
	`ip_address` text,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`is_verified_email` integer DEFAULT false NOT NULL,
	`password` text NOT NULL,
	`role` text DEFAULT 'watcher' NOT NULL,
	`system` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `subtitles` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`name` text NOT NULL,
	`language` text NOT NULL,
	`storage_key` text NOT NULL,
	`external_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `video_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`width` integer,
	`height` integer NOT NULL,
	`is_original` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`storage_key` text NOT NULL,
	`file_size` integer,
	`mime_type` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `videos` (
	`id` text PRIMARY KEY NOT NULL,
	`uploader_id` text,
	`duration` integer,
	`status` text DEFAULT 'processing' NOT NULL,
	`type` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`uploader_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `watch_history` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`video_id` text NOT NULL,
	`last_position` integer DEFAULT 0 NOT NULL,
	`is_finished` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_video_idx` ON `watch_history` (`user_id`,`video_id`);--> statement-breakpoint
CREATE TABLE `movie_genres` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `movie_genres_name_unique` ON `movie_genres` (`name`);--> statement-breakpoint
CREATE TABLE `movies` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`title` text NOT NULL,
	`overview` text,
	`banner_url` text,
	`poster_url` text,
	`rating` real DEFAULT 0,
	`release_year` integer,
	`runtime` integer,
	`tmdb_id` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `movies_video_id_unique` ON `movies` (`video_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `movies_tmdb_id_unique` ON `movies` (`tmdb_id`);--> statement-breakpoint
CREATE INDEX `movies_created_at_idx` ON `movies` (`created_at`);--> statement-breakpoint
CREATE INDEX `movies_rating_idx` ON `movies` (`rating`);--> statement-breakpoint
CREATE TABLE `movies_to_genres` (
	`movie_id` text NOT NULL,
	`genre_id` text NOT NULL,
	FOREIGN KEY (`movie_id`) REFERENCES `movies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`genre_id`) REFERENCES `movie_genres`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `movie_genre_idx` ON `movies_to_genres` (`movie_id`,`genre_id`);--> statement-breakpoint
CREATE TABLE `casts` (
	`id` text PRIMARY KEY NOT NULL,
	`tmdb_id` integer NOT NULL,
	`name` text NOT NULL,
	`original_name` text,
	`gender` integer,
	`known_for_department` text,
	`popularity` real,
	`profile_url` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `casts_tmdb_id_unique` ON `casts` (`tmdb_id`);--> statement-breakpoint
CREATE INDEX `casts_name_idx` ON `casts` (`name`);--> statement-breakpoint
CREATE INDEX `casts_created_at_idx` ON `casts` (`created_at`);--> statement-breakpoint
CREATE TABLE `episodes_to_casts` (
	`episode_id` text NOT NULL,
	`cast_id` text NOT NULL,
	`credit_id` text NOT NULL,
	`type` text DEFAULT 'cast' NOT NULL,
	`character` text,
	`order` integer,
	FOREIGN KEY (`episode_id`) REFERENCES `series_episodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cast_id`) REFERENCES `casts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `episode_cast_credit_unique` ON `episodes_to_casts` (`episode_id`,`credit_id`);--> statement-breakpoint
CREATE INDEX `episode_cast_episode_idx` ON `episodes_to_casts` (`episode_id`);--> statement-breakpoint
CREATE INDEX `episode_cast_cast_idx` ON `episodes_to_casts` (`cast_id`);--> statement-breakpoint
CREATE TABLE `movies_to_casts` (
	`movie_id` text NOT NULL,
	`cast_id` text NOT NULL,
	`credit_id` text NOT NULL,
	`type` text DEFAULT 'cast' NOT NULL,
	`character` text,
	`order` integer,
	FOREIGN KEY (`movie_id`) REFERENCES `movies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cast_id`) REFERENCES `casts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `movie_cast_credit_unique` ON `movies_to_casts` (`movie_id`,`credit_id`);--> statement-breakpoint
CREATE INDEX `movie_cast_movie_idx` ON `movies_to_casts` (`movie_id`);--> statement-breakpoint
CREATE INDEX `movie_cast_cast_idx` ON `movies_to_casts` (`cast_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`video_id` text,
	`movie_version_id` text,
	`type` text DEFAULT 'info' NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`is_read` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`movie_version_id`) REFERENCES `video_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `library` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'custom' NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_name_unique_key` ON `library` (`user_id`,`name`);--> statement-breakpoint
CREATE TABLE `library_items` (
	`id` text PRIMARY KEY NOT NULL,
	`library_id` text NOT NULL,
	`movie_id` text,
	`series_id` text,
	`added_at` text NOT NULL,
	FOREIGN KEY (`library_id`) REFERENCES `library`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`movie_id`) REFERENCES `movies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "content_xor" CHECK((movie_id IS NOT NULL) != (series_id IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `library_movie_unique_idx` ON `library_items` (`library_id`,`movie_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `library_series_unique_idx` ON `library_items` (`library_id`,`series_id`);--> statement-breakpoint
CREATE TABLE `series` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`overview` text,
	`poster_url` text,
	`banner_url` text,
	`rating` real,
	`first_air_date` text,
	`last_air_date` text,
	`status` text,
	`tmdb_id` integer,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `series_tmdb_id_unique` ON `series` (`tmdb_id`);--> statement-breakpoint
CREATE INDEX `series_created_at_idx` ON `series` (`created_at`);--> statement-breakpoint
CREATE INDEX `series_rating_idx` ON `series` (`rating`);--> statement-breakpoint
CREATE TABLE `series_episodes` (
	`id` text PRIMARY KEY NOT NULL,
	`season_id` text NOT NULL,
	`video_id` text NOT NULL,
	`episode_number` integer NOT NULL,
	`name` text NOT NULL,
	`overview` text,
	`air_date` text,
	`runtime` integer,
	`still_url` text,
	`rating` real,
	`tmdb_id` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `series_seasons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `series_episodes_tmdb_id_unique` ON `series_episodes` (`tmdb_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `season_episode_unique` ON `series_episodes` (`season_id`,`episode_number`);--> statement-breakpoint
CREATE TABLE `series_genres` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `series_genres_name_unique` ON `series_genres` (`name`);--> statement-breakpoint
CREATE TABLE `series_seasons` (
	`id` text PRIMARY KEY NOT NULL,
	`series_id` text NOT NULL,
	`season_number` integer NOT NULL,
	`name` text NOT NULL,
	`overview` text,
	`poster_url` text,
	`air_date` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `series_season_unique` ON `series_seasons` (`series_id`,`season_number`);--> statement-breakpoint
CREATE TABLE `series_to_genres` (
	`series_id` text NOT NULL,
	`genre_id` text NOT NULL,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`genre_id`) REFERENCES `series_genres`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `series_genre_idx` ON `series_to_genres` (`series_id`,`genre_id`);