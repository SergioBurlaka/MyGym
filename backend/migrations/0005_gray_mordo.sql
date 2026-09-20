ALTER TABLE "program_exercises" ADD COLUMN "target_sets" smallint DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "order_index" smallint DEFAULT 0 NOT NULL;