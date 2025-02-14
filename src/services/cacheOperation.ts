import {App, type ListItemCache, Notice, TFile, TFolder} from 'obsidian';
import TickTickSync from "@/main";
import type {ITask} from '@/api/types/Task';
import type {IProject} from '@/api/types//Project';
import {FoundDuplicatesModal} from "@/modals/FoundDuplicatesModal";
import {
	getProjectGroups,
	getProjects,
	getSettings,
	getTasks,
	updateProjects,
	updateSettings,
	updateTasks
} from "@/settings";
import {log} from "@/utils/logging";

export interface FileMetadata {
	[fileName: string]: FileDetail;
}

export interface FileDetail {
	TickTickTasks: TaskDetail[];
	TickTickCount: number;
	defaultProjectId?: string;
}

export interface TaskDetail {
	taskId: string;
	taskItems: string[];
}

const FILE_EXT = ".md";

export class CacheOperation {
	app: App;
	plugin: TickTickSync;

	constructor(app: App, plugin: TickTickSync) {
		//super(app,settings);
		this.app = app;
		this.plugin = plugin;
	}

	async addTaskToMetadata(filepath: string, task: ITask) {
		// if (getSettings().debugMode) {
		// 	console.log("Adding task to : ", filepath)
		// }
		const metaData = await this.getFileMetadata(filepath, task.projectId)
		if (!metaData){ return } //TODO uniform processing null value
		const taskMeta: TaskDetail = {taskId: task.id, taskItems: []};
		if (task.items && task.items.length > 0) {
			task.items.forEach((item) => {
				taskMeta.taskItems.push(item.id)
			});
		}
		metaData.TickTickTasks.push(taskMeta);
		metaData.TickTickCount = metaData.TickTickTasks.length;
	}

	async addTaskItemToMetadata(filepath: string, taskId: string, itemid: string, projectId: string) {
		const metaData: FileDetail = await this.getFileMetadata(filepath, projectId)
		const task = metaData.TickTickTasks.find(task => task.taskId === taskId)
		task?.taskItems.push(itemid)
		metaData.TickTickCount = metaData.TickTickTasks.length;
	}

	//This removes an Item from the metadata, and from the task
	//assumes file metadata has been looked up.
	async removeTaskItem(fileMetaData: FileDetail, taskId: string, taskItemIds: string[]) {
		if (!fileMetaData) {
			return undefined;
		}
		const taskIndex = fileMetaData.TickTickTasks.findIndex(task => task.taskId === taskId);
		if (taskIndex !== -1) {
			const task = this.loadTaskFromCacheID(taskId)
			if (!task || !task.items) {
				return undefined;
			}
			let taskItems = task.items;
			taskItemIds.forEach(taskItemId => {
				//delete from Task
				taskItems = taskItems.filter(item => item.id !== taskItemId);
			});
			task.items = taskItems;
			//update will take care of metadata update.
			return await this.updateTaskToCache(task);
		} else {
			console.warn(`Task '${taskId}' not found in metadata`);
		}
		return undefined;
	}


	async getFileMetadata(filepath: string, projectId?: string): Promise<FileDetail | undefined> {
		const metaData = getSettings().fileMetadata[filepath];
		if (metaData) {
			return metaData;
		}
		return await this.newEmptyFileMetadata(filepath, projectId)
	}

	async getFileMetadatas() {
		return getSettings().fileMetadata ?? null
	}


	protected async newEmptyFileMetadata(filepath: string, projectId?: string): Promise<FileDetail | undefined> {
		//There's a case where we are making an entry for an undefined file. Not sure where it's coming from
		// this should give us a clue.
		if (!filepath) {
			console.error("Attempt to create undefined FileMetaData Entry: ", filepath)
			return undefined;
		}
		const file = this.app.vault.getAbstractFileByPath(filepath);
		if (file instanceof TFolder) {
			console.error("Not adding ", filepath, " to Metadata because it's a folder.");
			return undefined;
		}
		const metadata = getSettings().fileMetadata
		if (metadata[filepath]) {
			//todo: verify did doesn't break anything.
			return metadata[filepath]; //in case trying to clobber one.
		}
		metadata[filepath] = {
			TickTickTasks: [],
			TickTickCount: 0,
			defaultProjectId: projectId
		} as FileDetail;
		// Save the updated metadata object back to the settings object
		updateSettings({fileMetadata: metadata});
		await this.plugin.saveSettings();
		return getSettings().fileMetadata[filepath]
	}

