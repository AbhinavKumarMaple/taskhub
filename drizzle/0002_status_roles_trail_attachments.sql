CREATE TABLE "attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"caption" text DEFAULT '' NOT NULL,
	"actor" text NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "status_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"space_id" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "done_status" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "closed_statuses" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "reason_statuses" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "status_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "status_changed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_events" ADD CONSTRAINT "status_events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_task_idx" ON "attachments" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "status_events_task_idx" ON "status_events" USING btree ("task_id","id");--> statement-breakpoint
-- Status roles: the done status used to be "the last one". Add Blocked (before it) and Cancelled (after it).
UPDATE "settings" SET "done_status" = "statuses"[array_length("statuses", 1)] WHERE "done_status" = '';--> statement-breakpoint
UPDATE "settings" SET "statuses" = array_cat(array_remove("statuses", "done_status"), ARRAY['Blocked', "done_status"]) WHERE NOT ('Blocked' = ANY("statuses"));--> statement-breakpoint
UPDATE "settings" SET "statuses" = array_append("statuses", 'Cancelled') WHERE NOT ('Cancelled' = ANY("statuses"));--> statement-breakpoint
UPDATE "settings" SET "closed_statuses" = ARRAY["done_status", 'Cancelled'], "reason_statuses" = ARRAY['Blocked', 'Cancelled'];--> statement-breakpoint
-- Status trail from the activity log (creation + every status change).
INSERT INTO "status_events" ("task_id", "space_id", "from_status", "to_status", "reason", "actor", "created_at")
SELECT t."id", a."space_id", a."changes"->'status'->>'from', a."changes"->'status'->>'to', '', a."actor", a."created_at"
FROM "activity" a JOIN "tasks" t ON t."ref" = a."entity_ref"
WHERE a."entity_type" = 'task' AND a."action" IN ('created', 'status') AND a."changes" ? 'status'
  AND a."changes"->'status'->>'to' IS NOT NULL AND a."space_id" IS NOT NULL
ORDER BY a."id";--> statement-breakpoint
UPDATE "tasks" t SET "status_changed_at" = coalesce(
  (SELECT max(e."created_at") FROM "status_events" e WHERE e."task_id" = t."id" AND e."to_status" = t."status"),
  t."created_at");
