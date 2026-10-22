CREATE TABLE IF NOT EXISTS "oauth_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"client_secret_hash" text,
	"token_endpoint_auth_method" text NOT NULL,
	"client_name" text NOT NULL,
	"client_uri" text,
	"redirect_uris" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
