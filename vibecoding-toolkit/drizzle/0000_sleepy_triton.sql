CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text,
	`updated_by` text,
	`description` text NOT NULL,
	`instructions` text NOT NULL,
	`toolSet` text NOT NULL
);
