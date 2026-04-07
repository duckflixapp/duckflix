CREATE TABLE "system_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"settings" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"type" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"is_used" boolean DEFAULT false NOT NULL,
	"user_agent" text,
	"ip_address" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"is_verified_email" boolean DEFAULT false NOT NULL,
	"password" text NOT NULL,
	"role" text DEFAULT 'watcher' NOT NULL,
	"system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "subtitles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"name" text NOT NULL,
	"language" text NOT NULL,
	"storage_key" text NOT NULL,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"width" integer,
	"height" integer NOT NULL,
	"is_original" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"storage_key" text NOT NULL,
	"file_size" bigint,
	"mime_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"uploader_id" uuid,
	"duration" integer,
	"status" text DEFAULT 'processing' NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movie_genres" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "movie_genres_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "movies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"title" text NOT NULL,
	"overview" text,
	"banner_url" text,
	"poster_url" text,
	"rating" numeric(3, 1) DEFAULT '0.0',
	"release_year" integer,
	"runtime" integer,
	"tmdb_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movies_video_id_unique" UNIQUE("video_id"),
	CONSTRAINT "movies_tmdb_id_unique" UNIQUE("tmdb_id")
);
--> statement-breakpoint
CREATE TABLE "movies_to_genres" (
	"movie_id" uuid NOT NULL,
	"genre_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"video_id" uuid,
	"movie_version_id" uuid,
	"type" text DEFAULT 'info' NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'custom' NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"library_id" uuid NOT NULL,
	"movie_id" uuid,
	"series_id" uuid,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_xor" CHECK ((movie_id IS NOT NULL) <> (series_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"overview" text,
	"poster_url" text,
	"banner_url" text,
	"rating" numeric(3, 1),
	"first_air_date" text,
	"last_air_date" text,
	"status" text,
	"tmdb_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "series_tmdb_id_unique" UNIQUE("tmdb_id")
);
--> statement-breakpoint
CREATE TABLE "series_episodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"video_id" uuid NOT NULL,
	"episode_number" integer NOT NULL,
	"name" text NOT NULL,
	"overview" text,
	"air_date" text,
	"runtime" integer,
	"still_url" text,
	"rating" numeric(3, 1),
	"tmdb_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "series_episodes_tmdb_id_unique" UNIQUE("tmdb_id")
);
--> statement-breakpoint
CREATE TABLE "series_genres" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "series_genres_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "series_seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"series_id" uuid NOT NULL,
	"season_number" integer NOT NULL,
	"name" text NOT NULL,
	"overview" text,
	"poster_url" text,
	"air_date" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "series_to_genres" (
	"series_id" uuid NOT NULL,
	"genre_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_tokens" ADD CONSTRAINT "account_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtitles" ADD CONSTRAINT "subtitles_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_versions" ADD CONSTRAINT "video_versions_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movies" ADD CONSTRAINT "movies_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movies_to_genres" ADD CONSTRAINT "movies_to_genres_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movies_to_genres" ADD CONSTRAINT "movies_to_genres_genre_id_movie_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."movie_genres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_movie_version_id_video_versions_id_fk" FOREIGN KEY ("movie_version_id") REFERENCES "public"."video_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library" ADD CONSTRAINT "library_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_library_id_library_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."library"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_episodes" ADD CONSTRAINT "series_episodes_season_id_series_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."series_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_episodes" ADD CONSTRAINT "series_episodes_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_seasons" ADD CONSTRAINT "series_seasons_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_to_genres" ADD CONSTRAINT "series_to_genres_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_to_genres" ADD CONSTRAINT "series_to_genres_genre_id_series_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."series_genres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "movies_created_at_idx" ON "movies" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "movies_rating_idx" ON "movies" USING btree ("rating");--> statement-breakpoint
CREATE INDEX "movies_fts_idx" ON "movies" USING gin ((setweight(to_tsvector('english', "title"), 'A') || 
            setweight(to_tsvector('english', coalesce("overview", '')), 'B')));--> statement-breakpoint
CREATE INDEX "movie_genre_idx" ON "movies_to_genres" USING btree ("movie_id","genre_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_name_unique_key" ON "library" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "library_movie_unique_idx" ON "library_items" USING btree ("library_id","movie_id");--> statement-breakpoint
CREATE UNIQUE INDEX "library_series_unique_idx" ON "library_items" USING btree ("library_id","series_id");--> statement-breakpoint
CREATE INDEX "series_created_at_idx" ON "series" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "series_rating_idx" ON "series" USING btree ("rating");--> statement-breakpoint
CREATE INDEX "series_fts_idx" ON "series" USING gin ((setweight(to_tsvector('english', "title"), 'A') || 
            setweight(to_tsvector('english', coalesce("overview", '')), 'B')));--> statement-breakpoint
CREATE UNIQUE INDEX "season_episode_unique" ON "series_episodes" USING btree ("season_id","episode_number");--> statement-breakpoint
CREATE UNIQUE INDEX "series_season_unique" ON "series_seasons" USING btree ("series_id","season_number");--> statement-breakpoint
CREATE INDEX "series_genre_idx" ON "series_to_genres" USING btree ("series_id","genre_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION update_library_size()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE library SET size = size + 1 WHERE id = NEW.library_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE library SET size = size - 1 WHERE id = OLD.library_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

--> statement-breakpoint
CREATE TRIGGER library_size_trigger
AFTER INSERT OR DELETE ON library_items
FOR EACH ROW EXECUTE FUNCTION update_library_size();