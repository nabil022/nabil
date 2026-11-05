// The study planner: fit homework into the afternoons so nothing is left for
// after the cut-off.
//
// Earliest deadline first. A task "due" on a date is handed in that day, so it
// must be finished the evening before. Each day's study window runs from the
// study start time to (cut-off − buffer), capped at a daily maximum, and the
// window for today starts no earlier than now.

import { PLANNER } from './balance';
import { addDays, type ISODate } from './dates';

export interface PlanTask {
  id: string;
  title: string;
  subject: string;
  due: ISODate;
  estMin: number;
}

export interface PlanBlock {
  taskId: string;
  title: string;
  subject: string;
  startMin: number;
  endMin: number;
  minutes: number;
}

export interface PlanDay {
  date: ISODate;
  windowStartMin: number;
  windowEndMin: number;
  capacityMin: number;
  usedMin: number;
  blocks: PlanBlock[];
}

export interface PlanRisk {
  taskId: string;
  title: string;
  due: ISODate;
  unscheduledMin: number;
  /** Already due today or earlier. */
  overdue: boolean;
}

export interface PlanInput {
  tasks: readonly PlanTask[];
  today: ISODate;
  nowMin: number;
  studyStartMin: number;
  cutoffMin: number;
  bufferMin: number;
  maxDailyMin: number;
  horizonDays?: number;
}

export interface PlanResult {
  studyEndMin: number;
  days: PlanDay[];
  risks: PlanRisk[];
}

export function studyEnd(cutoffMin: number, bufferMin: number): number {
  // A cut-off just after midnight still means "tonight": treat 00:00-04:59 as late evening.
  const cutoff = cutoffMin < 5 * 60 ? cutoffMin + 24 * 60 : cutoffMin;
  return Math.min(cutoff - bufferMin, 24 * 60);
}

export function buildPlan(input: PlanInput): PlanResult {
  const horizon = input.horizonDays ?? PLANNER.HORIZON_DAYS;
  const endMin = studyEnd(input.cutoffMin, input.bufferMin);
  const tasks = [...input.tasks].sort((a, b) => (a.due === b.due ? b.estMin - a.estMin : a.due < b.due ? -1 : 1));
  const remaining = new Map(tasks.map((t) => [t.id, Math.max(0, Math.round(t.estMin))]));
  const days: PlanDay[] = [];

  for (let d = 0; d < horizon; d++) {
    const date = addDays(input.today, d);
    const startMin = d === 0 ? Math.max(input.studyStartMin, Math.ceil(input.nowMin / 5) * 5) : input.studyStartMin;
    const windowMin = Math.max(0, endMin - startMin);
    const capacity = Math.min(windowMin, input.maxDailyMin);
    const day: PlanDay = { date, windowStartMin: startMin, windowEndMin: endMin, capacityMin: capacity, usedMin: 0, blocks: [] };
    let cursor = startMin;

    for (const t of tasks) {
      const left = remaining.get(t.id)!;
      if (left <= 0 || t.due <= date) continue;
      const room = Math.min(endMin - cursor, capacity - day.usedMin);
      if (room < PLANNER.MIN_BLOCK_MIN && room < left) break;
      const chunk = Math.min(left, room);
      if (chunk <= 0) break;
      day.blocks.push({ taskId: t.id, title: t.title, subject: t.subject, startMin: cursor, endMin: cursor + chunk, minutes: chunk });
      day.usedMin += chunk;
      remaining.set(t.id, left - chunk);
      cursor += chunk + PLANNER.BREAK_MIN;
    }
    days.push(day);
  }

  const risks: PlanRisk[] = [];
  const lastPlanned = addDays(input.today, horizon);
  for (const t of tasks) {
    const left = remaining.get(t.id)!;
    // Work due after the planning horizon is not at risk yet, just not placed.
    if (left > 0 && t.due <= lastPlanned) {
      risks.push({ taskId: t.id, title: t.title, due: t.due, unscheduledMin: left, overdue: t.due <= input.today });
    }
  }
  return { studyEndMin: endMin, days, risks };
}
