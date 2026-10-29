"use client";

import type { BoardDto, TaskDto } from "@edge/contracts";
import { CRM_TASK_STATUSES } from "@edge/domain/crm/enums";
import { TASK_STATUS_LABELS } from "@edge/domain/crm/labels";
import { TaskPriorityBadge } from "@edge/ui/blocks/status-badges";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MessageSquare } from "lucide-react";
import Link from "next/link";
import { startTransition, useId, useState } from "react";
import { toast } from "sonner";
import { moveTaskAction } from "@/lib/actions/tasks";
import { FollowUpDue } from "./due";

type ColumnKey = keyof BoardDto;
const COLUMNS: ColumnKey[] = ["TODO", "IN_PROGRESS", "WAITING", "DONE"];

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function TaskCard({ task, dragging }: { task: TaskDto; dragging?: boolean }) {
  return (
    <div className={`bg-card grid gap-1.5 rounded-lg border p-3 text-sm shadow-sm ${dragging ? "rotate-1 shadow-lg" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <Link href={`/tasks/${task.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
          {task.title}
        </Link>
        <TaskPriorityBadge priority={task.priority} />
      </div>
      {task.leadName ? (
        <p className="text-muted-foreground truncate text-xs">{task.leadName}</p>
      ) : (
        <p className="text-muted-foreground truncate text-xs">{task.project.name}</p>
      )}
      <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
        <span>{task.dueAt ? <FollowUpDue at={task.dueAt} /> : <span>no due date</span>}</span>
        <span className="flex items-center gap-2">
          {task.commentCount ? (
            <span className="flex items-center gap-0.5">
              <MessageSquare className="size-3" /> {task.commentCount}
            </span>
          ) : null}
          {task.assignee ? (
            <span
              className="bg-edge-emerald flex size-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
              title={task.assignee.name}
              aria-label={`Assigned to ${task.assignee.name}`}
            >
              {initials(task.assignee.name)}
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}

function SortableCard({ task, column, disabled }: { task: TaskDto; column: ColumnKey; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, data: { column }, disabled });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      {...attributes}
      {...listeners}
      className={disabled ? "" : "cursor-grab active:cursor-grabbing"}
    >
      <TaskCard task={task} />
    </div>
  );
}

function Column({ column, tasks, disabled }: { column: ColumnKey; tasks: TaskDto[]; disabled: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${column}`, data: { column } });
  return (
    <div
      ref={setNodeRef}
      data-column={column}
      className={`bg-muted/40 flex min-h-64 flex-col gap-2 rounded-xl border p-2 ${isOver ? "border-edge-emerald" : ""}`}
    >
      <div className="flex items-center justify-between px-1 pt-1">
        <h2 className="text-sm font-semibold">{TASK_STATUS_LABELS[column]}</h2>
        <span className="text-muted-foreground text-xs tabular-nums">{tasks.length}</span>
      </div>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="grid gap-2">
          {tasks.map((t) => (
            <SortableCard key={t.id} task={t} column={column} disabled={disabled} />
          ))}
        </div>
      </SortableContext>
      {tasks.length === 0 ? (
        <p className="text-muted-foreground px-1 py-6 text-center text-xs">
          {column === "DONE" ? "Nothing done this week" : "Drop tasks here"}
        </p>
      ) : null}
    </div>
  );
}

/** Kanban board: drag between columns changes status, drag inside a column reorders. Optimistic, reverts on error. */
export function TaskBoard({ board, canWrite }: { board: BoardDto; canWrite: boolean }) {
  const [cols, setCols] = useState<BoardDto>(board);
  const [active, setActive] = useState<TaskDto | null>(null);
  // Fresh server data (after a move is saved, or a filter change) replaces the local columns.
  const [source, setSource] = useState(board);
  if (source !== board) {
    setSource(board);
    setCols(board);
  }
  const id = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const columnOf = (taskId: string, state: BoardDto = cols) => COLUMNS.find((c) => state[c].some((t) => t.id === taskId));

  function onDragStart(e: DragStartEvent) {
    const col = columnOf(String(e.active.id));
    setActive(col ? (cols[col].find((t) => t.id === String(e.active.id)) ?? null) : null);
  }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const from = columnOf(String(active.id));
    const to = (over.data.current?.column as ColumnKey | undefined) ?? columnOf(String(over.id));
    if (!from || !to || from === to) return;
    setCols((prev) => {
      const task = prev[from].find((t) => t.id === String(active.id));
      if (!task) return prev;
      const fromList = prev[from].filter((t) => t.id !== task.id);
      const toList = [...prev[to]];
      const overIndex = toList.findIndex((t) => t.id === String(over.id));
      toList.splice(overIndex >= 0 ? overIndex : toList.length, 0, { ...task, status: to as TaskDto["status"] });
      return { ...prev, [from]: fromList, [to]: toList };
    });
  }

  function onDragEnd(e: DragEndEvent) {
    setActive(null);
    const { active, over } = e;
    if (!over) return;
    const col = columnOf(String(active.id));
    if (!col) return;
    const list = cols[col];
    const oldIndex = list.findIndex((t) => t.id === String(active.id));
    const overIndex = list.findIndex((t) => t.id === String(over.id));
    const reordered = overIndex >= 0 && overIndex !== oldIndex ? arrayMove(list, oldIndex, overIndex) : list;
    const next = { ...cols, [col]: reordered };
    setCols(next);
    startTransition(async () => {
      const r = await moveTaskAction({ id: String(active.id), status: col, orderedIds: reordered.map((t) => t.id) });
      if (r.error) {
        toast.error(r.error);
        setCols(board);
      }
    });
  }

  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActive(null)}
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((c) => (
          <Column key={c} column={c} tasks={cols[c]} disabled={!canWrite} />
        ))}
      </div>
      <DragOverlay>{active ? <TaskCard task={active} dragging /> : null}</DragOverlay>
    </DndContext>
  );
}

export const BOARD_STATUSES = CRM_TASK_STATUSES;
