CREATE TABLE "deployment_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"space_id" text NOT NULL,
	"environment" text NOT NULL,
	"action" text NOT NULL,
	"version" text DEFAULT '' NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "environments" text[] DEFAULT '{Development,Production}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "deployable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "deployments" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "deployment_events" ADD CONSTRAINT "deployment_events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deployment_events_task_idx" ON "deployment_events" USING btree ("task_id","id");--> statement-breakpoint
CREATE INDEX "deployment_events_space_idx" ON "deployment_events" USING btree ("space_id","id");