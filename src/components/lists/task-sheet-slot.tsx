import { Suspense } from "react";
import { TaskSheet } from "@/components/task/task-sheet";

/** The URL-driven task sheet (`?task=REF`) for list pages. Renders nothing without a ref. */
export function TaskSheetSlot({ taskRef }: { taskRef?: string }) {
  if (!taskRef) return null;
  return (
    <Suspense fallback={null}>
      <TaskSheet taskRef={taskRef} />
    </Suspense>
  );
}