	async updateFileMetadata(filepath: string, newMetadata: FileDetail) {
		const metadata = getSettings().fileMetadata

		// If the metadata object does not exist, create a new object and add it to metadata
		if (!metadata[filepath]) {
			metadata[filepath] = {} as FileDetail;
		}

		//Update attribute values in the metadata object
		metadata[filepath].TickTickTasks = newMetadata.TickTickTasks;
		metadata[filepath].TickTickCount = newMetadata.TickTickCount;

		// Save the updated metadata object back to the settings object
		updateSettings({fileMetadata: metadata});
		await this.plugin.saveSettings();

	}

	async deleteTaskIdFromMetadata(filepath: string, taskId: string) {

		const metadata = await this.getFileMetadata(filepath)
		const oldTickTickTasks = metadata.TickTickTasks;

		const newTickTickTasks = oldTickTickTasks.filter(obj => obj.taskId !== taskId);

		const newTickTickCount = newTickTickTasks.length;
		metadata.TickTickTasks = newTickTickTasks
		metadata.TickTickCount = newTickTickCount
		await this.updateFileMetadata(filepath, metadata);

	}

	async updateTaskMetadata(task: ITask, filePath: string) {
		await this.deleteTaskIdFromMetadataByTaskId(task.id);
		await this.addTaskToMetadata(filePath, task);
	}

	async deleteTaskIdFromMetadataByTaskId(taskId: string) {
		const metadatas = await this.getFileMetadatas()
		for (const file in metadatas) {
			const tasks = metadatas[file].TickTickTasks;
			if (tasks && tasks.find((task: TaskDetail) => task.taskId === taskId)) {
				await this.deleteTaskIdFromMetadata(file, taskId)
				break;
			}
		}
	}

	//delete filepath from filemetadata
	async deleteFilepathFromMetadata(filepath: string): Promise<FileMetadata> {
		const fileMetaData: FileMetadata = getSettings().fileMetadata;
		const newFileMetadata: FileMetadata = {};

		for (const filename in fileMetaData) {
			if (filename !== filepath) {
				newFileMetadata[filename] = fileMetaData[filename];
			}
		}

		updateSettings({fileMetadata: newFileMetadata});
		await this.plugin.saveSettings()
		return getSettings().fileMetadata;

		// console.log(`${filepath} is deleted from file metadatas.`)
	}


	//Check for duplicates
	checkForDuplicates(fileMetadata: FileMetadata) {
		if (!fileMetadata) {
			return;
		}

		const taskIds: Record<string, string> = {};
		const duplicates: Record<string, string[]> = {};

		for (const file in fileMetadata) {
			fileMetadata[file].TickTickTasks?.forEach(task => {
				if (!taskIds.hasOwnProperty(task.taskId)) {
					taskIds[task.taskId] = file;
					return;
				}
				if (!duplicates.hasOwnProperty(task.taskId)) {
					duplicates[task.taskId] = [];
				}
				duplicates[task.taskId].push(file);
			});
		}
		//Some day, may want to do something with all the taskIds?
		return {taskIds, duplicates};
	}

	//Check errors in filemata where the filepath is incorrect.
	async checkFileMetadata(): Promise<number> {
		const metadatas = await this.getFileMetadatas()
		// console.log("md: ", metadatas)

		for (const filepath in metadatas) {
			const value = metadatas[filepath];
			// console.log("File: ", value)
			const file = this.app.vault.getAbstractFileByPath(filepath)
			if (!file && (value.TickTickTasks?.length === 0 || !value.TickTickTasks)) {
				console.error(`${filepath} does not exist and metadata is empty.`)
				await this.deleteFilepathFromMetadata(filepath)
				continue
			}
			if (value.TickTickTasks?.length === 0 || !value.TickTickTasks) {
				continue;
			}
			//check if file exists

			if (!file) {
				//search new filepath
				// console.log(`file ${filepath} is not exist`)
				const task1 = value.TickTickTasks[0]
				// console.log(TickTickId1)
				const searchResult = await this.plugin.fileOperation.searchFilepathsByTaskidInVault(task1.taskId)
				// console.log(`new file path is`)
				// console.log(searchResult)

				//update metadata
				await this.updateRenamedFilePath(filepath, searchResult)
				await this.plugin.saveSettings()

			}

			//TODO: Finish this!!
			//const fileContent = await this.app.vault.read(file)
			//check if file include all tasks


			/*
			value.TickTickTasks.forEach(async(taskId) => {
				const taskObject = await this.plugin.cacheOperation?.loadTaskFromCacheyID(taskId)


			});
			*/

		}
		return Object.keys(metadatas).length;
	}

