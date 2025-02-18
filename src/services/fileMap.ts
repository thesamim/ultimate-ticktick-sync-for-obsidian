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
	parent: string;
	heading: any;
}

export class FileMap {
	app: App;
	plugin: TickTickSync;
	fileMapRecords: iFileMapRecord[] | undefined;
	lineCount: number;
	headings: { heading: string; startLine: number; endLine: number; }[] | undefined;
	fileLines: string[] | undefined;

	constructor(app: App, plugin: TickTickSync) {
		this.app = app;
		this.plugin = plugin;
		this.lineCount = 0;
	}

	async buildFileMap(file: TFile): Promise<iFileMap | null> {
		//TODO: This is getting called extraneously. find out why.
		// console.warn('BuildFileMap');
		const data = this.app.metadataCache.getFileCache(file);
		if (!data) {
			return null;
		}

		//TODO: look into how dangerous it is to use the cache here...
		const fileCachedContent: string = await this.app.vault.read(file);
		this.fileLines = fileCachedContent.split('\n');
		this.lineCount = this.fileLines.length;

		const lines  = this.fileLines;

		this.fileMapRecords = [];

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
			data.listItems.forEach((item, index) => {
				if (item.task !== undefined) {
					let startLine = item.position.start.line;
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
						this.fileMapRecords.push(fileMapRecord);
					}
				}
			});
		}

		return this.fileMapRecords;
	}

	getLastLine(): number {
		return this.lineCount + 1;
	}

	getInsertionLine(): number {
		const lastTask = this.findLastTask();
		if (lastTask && lastTask.ID) {
			return this.getTaskEndLine(lastTask.ID);
		}
		return this.getLastLine();
	}

	private findLastTask(): iFileMapRecord | undefined {
		// Filter only tasks (type === "Task")
		const tasks = this.fileMapRecords?.filter(record => record.type === "Task");

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

	getTaskLine(id: string) {
		return this.getTaskRecord(id)?.startLine;
	}

	getTaskEndLine(ID: string): number {
		// Find the task with the given ID
		const task = this.getTaskRecord(ID);

		if (!task) {
			throw new Error(`Task with ID ${ID} not found.`);
		}

		// Find all children of the task
		const children = this.fileMapRecords?.filter(record => ((record.type=="Item") && (record.parent === task.ID)));
		// const children = this.fileMapRecords?.filter(record => ((record.parent === task.ID)));

		if (children.length === 0) {
			// If no children, return the task's endLine
			return task.endLine;
		}

		// Find the child with the highest endLine
		const childWithHighestEndLine = children.reduce((prev, current) =>
			(prev.endLine > current.endLine) ? prev : current
		);

		return childWithHighestEndLine.endLine + 1;
	}

	// Helper function to find the heading for a given line
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
		let fileMapRecords = this.fileMapRecords;
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

	getParentEndLine(parentId: string) {
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
		return this.fileMapRecords?.find(taskRecord => taskRecord.ID === parentId);
	}

	addFileRecord(inRecord: iFileMapRecord) {
		this.fileMapRecords?.push(inRecord);
		this.lineCount += inRecord.endLine - inRecord.startLine + 1;
	}

	private getLastEndLineForParent(parentId: number): number | undefined {
		// Filter records that have the given parentId
		const children = this.fileMapRecords?.filter(record => record.parent === parentId);

		if (!children || children.length === 0) {
			return undefined; // No children found for the given parentId
		}

		// Find the record with the maximum endLine
		const lastEndLineRecord = children.reduce((prev, current) => {
			return (prev.endLine > current.endLine) ? prev : current;
		});

		let currentEndLine = lastEndLineRecord.endLine;

		let lastDescendantLine = 0;
		children.forEach(child => {
			const descendantLine = this.getLastEndLineForParent(child.ID)
			if (descendantLine && (descendantLine > lastDescendantLine)) {
				lastDescendantLine = descendantLine;
			}
		})
		if ((lastDescendantLine) && (lastDescendantLine > currentEndLine)) {
			currentEndLine = lastDescendantLine;
		}

		return currentEndLine;
	}

	getParentTabs(parentId: string) {
		const regex = /^[^-.]*/;
		const taskRecord = this.getTaskRecord(parentId);
		const numTabs = taskRecord?.taskLines[0].match(regex)[0];
		return numTabs;
	}


}
