export interface Task {
  status: "Pending" | "Ready" | "Error";
  image_url?: string;
  error?: string;
}

const tasks = new Map<string, Task>();

export function createTask(): string {
  const id = crypto.randomUUID();
  tasks.set(id, { status: "Pending" });
  return id;
}

export function updateTask(id: string, update: Partial<Task>): void {
  const task = tasks.get(id);
  if (task) {
    Object.assign(task, update);
  }
}

export function getTask(id: string): Task | undefined {
  return tasks.get(id);
}