	async getDefaultProjectNameForFilepath(filepath: string) {
		const metadatas = getSettings().fileMetadata
		if (!metadatas[filepath] || metadatas[filepath].defaultProjectId === undefined) {
			return getSettings().defaultProjectName
		}

		const defaultProjectId = metadatas[filepath].defaultProjectId
		return this.getProjectNameByIdFromCache(defaultProjectId)
	}


	async getDefaultProjectIdForFilepath(filepath: string) {
		const metadatas = getSettings().fileMetadata
		if (!metadatas[filepath] || metadatas[filepath].defaultProjectId === undefined) {
			return getSettings().defaultProjectId
		} else {
			const defaultProjectId = metadatas[filepath].defaultProjectId
			return defaultProjectId
		}
	}

	async getFilepathForProjectId(projectId: string) {

		const metadatas = getSettings().fileMetadata

		//If this project is set as a default for a file, return that file.
		for (const key in metadatas) {
			const value = metadatas[key];
			if (value.defaultProjectId === projectId) {
				return key;
			}
		}

		if ((projectId === getSettings().inboxID) ||
			(projectId === getSettings().defaultProjectId)) { //highly unlikely, but just in case
			//They don't have a file for the Inbox. If they have a default project, return that.
			if (getSettings().defaultProjectName) {
				// filePath = this.plugin.settings?.TickTickTasksFilePath +"/"+ this.plugin.settings.defaultProjectName + ".md"
				return getSettings().defaultProjectName + FILE_EXT;
			}
		}
		//otherwise, return the project name as a md file and hope for the best.
		const filePath = await this.getProjectNameByIdFromCache(projectId/*, getSettings().keepProjectFolders*/)
		if (!filePath) {
			//Not a file that's in fileMetaData, not the inbox no default project set
			const errmsg = `File path not found for ${projectId}, returning ${filePath} instead.`
			console.warn(errmsg)
			throw new Error(errmsg);
		}
		// let errmsg = `File path not found for ${projectId}, returning ${filePath} instead. `
		// console.warn(errmsg)

		return filePath + FILE_EXT;
	}

	async setDefaultProjectIdForFilepath(filepath: string, defaultProjectId: string) {
		const metadata = await this.getFileMetadata(filepath, defaultProjectId);
		metadata.defaultProjectId = defaultProjectId
		if (!metadata.TickTickTasks || !metadata.TickTickCount) {
			//probably an edge case, but we ended up with a quazi empty metadata
			metadata.TickTickTasks = [];
			metadata.TickTickCount = 0;
		}

		await this.updateFileMetadata(filepath, metadata);
	}


	//Read all tasks from Cache
	async loadTasksFromCache() {
		try {
			const savedTasks = getTasks()
			return savedTasks;
		} catch (error) {
			console.error(`Error loading tasks from Cache: ${error}`);
			return [];
		}
	}


	// Overwrite and save all tasks to cache
	async saveTasksToCache(newTasks) {
		try {
			updateTasks(newTasks)

		} catch (error) {
			console.error(`Error saving tasks to Cache: ${error}`);
			return false;
		}
	}


	//Append to Cache file
	async appendTaskToCache(task: ITask, filePath: string) {
		try {
			if (task === null) {
				return
			}
			const savedTasks = getTasks();
			task.title = this.plugin.taskParser.stripOBSUrl(task.title);
			savedTasks.push(task);
			updateTasks(savedTasks);
			await this.addTaskToMetadata(filePath, task)

			await this.plugin.saveSettings();

		} catch (error) {
			console.error(`Error appending task to Cache: ${error}`);
		}
	}

