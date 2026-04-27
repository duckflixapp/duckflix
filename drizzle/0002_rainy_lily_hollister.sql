ALTER TABLE `sessions` ADD `device_name` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `last_ip_address` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `last_refreshed_at` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `revoked_at` text;--> statement-breakpoint
ALTER TABLE `sessions` DROP COLUMN `is_used`;