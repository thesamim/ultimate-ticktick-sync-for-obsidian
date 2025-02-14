import { App, ListItemCache, Notice, TFile, TFolder } from 'obsidian';
import TickTickSync from "../main";
import { ITask } from './api/types/Task';
import { IProject } from 'src/api/types//Project';
import {FoundDuplicatesModal} from "./modals/FoundDuplicatesModal";

// type TaskDetail = {
//     taskId: string,
//     taskItems: string[]
// }
// type FileMetadata = {
//     TickTickTasks: TaskDetail[];
//     TickTickCount: number;
//     defaultProjectId: string;
// };

export interface FileMetadata {
	[fileName: string]: {
		TickTickTasks: TaskDetail[];
		TickTickCount: number;
		defaultProjectId: string;
	};
}

export interface TaskDetail {
	taskId: string;
	taskItems: string[];
}

export class CacheOperation {
    app: App;
    plugin: TickTickSync;

    constructor(app: App, plugin: TickTickSync) {
        //super(app,settings);
        this.app = app;
        this.plugin = plugin;
    }


    async addTaskToMetadata(filepath: string, task: ITask) {
		// if (this.plugin.settings.debugMode) {
		// 	console.log("Adding task to : ", filepath)
		// }
        let metaData: FileMetadata = await this.getFileMetadata(filepath, task.projectId)
        let taskMeta: TaskDetail;
        taskMeta = { taskId: task.id, taskItems: [] };
        if (task.items && task.items.length > 0) {
            task.items.forEach((item) => { 
                taskMeta.taskItems.push(item.id)
            });
        }
        metaData.TickTickTasks.push(taskMeta);
        metaData.TickTickCount = metaData.TickTickTasks.length;
    }

    async addTaskItemToMetadata(filepath: string, taskId: string, itemid: string, projectId: string) {
        let metaData: FileMetadata = await this.getFileMetadata(filepath, projectId)
        const task = metaData.TickTickTasks.find(task => task.taskId === taskId)
        task?.taskItems.push(itemid)
        metaData.TickTickCount = metaData.TickTickTasks.length;
    }

    //This removes an Item from the metadata, and from the task
    //assumes file metadata has been looked up.
    async removeTaskItem(fileMetaData: FileMetadata, taskId: string, taskItemIds: string[]) {
        if (fileMetaData) {
            const taskIndex = fileMetaData.TickTickTasks.findIndex(task => task.taskId === taskId);
            if (taskIndex !== -1) {
                const updatedMetaDataTask = fileMetaData.TickTickTasks[taskIndex];
                let task = await this.loadTaskFromCacheID(taskId)
				if (!task.items) {
					return
				}
                let taskItems = task.items;
                taskItemIds.forEach(taskItemId => {
                    //delete from Task
                    taskItems = taskItems.filter(item => item.id !== taskItemId);
                });
                //update will take care of metadata update.
                task.items = taskItems;
                task = await this.updateTaskToCache(task);
                return task;
            } else {
                console.warn(`Task '${taskId}' not found in metadata`);
            }

        };
        return null;
    }


    async getFileMetadata(filepath: string, projectId: string | null): Promise<FileMetadata> {
        let metaData = this.plugin.settings.fileMetadata[filepath];
        if (!metaData) {
            //Always return something.
            metaData = await this.newEmptyFileMetadata(filepath, projectId);
        }
        return metaData
    }

    async getFileMetadatas() {
        return this.plugin.settings.fileMetadata ?? null
    }