	//Read the task with the specified id
	loadTaskFromCacheID(taskId?: string): ITask | undefined {
		if (!taskId) return undefined;
		try {
			const savedTasks = getTasks()
			return savedTasks.find((task: ITask) => task.id === taskId);
		} catch (error) {
			log('error', `Error finding task from Cache:`, error);
		}
		return undefined;
	}

	//get Task titles
	async getTaskTitles(taskIds: string []): Promise<string []> {

		const savedTasks = getTasks();
		let titles = savedTasks.filter(task => taskIds.includes(task.id)).map(task => task.title);
		titles = titles.map((task: string) => {
			return this.plugin.taskParser.stripOBSUrl(task);
		});

		return titles;

	}


	//Overwrite the task with the specified id in update
	async updateTaskToCache(task: ITask, movedPath: string | null = null) {
		try {
			let filePath: string | null = ""
			if (!movedPath) {
				filePath = await this.getFilepathForTask(task.id)
				if (!filePath) {
					filePath = await this.getFilepathForProjectId(task.projectId);
				}
				if (!filePath) {
					//we're not likely to get here, but just in case
					throw new Error(`File not found for ${task.id} - ${task.title}`)
				}
			} else {
				filePath = movedPath;
			}

			//Assume that dateHolder has been handled before this.
			//Delete the existing task
			await this.deleteTaskFromCache(task.id)
			//Add new task
			await this.appendTaskToCache(task, filePath);
			return task;
		} catch (error) {
			console.error(`Error updating task to Cache: ${error}`);
			return [];
		}
	}

	async getFilepathForTask(taskId: string) {
		const metaDatas = await this.getFileMetadatas();
		for (const filepath in metaDatas) {
			const value = metaDatas[filepath];
			if (value.TickTickTasks.find((task: TaskDetail) => task.taskId === taskId)) {
				return filepath;
			}
		}
		return null;
	}

	async getProjectIdForTask(taskId: string) {
		const savedTasks = getTasks();
		const taskIndex = savedTasks.findIndex((task) => task.id === taskId);

		if (taskIndex !== -1) {
			// console.log(savedTasks[taskIndex].id, savedTasks[taskIndex].projectId);
			return savedTasks[taskIndex].projectId;
		}
	}

	//The structure of due {date: "2025-02-25",isRecurring: false,lang: "en",string: "2025-02-25"}


	// modifyTaskToCacheByID(taskId: string, { content, due }: { content?: string, due?: Due }): void {
	// try {
	// const savedTasks = this.plugin.settings.TickTickTasksData.tasks;
	// const taskIndex = savedTasks.findIndex((task) => task.id === taskId);

	// if (taskIndex !== -1) {
	// const updatedTask = { ...savedTasks[taskIndex] };

	// if (content !== undefined) {
	// updatedTask.content = content;
	// }

	// if (due !== undefined) {
	// if (due === null) {
	// updatedTask.due = null;
	// } else {
	// updatedTask.due = due;
	// }
	// }

	// savedTasks[taskIndex] = updatedTask;

	// this.plugin.settings.TickTickTasksData.tasks = savedTasks;
	// } else {
	// throw new Error(`Task with ID ${taskId} not found in cache.`);
	// }
	// } catch (error) {
	// // Handle the error appropriately, eg by logging it or re-throwing it.
	// }
	// }


	//open a task status
	async reopenTaskToCacheByID(taskId: string): Promise<string> {
		let projectId = null;
		try {
			const savedTasks = getTasks()


			const taskIndex = savedTasks.findIndex((task) => task.id === taskId);
			if (taskIndex > -1) {
				savedTasks[taskIndex].status = 0;
				projectId = savedTasks[taskIndex].projectId;
			}

			updateTasks(savedTasks);
			return projectId;

		} catch (error) {
			console.error(`Error open task to Cache file: ${error}`);
			throw error; // Throw an error so that the caller can catch and handle it
		}
	}


