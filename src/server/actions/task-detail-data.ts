import * as svc from "@/server/service";
import type { Milestone, Settings, SpaceRef, TaskFull } from "@/lib/types";

export type TaskDetailData = {
  task: TaskFull;
  settings: Settings;
  /** Non-archived Spaces (for the Space picker of top-level tasks). */
  spaces: SpaceRef[];
  /** Milestones in the task's Space (non-archived), for the milestone picker. */
  milestones: Milestone[];
};

/** Everything the task detail needs, in one call. */
export async function loadTaskDetail(a: svc.Access, ref: string): Promise<TaskDetailData> {
  const task = await svc.getTask(a, ref);
  const [settings, spaceRefs, milestones] = await Promise.all([
    svc.getSettings(a),
    svc.listSpaceRefs(a),
    svc.listMilestones(a, { spaces: [task.space.id] }),
  ]);
  const spaces = spaceRefs.filter((s) => !s.archived).map(({ id, name, color }) => ({ id, name, color }));
  return { task, settings, spaces, milestones };
}