    async newEmptyFileMetadata(filepath: string, projectId: string | null): Promise<FileMetadata|null> {
		//There's a case where we are making an entry for an undefined file. Not sure where it's coming from
		// this should give us a clue.
		if (!filepath) {
			console.error("Attempt to create undefined FileMetaData Entry: ", filepath)
			return null;
		}
		const file = this.app.vault.getAbstractFileByPath(filepath);
		if (file instanceof TFolder) {
			console.error("Not adding ", filepath, " to Metadata because it's a folder.");
			return null;
		}
        const metadatas = this.plugin.settings.fileMetadata
        if (metadatas[filepath]) {
            //todo: verify did doesn't break anything.
            return metadatas[filepath]; //in case trying to clobber one.
        }
        else {
            metadatas[filepath] = {}
        }
        metadatas[filepath].TickTickTasks = [];
        metadatas[filepath].TickTickCount = 0;
        if (projectId) {
            metadatas[filepath].defaultProjectId = projectId;
        }
        // Save the updated metadatas object back to the settings object
        this.plugin.settings.fileMetadata = metadatas
        this.plugin.saveSettings();
        return this.plugin.settings.fileMetadata[filepath]
    }

    async updateFileMetadata(filepath: string, newMetadata: FileMetadata) {
        const metadatas = this.plugin.settings.fileMetadata

        // If the metadata object does not exist, create a new object and add it to metadatas
        if (!metadatas[filepath]) {
            metadatas[filepath] = {}
        }

        //Update attribute values ​​in the metadata object
        metadatas[filepath].TickTickTasks = newMetadata.TickTickTasks;
        metadatas[filepath].TickTickCount = newMetadata.TickTickCount;

        // Save the updated metadatas object back to the settings object
        this.plugin.settings.fileMetadata = metadatas
        this.plugin.saveSettings();

    }

    async deleteTaskIdFromMetadata(filepath: string, taskId: string) {

        const metadata = await this.getFileMetadata(filepath, null)
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
        for (var file in metadatas) {
            var tasks = metadatas[file].TickTickTasks;
            var count = metadatas[file].TickTickCount;

            if (tasks && tasks.find((task: TaskDetail) => task.taskId === taskId)) {
                await this.deleteTaskIdFromMetadata(file, taskId)
                break;
            }
        }
    }
    //delete filepath from filemetadata
    async deleteFilepathFromMetadata(filepath: string): Promise<FileMetadata> {
		const fileMetaData: FileMetadata = this.plugin.settings.fileMetadata;
		const newFileMetadata: FileMetadata = {};

		for (const filename in fileMetaData) {
			if (filename !== filepath) {
				newFileMetadata[filename] = fileMetaData[filename];
			}
		}

		this.plugin.settings.fileMetadata = newFileMetadata;
		await this.plugin.saveSettings()
		return this.plugin.settings.fileMetadata;

        // console.log(`${filepath} is deleted from file metadatas.`)
    }


	//Check for duplicates
	checkForDuplicates(fileMetadata: FileMetadata) {
		let taskIds = {};
		let duplicates = {};

		if (!fileMetadata) {
			return;
		}
		for (const file in fileMetadata) {
			fileMetadata[file].TickTickTasks.forEach(task => {
				if (taskIds[task.taskId]) {
					if (!duplicates[task.taskId]) {
						duplicates[task.taskId] = [taskIds[task.taskId]];
					}
					duplicates[task.taskId].push(file);
				} else {
					taskIds[task.taskId] = file;
				}
			});
		}
		//Some day, may want to do something with all the taskids?
		return {taskIds,duplicates};
	}

