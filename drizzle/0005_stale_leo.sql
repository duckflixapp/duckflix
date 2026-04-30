CREATE TABLE `account_totp` (
	`account_id` text PRIMARY KEY NOT NULL,
	`secret` text,
	`pending_secret` text,
	`enabled` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `account_totp` (`account_id`, `secret`, `pending_secret`, `enabled`, `created_at`, `updated_at`)
SELECT
	`id`,
	`totp_secret`,
	`totp_secret_pending`,
	`totp_enabled`,
	`created_at`,
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM `users`
WHERE `totp_secret` IS NOT NULL OR `totp_secret_pending` IS NOT NULL OR `totp_enabled` = 1;
--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `totp_enabled`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `totp_secret`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `totp_secret_pending`;
