import TickTickSync from '@/main';
import { type App, TFile } from 'obsidian';
import type { ITask } from '@/api/types/Task';

export interface iFileMapRecord {
	whatitfound: string;
	type: string; //assumption: We either get Tasks or Items. if it's not a Task, it's an Item. good luck!
	ID: string | undefined;
	taskLines: string[]; //Will contain Task AND Note Lines.
	startLine: number;
	endLine: number;
	parent: number;
	heading: any;
}

export interface iFileMap {
	fileMapRecords: iFileMapRecord[];
}

export class FileMap {
	app: App;
	plugin: TickTickSync;
	fileMap: iFileMap | undefined;
	lineCount: number;
	headings: { heading: string; startLine: number; endLine: number; }[] | undefined;

	constructor(app: App, plugin: TickTickSync) {
		this.app = app;
		this.plugin = plugin;
	}

	async buildFileMap(file: TFile): Promise<iFileMap | null> {
		const data = this.app.metadataCache.getFileCache(file);
		if (!data) {
			return null;
		}
		const fileCachedContent: string = await this.app.vault.cachedRead(file);
		const lines = fileCachedContent.split('\n');
		this.lineCount = lines.length;

		this.fileMap = [] as unknown as iFileMap;
		this.fileMap.fileMapRecords = [];

		// Map headings by their start and end line ranges
		if (data?.headings) {
			this.headings = data.headings.map(heading => ({
				heading: heading.heading,
				startLine: heading.position.start.line,
				endLine: heading.position.end.line
			}));
		}

		//Thought we needed to avoid tasks inside notes. But the reality is, we only need the tasks that TTS cares about
		//keeping this here in case I change my mind.
		// const insideNoteRegex = /^\t*\s{2}\S/

		// Process listItems
		if ('listItems' in data) {
			// @ts-ignore
			console.log("List Items: ", data.listItems);
			data.listItems.forEach((item, index) => {
				if (item.task !== undefined) {
					let startLine = item.position.start.line;
					// console.log("--Text:", lines[startLine]);
					//only care about TTS tasks.
					const tickTickID = this.plugin.taskParser?.getTickTickId(lines[startLine]);
					const tickTickItemID = this.plugin.taskParser?.getLineItemId(lines[startLine]);
					const newTickTickItem = lines[startLine].startsWith('\t');
					if (tickTickID || tickTickItemID || newTickTickItem) {
						let endLine = item.position.end.line;

						let heading = null;
						if (this.headings) {
							heading = this.findHeadingForLine(this.headings, startLine);
						}
						let parentID = "-1"
						if (item.parent > 0) {
							parentID = this.resolveParent(item.parent);
						}

						// console.log("ParentIndex: ", parentID);
						// const parentIndex = item.parent

						// console.log("ParentIndex from Item: ", parentIndex);
						const taskLines: string[] = [];
						for (let i = startLine; i < (endLine + 1); i++) {
							taskLines.push(lines[i]);
						}

						const fileMapRecord: iFileMapRecord = {
							whatitfound: `${tickTickID} -- ${tickTickItemID}`,
							type: tickTickID ? 'Task' : 'Item', //assumption: We either get Tasks or Items. if it's not a Task, it's an Item. good luck!
							ID: tickTickID ? tickTickID : tickTickItemID,
							taskLines: taskLines,
							startLine: startLine,
							endLine: endLine,
							parent: parentID,
							heading: heading
						};
						this.fileMap.fileMapRecords.push(fileMapRecord);
					}
				}
			});
		}

		return this.fileMap;
	}

	// Helper function to find the heading for a given line

	getLastLine(): number {
		return this.lineCount + 1;
	}

	getInsertionLine(): number {
		const lastTask = this.findLastTask();
		console.log("Last Task: ", lastTask);
		if (lastTask && lastTask.ID) {
			return this.getEndLineForTask(lastTask.ID);
		}
		return this.getLastLine();
	}

	private findLastTask(): iFileMapRecord | undefined {
		// Filter only tasks (type === "Task")
		const tasks = this.fileMap.fileMapRecords.filter(record => record.type === "Task");

		if (tasks.length === 0) {
			// If no tasks are found, return undefined
			return undefined;
		}

		// Find the task with the highest endLine
		const lastTask = tasks.reduce((prev, current) =>
			(prev.endLine > current.endLine) ? prev : current
		);

		return lastTask;
	}

	getEndLineForTask(ID: string): number {
		// Find the task with the given ID
		const task = this.getTaskRecord(ID);

		if (!task) {
			throw new Error(`Task with ID ${ID} not found.`);
		}

		// Find all children of the task
		const children = this.fileMap.fileMapRecords.filter(record => record.parent === task.ID);

		if (children.length === 0) {
			// If no children, return the task's endLine
			return task.endLine + 1;
		}

		// Find the child with the highest endLine
		const childWithHighestEndLine = children.reduce((prev, current) =>
			(prev.endLine > current.endLine) ? prev : current
		);

		return childWithHighestEndLine.endLine + 1;
	}


	private findHeadingForLine(headings: any[], line: number) {
		for (let i = headings.length - 1; i >= 0; i--) {
			const heading = headings[i];
			if (line >= heading.startLine) {
				return heading.heading;
			}
		}
		return null;
	}

	//helper function to determine if a task is embedded in a task in a note
	private isInNote(listItems: ITask[]) {

	}

	// Helper function to resolve parents
	private resolveParent(parentLineNumber : number) {
		// console.log(`parent: ${inTask.parent}, tasks: ${tasks.length}`);
		let parentId = "-1";
		let fileMapRecords = this.fileMap.fileMapRecords;
		for (let i = 0; i < fileMapRecords.length; i++) {
			// console.log(`${inTask.parent} -- ${tasks[i].position.start.line} - ${tasks[i].position.end.line}`);
			if (parentLineNumber == fileMapRecords[i].startLine) {
				parentId = fileMapRecords[i].ID;
				break;
			}
		}
		return parentId;
	}


	getParentLineNumber(parentId: string) {
		const parent = this.getTaskRecord(parentId);
		if (parent) {
			return parent.startLine;
		} else {
			return -1;
		}
	}

	getParentInsertPoint(parentId: string) {
		const parent = this.getTaskRecord(parentId);
		if (parent) {
			let lineNum = parent.endLine; //account for task and notes.
			const lineNumChildren = this.getLastEndLineForParent(parentId)
			if (lineNumChildren) {
				lineNum = lineNumChildren;
			}
			return lineNum;
		} else {
			return -1;
		}
	}

	private getTaskRecord(parentId: string) {
		return this.fileMap?.fileMapRecords.find(taskRecord => taskRecord.ID === parentId);
	}

	addFileRecord(inRecord: iFileMapRecord) {
		this.fileMap?.fileMapRecords.push(inRecord);
	}

	private getLastEndLineForParent(parentId: number): number | undefined {
		// Filter records that have the given parentId
		const children = this.fileMap?.fileMapRecords.filter(record => record.parent === parentId);

		if (!children || children.length === 0) {
			return undefined; // No children found for the given parentId
		}

		// Find the record with the maximum endLine
		const lastEndLineRecord = children.reduce((prev, current) => {
			return (prev.endLine > current.endLine) ? prev : current;
		});

		return lastEndLineRecord.endLine;
	}

	getParentTabs(parentId: string) {
		const regex = /^[^-.]*/;
		const taskRecord = this.getTaskRecord(parentId);
		const numTabs = taskRecord?.taskLines[0].match(regex)[0];
		return numTabs;
	}
}
