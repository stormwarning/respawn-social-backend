ALTER TABLE "games" ADD COLUMN "slug" text;--> statement-breakpoint
UPDATE "games" SET "slug" = "payload"->>'slug' WHERE "slug" IS NULL;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_slug_unique" UNIQUE("slug");