    //Check errors in filemata where the filepath is incorrect.
    async checkFileMetadata(): Promise<number> {
        const metadatas = await this.getFileMetadatas()
        // console.log("md: ", metadatas)

        for (const key in metadatas) {
            let filepath = key
            const value = metadatas[key];
            // console.log("File: ", value)
            let file = this.app.vault.getAbstractFileByPath(key)
            if (!file && (value.TickTickTasks?.length === 0 || !value.TickTickTasks)) {
                console.error(`${key} does not exist and metadata is empty.`)
                await this.deleteFilepathFromMetadata(key)
                continue
            }
            if (value.TickTickTasks?.length === 0 || !value.TickTickTasks) {
                continue
            }
            //check if file exists

            if (!file) {
                //search new filepath
                // console.log(`file ${filepath} is not exist`)
                const TickTickId1 = value.TickTickTasks[0]
                // console.log(TickTickId1)
                const searchResult = await this.plugin.fileOperation.searchFilepathsByTaskidInVault(TickTickId1)
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
        const metadatas = this.plugin.settings.fileMetadata
        if (!metadatas[filepath] || metadatas[filepath].defaultProjectId === undefined) {
            return this.plugin.settings.defaultProjectName
        }
        else {
            const defaultProjectId = metadatas[filepath].defaultProjectId
            const defaultProjectName = this.getProjectNameByIdFromCache(defaultProjectId)
            return defaultProjectName
        }
    }


    async getDefaultProjectIdForFilepath(filepath: string) {
        const metadatas = this.plugin.settings.fileMetadata
        if (!metadatas[filepath] || metadatas[filepath].defaultProjectId === undefined) {
            return this.plugin.settings.defaultProjectId
        }
        else {
            const defaultProjectId = metadatas[filepath].defaultProjectId
            return defaultProjectId
        }
    }

    async getFilepathForProjectId(projectId: string) {

        const metadatas = this.plugin.settings.fileMetadata


        //If this project is set as a default for a file, return that file.
        for (const key in metadatas) {
            const value = metadatas[key];
            if (metadatas[key].defaultProjectId === projectId) {
                return key;
            }
        }

		let filePath = "";

		if ((projectId === this.plugin.settings.inboxID) ||
			(projectId === this.plugin.settings.defaultProjectId)){ //highly unlikely, but just in case
			//They don't have a file for the Inbox. If they have a default project, return that.
			if (this.plugin.settings.defaultProjectName) {
				// filePath = this.plugin.settings?.TickTickTasksFilePath +"/"+ this.plugin.settings.defaultProjectName + ".md"
				filePath = this.plugin.settings.defaultProjectName + ".md"
				return filePath
			}
		}
        //otherwise, return the project name as a md file and hope for the best.
        filePath = await this.getProjectNameByIdFromCache(projectId) + ".md"

        if (!filePath) {
			//Not a file that's in fileMetaData, not the inbox no default project set
			let errmsg = `File path not found for ${projectId}`
			console.warn(errmsg)
			throw new Error(errmsg);
		}
		let errmsg = `File path not found for ${projectId}, returning ${filePath} instead. `
		console.warn(errmsg)

        return filePath;
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
            const savedTasks = this.plugin.settings.TickTickTasksData.tasks
            return savedTasks;
        } catch (error) {
            console.error(`Error loading tasks from Cache: ${error}`);
            return [];
        }
    }


    // Overwrite and save all tasks to cache
    async saveTasksToCache(newTasks) {
        try {
            this.plugin.settings.TickTickTasksData.tasks = newTasks

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
            const savedTasks = this.plugin.settings.TickTickTasksData.tasks
            if (!savedTasks) {
                this.plugin.settings.TickTickTasksData.tasks = [];
                await this.plugin.saveSettings();
            }
            task.title = this.plugin.taskParser?.stripOBSUrl(task.title);
            this.plugin.settings.TickTickTasksData.tasks.push(task);
            await this.addTaskToMetadata(filePath, task)

			await this.plugin.saveSettings();

        } catch (error) {
            console.error(`Error appending task to Cache: ${error}`);
        }
    }

    //Read the task with the specified id
    async loadTaskFromCacheID(taskId: string) : Promise<ITask|null> {
        // console.log("loadTaskFromCacheID")

        try {
            const savedTasks = this.plugin.settings.TickTickTasksData.tasks
            const savedTask = savedTasks.find((task: ITask) => task.id === taskId);
            return (savedTask)
        } catch (error) {
            console.error(`Error finding task from Cache: ${error}`);
            return null;
        }
    }

	//get Task titles
	async getTaskTitles(taskIds: string []): Promise<string []> {

		const savedTasks = this.plugin.settings.TickTickTasksData.tasks;
		let titles = savedTasks.filter(task => taskIds.includes(task.id)).map(task => task.title);
		titles = titles.map((task: string ) => {
			return this.plugin.taskParser?.stripOBSUrl(task);
		});

		return titles;

	}


    //Overwrite the task with the specified id in update
    async updateTaskToCache(task: ITask, movedPath: string | null) {
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
        for (const key in metaDatas) {
            let filepath = key
            const value = metaDatas[key];
            if (value.TickTickTasks.find((task: TaskDetail) => task.taskId === taskId)) {
                return key;
            }
        }
        return null;
    }
    async getProjectIdForTask(taskId: string) {
        const savedTasks = this.plugin.settings.TickTickTasksData.tasks;
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
            const savedTasks = this.plugin.settings.TickTickTasksData.tasks


            const taskIndex = savedTasks.findIndex((task) => task.id === taskId);
            if (taskIndex > -1 ) {
                savedTasks[taskIndex].status = 0;
                projectId = savedTasks[taskIndex].projectId;
            }

            this.plugin.settings.TickTickTasksData.tasks = savedTasks
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
            const savedTasks = this.plugin.settings.TickTickTasksData.tasks

            const taskIndex = savedTasks.findIndex((task) => task.id === taskId);
            if (taskIndex > -1)  {
                savedTasks[taskIndex].status = 2;
                projectId = savedTasks[taskIndex].projectId;
            }

            this.plugin.settings.TickTickTasksData.tasks = savedTasks
            return projectId;

        } catch (error) {
            console.error(`Error close task to Cache file: ${error}`);
            throw error; // Throw an error so that the caller can catch and handle it
        }
    }


