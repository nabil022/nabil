// The study planner's tasks; the scheduling itself lives in shared/planner.

import { LIMITS } from '../../shared/balance';
import { addDays, parseHM, type ISODate } from '../../shared/dates';
import { buildPlan, type PlanResult } from '../../shared/planner';
import type { TaskDoc, UserDoc } from '../../shared/types';
import type { Ctx } from '../ctx';
import { badRequest, bool, date as parseDate, int, notFound, str, type Body } from '../errors';

export interface PlannerView {
  today: ISODate;
  nowMin: number;
  cutoff: string;
  studyStart: string;
  bufferMin: number;
  maxDailyMin: number;
  open: TaskDoc[];
  done: TaskDoc[];
  plan: PlanResult;
}

export function plannerView(ctx: Ctx, u: UserDoc): PlannerView {
  const local = ctx.local(u);
  const tasks = ctx.db.tasks.by('user', u.id);
  const open = tasks.filter((t) => t.doneAt === null).sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.createdAt - b.createdAt));
  const done = tasks
    .filter((t) => t.doneAt !== null && t.due >= addDays(local.date, -14))
    .sort((a, b) => b.doneAt! - a.doneAt!);
  return {
    today: local.date,
    nowMin: local.minutes,
    cutoff: u.cutoff,
    studyStart: u.studyStart,
    bufferMin: u.studyBufferMin,
    maxDailyMin: u.studyMaxMin,
    open,
    done,
    plan: buildPlan({
      tasks: open,
      today: local.date,
      nowMin: local.minutes,
      studyStartMin: parseHM(u.studyStart)!,
      cutoffMin: parseHM(u.cutoff)!,
      bufferMin: u.studyBufferMin,
      maxDailyMin: u.studyMaxMin,
    }),
  };
}

export function addTask(ctx: Ctx, u: UserDoc, body: Body): PlannerView {
  if (ctx.db.tasks.by('user', u.id).length >= LIMITS.TASKS_PER_USER) throw badRequest('Clear out some finished tasks first.');
  const due = parseDate(body.due, 'Due date');
  if (due < ctx.today(u)) throw badRequest('That due date has already passed.');
  ctx.db.tasks.insert({
    id: ctx.newId(),
    userId: u.id,
    title: str(body.title, 'Task', { max: LIMITS.TASK_TITLE_MAX }),
    subject: body.subject ? str(body.subject, 'Subject', { max: 30 }) : '',
    due,
    estMin: int(body.estMin, 'Time needed', { min: 5, max: 600 }),
    doneAt: null,
    createdAt: ctx.now(),
  });
  return plannerView(ctx, u);
}

export function updateTask(ctx: Ctx, u: UserDoc, id: string, body: Body): PlannerView {
  const t = ctx.db.tasks.get(id);
  if (!t || t.userId !== u.id) throw notFound('That task does not exist.');
  const patch: Partial<TaskDoc> = {};
  if (body.title !== undefined) patch.title = str(body.title, 'Task', { max: LIMITS.TASK_TITLE_MAX });
  if (body.subject !== undefined) patch.subject = body.subject ? str(body.subject, 'Subject', { max: 30 }) : '';
  if (body.due !== undefined) patch.due = parseDate(body.due, 'Due date');
  if (body.estMin !== undefined) patch.estMin = int(body.estMin, 'Time needed', { min: 5, max: 600 });
  if (body.done !== undefined) patch.doneAt = bool(body.done, 'Done') ? ctx.now() : null;
  ctx.db.tasks.update(t.id, patch);
  return plannerView(ctx, u);
}

export function deleteTask(ctx: Ctx, u: UserDoc, id: string): PlannerView {
  const t = ctx.db.tasks.get(id);
  if (!t || t.userId !== u.id) throw notFound('That task does not exist.');
  ctx.db.tasks.delete(t.id);
  return plannerView(ctx, u);
}