	//close a task status
	async closeTaskToCacheByID(taskId: string): Promise<string> {
		let projectId = null;
		try {
			const savedTasks = getTasks();

			const taskIndex = savedTasks.findIndex((task) => task.id === taskId);
			if (taskIndex > -1) {
				savedTasks[taskIndex].status = 2;
				projectId = savedTasks[taskIndex].projectId;
			}

			updateTasks(savedTasks);
			return projectId;

		} catch (error) {
			console.error(`Error close task to Cache file: ${error}`);
			throw error; // Throw an error so that the caller can catch and handle it
		}
	}


	//Delete task by ID
	async deleteTaskFromCache(taskId: string) {
		try {
			const savedTasks = getTasks()
			const newSavedTasks = savedTasks.filter((t) => t.id !== taskId);
			updateTasks(newSavedTasks)
			//Also clean up meta data
			await this.deleteTaskIdFromMetadataByTaskId(taskId);
		} catch (error) {
			console.error(`Error deleting task from Cache file: ${error}`);
		}
	}


	//Delete task through ID array
	async deleteTaskFromCacheByIDs(deletedTaskIds: string[]) {
		try {
			const savedTasks = getTasks()
			const newSavedTasks = savedTasks.filter((t) => !deletedTaskIds.includes(t.id))
			updateTasks(newSavedTasks)
			//clean up file meta data
			deletedTaskIds.forEach(async taskId => {
				await this.deleteTaskIdFromMetadataByTaskId(taskId)
			});


		} catch (error) {
			console.error(`Error deleting task from Cache : ${error}`);
		}
	}


	//Find project id by name
	async getProjectIdByNameFromCache(projectName: string) {
		try {
			const savedProjects = getProjects()
			const targetProject = savedProjects.find((obj: IProject) => obj.name.toLowerCase() === projectName.toLowerCase());
			const projectId = targetProject ? targetProject.id : null;
			return (projectId)
		} catch (error) {
			console.error(`Error finding project from Cache file: ${error}`);
			return (false)
		}
	}


	async getProjectNameByIdFromCache(projectId: string /*, addFolder: boolean = false*/): Promise<string | undefined> {
		try {
			const savedProjects = getProjects()
			const targetProject = savedProjects.find(obj => obj.id === projectId);
			if (!targetProject) return undefined;
			// if (addFolder) {
			// 	const groupName = getProjectGroups().find(g => g.id == targetProject.groupId)?.name;
			// 	if (groupName) return groupName + '/' + targetProject.name;
			// }
			return targetProject.name
		} catch (error) {
			console.error(`Error finding project from Cache file: ${error}`);
		}
		return undefined;
	}


	//save projects data to json file
	async saveProjectsToCache(projects: IProject[]) {
		try {
			const inboxProject = {
				id: getSettings().inboxID,
				name: getSettings().inboxName
			} as IProject;
			projects.push(inboxProject);

			//TODO: this really need?
			const duplicates = projects.reduce((acc, obj, index, arr) => {
				const duplicateIndex = arr.findIndex(item => item.name === obj.name && item.id !== obj.id);
				if (duplicateIndex !== -1 && !acc.includes(obj)) {
					acc.push(obj);
				}
				return acc;
			}, [] as IProject[]);
			const sortedDuplicates = duplicates.sort((a, b) => a.name.localeCompare(b.name));
			if (sortedDuplicates.length > 0) {
				log('debug', 'Found duplicate lists:', sortedDuplicates.map(thing => `${thing.id} ${thing.name}`));
				await this.showFoundDuplicatesModal(this.app, this.plugin, sortedDuplicates)
				return false;
			}

			// if (this.plugin.settings.debugMode) {
			//     if (projectGroups !== undefined && projectGroups !== null) {
			//         console.log("==== projectGroups")
			//         console.log(projectGroups.map((item) => item.name));
			//     } else {
			//         console.log("==== No projectGroups")
			//     }
			//     // ===============
			//     if (projects !== undefined && projects !== null) {
			//         console.log("==== projects -->", projects.length)
			//         projects.forEach(async project => {

			//             const sections = await this.plugin.tickTickRestAPI?.getProjectSections(project.id);
			//             if (sections !== undefined && sections !== null && sections.length > 0) {
			//                 console.log(`Project: ${project.name}`);
			//                 sections.forEach(section => {
			//                     console.log('\t' + section.name);
			//                 })
			//             } else {
			//                 console.log(`Project: ${project.name}`);
			//                 console.log('\t' + 'no sections')
			//             }
			//         })
			//     } else {
			//         console.log("==== No projects")
			//     }

			//     // ================
			// }

			//save to json
			//TODO: Do we want to deal with sections.
			updateProjects(projects);
			await this.plugin.saveSettings();
			return true

		} catch (error) {
			log('error', 'Error on save projects:', error);
			new Notice(`error on save projects: ${error}`);
		}
		return false
	}