    //Delete task by ID
    async deleteTaskFromCache(taskId: string) {
        try {
            const savedTasks = this.plugin.settings.TickTickTasksData.tasks
            const newSavedTasks = savedTasks.filter((t) => t.id !== taskId);
            this.plugin.settings.TickTickTasksData.tasks = newSavedTasks
            //Also clean up meta data
            await this.deleteTaskIdFromMetadataByTaskId(taskId);
        } catch (error) {
            console.error(`Error deleting task from Cache file: ${error}`);
        }
    }


	//Delete task through ID array
    async deleteTaskFromCacheByIDs(deletedTaskIds: string[]) {
        try {
            const savedTasks = this.plugin.settings.TickTickTasksData.tasks
            const newSavedTasks = savedTasks.filter((t) => !deletedTaskIds.includes(t.id))
            this.plugin.settings.TickTickTasksData.tasks = newSavedTasks
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
            const savedProjects = this.plugin.settings.TickTickTasksData.projects
            const targetProject = savedProjects.find((obj: IProject) => obj.name.toLowerCase() === projectName.toLowerCase());
            const projectId = targetProject ? targetProject.id : null;
            return (projectId)
        } catch (error) {
            console.error(`Error finding project from Cache file: ${error}`);
            return (false)
        }
    }



    async getProjectNameByIdFromCache(projectId: string|null) {
        try {
            const savedProjects = this.plugin.settings.TickTickTasksData.projects
            const targetProject = savedProjects.find(obj => obj.id === projectId);
            const projectName = targetProject ? targetProject.name : null;
            return (projectName)
        } catch (error) {
            console.error(`Error finding project from Cache file: ${error}`);
            return (false)
        }
    }



