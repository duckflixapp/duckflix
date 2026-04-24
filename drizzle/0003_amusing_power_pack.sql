CREATE TABLE "casts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tmdb_id" integer NOT NULL,
	"name" text NOT NULL,
	"original_name" text,
	"gender" integer,
	"known_for_department" text,
	"popularity" numeric(8, 3),
	"profile_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "casts_tmdb_id_unique" UNIQUE("tmdb_id")
);
--> statement-breakpoint
CREATE TABLE "episodes_to_casts" (
	"episode_id" uuid NOT NULL,
	"cast_id" uuid NOT NULL,
	"credit_id" text NOT NULL,
	"type" text DEFAULT 'cast' NOT NULL,
	"character" text,
	"order" integer
);
--> statement-breakpoint
CREATE TABLE "movies_to_casts" (
	"movie_id" uuid NOT NULL,
	"cast_id" uuid NOT NULL,
	"credit_id" text NOT NULL,
	"type" text DEFAULT 'cast' NOT NULL,
	"character" text,
	"order" integer
);
--> statement-breakpoint
ALTER TABLE "episodes_to_casts" ADD CONSTRAINT "episodes_to_casts_episode_id_series_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."series_episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episodes_to_casts" ADD CONSTRAINT "episodes_to_casts_cast_id_casts_id_fk" FOREIGN KEY ("cast_id") REFERENCES "public"."casts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movies_to_casts" ADD CONSTRAINT "movies_to_casts_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movies_to_casts" ADD CONSTRAINT "movies_to_casts_cast_id_casts_id_fk" FOREIGN KEY ("cast_id") REFERENCES "public"."casts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "casts_name_idx" ON "casts" USING btree ("name");--> statement-breakpoint
CREATE INDEX "casts_created_at_idx" ON "casts" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "episode_cast_credit_unique" ON "episodes_to_casts" USING btree ("episode_id","credit_id");--> statement-breakpoint
CREATE INDEX "episode_cast_episode_idx" ON "episodes_to_casts" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "episode_cast_cast_idx" ON "episodes_to_casts" USING btree ("cast_id");--> statement-breakpoint
CREATE UNIQUE INDEX "movie_cast_credit_unique" ON "movies_to_casts" USING btree ("movie_id","credit_id");--> statement-breakpoint
CREATE INDEX "movie_cast_movie_idx" ON "movies_to_casts" USING btree ("movie_id");--> statement-breakpoint
CREATE INDEX "movie_cast_cast_idx" ON "movies_to_casts" USING btree ("cast_id");