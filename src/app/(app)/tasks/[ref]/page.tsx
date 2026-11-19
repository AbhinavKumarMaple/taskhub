import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOwner } from "@/server/auth";
import { isAppError } from "@/server/errors";
import { loadTaskDetail } from "@/server/actions/task-detail-data";
import { TaskDetail } from "@/components/task/task-detail";
import { isTaskRef } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/tasks/[ref]">): Promise<Metadata> {
  const { ref } = await params;
  return { title: decodeURIComponent(ref).toUpperCase() };
}

/** Full-page task detail (same component as the sheet). */
export default async function TaskDetailPage({ params }: PageProps<"/tasks/[ref]">) {
  const { ref: raw } = await params;
  const access = await requireOwner();
  const ref = decodeURIComponent(raw).trim().toUpperCase();
  if (!isTaskRef(ref)) notFound();
  let data;
  try {
    data = await loadTaskDetail(access, ref);
  } catch (err) {
    if (isAppError(err) && err.code === "not_found") notFound();
    throw err;
  }
  return <TaskDetail data={data} mode="page" />;
}