    //save projects data to json file
    async saveProjectsToCache() {
        try {
            //get projects
            // console.log(`Save Projects to cache with ${this.plugin.tickTickRestAPI}`)
			//const projectGroups = await this.plugin.tickTickRestAPI?.GetProjectGroups();

            const projects: IProject[] = await this.plugin.tickTickRestAPI?.GetAllProjects();
			//TODO: Don't know what I thought projectGroups are but what we really need are project sections.
			//      For Each Project call getProjectSections
			//const projectSections = await this.plugin.tickTickRestAPI?.getProjectSections("")''
			//Moving this here because if they have a list named Inbox, bad shit will happen.
			let inboxProject = {
				id: this.plugin.settings.inboxID,
				name: this.plugin.settings.inboxName
			};

			projects.push(inboxProject);

			const duplicates = projects.reduce((acc, obj, index, arr) => {
				const duplicateIndex = arr.findIndex(item => item.name === obj.name && item.id !== obj.id);
				if (duplicateIndex !== -1 && !acc.includes(obj)) {
					acc.push(obj);
				}
				return acc;
			}, []);
			// @ts-ignore
			const sortedDuplicates = duplicates.sort((a, b) => a.name.localeCompare(b.name));
			// @ts-ignore

			if (sortedDuplicates.length > 0) {
				// @ts-ignore
				if (this.plugin.settings.debugMode) {
					console.log("Found duplicate lists:")
					sortedDuplicates.forEach(thing => console.log(thing.id, thing.name))
				}
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

            if (!projects) {
                return false
            }

            //save to json
            //TODO: Do we want to deal with sections.
            this.plugin.settings.TickTickTasksData.projects = projects
            await this.plugin.saveSettings();
            return true

        } catch (error) {
            console.error(`error downloading projects: ${error}`)
			new Notice("Error downloading projects: " + error.message);
            await this.plugin.unlockSynclock();;
            return false
        }

    }


    async updateRenamedFilePath(oldpath: string, newpath: string) {
        try {
            // console.log(`oldpath is ${oldpath}`)
            // console.log(`newpath is ${newpath}`)
            const savedTask = await this.loadTasksFromCache()
            //console.log(savedTask)
            const newTasks = savedTask.map(obj => {
                if (obj.path === oldpath) {
                    return { ...obj, path: newpath };
                } else {
                    return obj;
                }
            })
            //console.log(newTasks)
            await this.saveTasksToCache(newTasks)

            //update filepath
            const fileMetadatas = this.plugin.settings.fileMetadata
            fileMetadatas[newpath] = fileMetadatas[oldpath]
            delete fileMetadatas[oldpath]
            this.plugin.settings.fileMetadata = fileMetadatas

        } catch (error) {
            console.error(`Error updating renamed file path to cache: ${error}`)
        }


    }
	// TODO: why did I think I needed this?
	findTaskInMetada(taskId: string, filePath: string) {
		const fileMetadata = this.plugin.settings.fileMetadata;
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
		}else {
			return null;
		}
	}

	isTaskInCache(taskId) {
		try {
			const savedTasks = this.plugin.settings.TickTickTasksData.tasks
			const savedTask = savedTasks.find((task: ITask) => task.id === taskId);
			if (savedTask) {
				return  true;
			}
		} catch (error) {
			console.error(`Error finding task from Cache: ${error}`);
			return false;
		}
		return false;
	}

	async findTaskInFiles(taskId: string): Promise<string|null> {
		const markdownFiles = this.app.vault.getMarkdownFiles();
		for (const file of markdownFiles) {
			const listItemsCache: ListItemCache[] = this.app.metadataCache.getFileCache(file)?.listItems ?? [];

			const taskList= await this.findInFile(file, listItemsCache);
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
			.map((line: string) => this.plugin.taskParser?.getTickTickId(line))
			// Filter out the nulls
			.filter((taskId: string | null) => taskId !== null)
		;

		return tasks;
	}

	private async showFoundDuplicatesModal(app, plugin, projects: []) {
		const myModal = new FoundDuplicatesModal(app, plugin,  projects, (result) => {
			this.ret = result;
		});
		const bConfirmation = await myModal.showModal();

		return bConfirmation;
	}
}