	async updateRenamedFilePath(oldpath: string, newpath: string) {
		try {
			// console.log(`oldpath is ${oldpath}`)
			// console.log(`newpath is ${newpath}`)
			const savedTask = await this.loadTasksFromCache()
			//console.log(savedTask)
			const newTasks = savedTask.map(obj => {
				if (obj.path === oldpath) {
					return {...obj, path: newpath};
				} else {
					return obj;
				}
			})
			//console.log(newTasks)
			await this.saveTasksToCache(newTasks)

			//update filepath
			const fileMetadatas = getSettings().fileMetadata
			fileMetadatas[newpath] = fileMetadatas[oldpath]
			delete fileMetadatas[oldpath]
			updateSettings({fileMetadata: fileMetadatas});

		} catch (error) {
			console.error(`Error updating renamed file path to cache: ${error}`)
		}


	}

	// TODO: why did I think I needed this?
	findTaskInMetada(taskId: string, filePath: string) {
		const fileMetadata = getSettings().fileMetadata;
		for (const file in fileMetadata) {
			console.log("in file: :", file)
			if (file == filePath) {
				console.log("breaking")
				continue;
			}
			const tasks = fileMetadata[file].TickTickTasks;
			for (const task of tasks) {
				if (task.taskId === taskId) {
					console.log("found")
					return true
				}
			}
		}
		console.log("not found")
		return false;
	}

	async isProjectMoved(lineTask: ITask, filePath: string) {
		const currentLocation = await this.getFilepathForTask(lineTask.id)
		if (!currentLocation) {
			//we're checking the filepath, presumably before file metadata is updated.
			//don't trigger a project move until things settle down.
			return false;
		}

		if (currentLocation != filePath) {
			return currentLocation;
		} else {
			return null;
		}
	}

	isTaskInCache(taskId) {
		try {
			const savedTasks = getTasks()
			const savedTask = savedTasks.find((task: ITask) => task.id === taskId);
			if (savedTask) {
				return true;
			}
		} catch (error) {
			console.error(`Error finding task from Cache: ${error}`);
			return false;
		}
		return false;
	}

	async findTaskInFiles(taskId: string): Promise<string | null> {
		const markdownFiles = this.app.vault.getMarkdownFiles();
		for (const file of markdownFiles) {
			const listItemsCache: ListItemCache[] = this.app.metadataCache.getFileCache(file)?.listItems ?? [];

			const taskList = await this.findInFile(file, listItemsCache);
			//returning the first file we find.
			if (taskList.includes(taskId)) {
				return file.path;
			}
		}
		return null;
	}

	private async findInFile(file: TFile, listItemsCache: ListItemCache[]) {
		const fileCachedContent: string = await this.app.vault.cachedRead(file);
		const lines: string[] = fileCachedContent.split('\n');

		const tasks: (string | null | undefined)[] = listItemsCache
			// Get the position of each list item
			.map((listItemCache: ListItemCache) => listItemCache.position.start.line)
			// Get the line
			.map((idx) => lines[idx])
			// Create a Task from the line
			.map((line: string) => this.plugin.taskParser.getTickTickId(line))
			// Filter out the nulls
			.filter((taskId: string | null) => taskId !== null)
		;

		return tasks;
	}

	private async showFoundDuplicatesModal(app, plugin, projects: IProject[]) {
		const myModal = new FoundDuplicatesModal(app, plugin, projects, (result) => {
			this.ret = result;
		});
		return await myModal.showModal();
	}
}
