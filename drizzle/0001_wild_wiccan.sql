CREATE TABLE `totp_backup_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`used_at` integer,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `users` ADD `totp_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `totp_secret` text;--> statement-breakpoint
ALTER TABLE `users` ADD `totp_secret_pending` text;