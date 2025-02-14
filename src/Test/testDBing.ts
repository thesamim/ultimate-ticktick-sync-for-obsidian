import { Low, JSONFilePreset } from 'lowdb';
import { join } from 'path';
import { App } from 'obsidian';

interface Task {
	id: string;
	name: string;
	// Add other task properties here
}

interface Schema {
	tasks: Task[];
}

export class Database {
	private db: Low<Schema>;

	constructor(app: App) {
		const adapter = new JSONFile<Schema>(join(app.vault.adapter.basePath, 'data.json'));
		this.db = new Low(adapter);
		this.init();
	}

	private async init() {
		await this.db.read();
		this.db.data = this.db.data || { tasks: [] };
		await this.db.write();
	}

	async createTask(task: Task): Promise<void> {
		this.db.data.tasks.push(task);
		await this.db.write();
	}

	async readTask(id: string): Promise<Task | undefined> {
		return this.db.data.tasks.find(task => task.id === id);
	}

	async updateTask(updatedTask: Task): Promise<void> {
		const taskIndex = this.db.data.tasks.findIndex(task => task.id === updatedTask.id);
		if (taskIndex !== -1) {
			this.db.data.tasks[taskIndex] = updatedTask;
			await this.db.write();
		}
	}

	async deleteTask(id: string): Promise<void> {
		this.db.data.tasks = this.db.data.tasks.filter(task => task.id !== id);
		await this.db.write();
	}

	async getAllTasks(): Promise<Task[]> {
		return this.db.data.tasks;
	}
}
