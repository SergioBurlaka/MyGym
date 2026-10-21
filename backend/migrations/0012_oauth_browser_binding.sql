-- Pending requests live 10 minutes and can't get a browser binding after
-- the fact - drop them so the NOT NULL column can be added.
DELETE FROM "oauth_authorization_requests";--> statement-breakpoint
ALTER TABLE "oauth_authorization_requests" ADD COLUMN "browser_hash" text NOT NULL;
