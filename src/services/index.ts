import TickTickSync from "@/main";
import {Tick} from "@/api";
import {getProjects, getSettings, getTasks} from "@/settings";
import {doWithLock} from "@/utils/locks";
import {SyncMan} from "@/services/syncModule";
import {Editor, type MarkdownFileInfo, type MarkdownView, Notice, TFile} from "obsidian";
import {CacheOperation} from "@/services/cacheOperation";
import {FileOperation} from "@/fileOperation";
import { FileMap, type iFileMap } from '@/services/fileMap';
import {log} from "@/utils/logging";


const LOCK_TASKS = 'LOCK_TASKS';


//TODO: encapsulate all api and cache
export class TickTickService {

	initialized: boolean = false;
	plugin: TickTickSync;
	tickTickSync!: SyncMan;
	api?: Tick;
	cacheOperation!: CacheOperation;
	fileOperation?: FileOperation;
	fileMap!: FileMap;

	constructor(plugin: TickTickSync) {
		this.plugin = plugin;
	}

	initialize(): boolean {
		try {
			const token = getSettings().token;
			if (!token) {
				log('debug', "Please login from settings.");
				return false;
			}
			if (getSettings().inboxID.length === 0) {
				log('warn', "Something is wrong with your inbox ID.");
				//TODO re login or ask user?
			}

			this.api = new Tick({
				baseUrl: getSettings().baseURL,
				token: token,
				checkPoint: getSettings().checkPoint
			});
			//initialize data read and write object
			this.cacheOperation = new CacheOperation(this.plugin.app, this.plugin);
			//initialize file operation
			this.fileOperation = new FileOperation(this.plugin.app, this.plugin);
			this.fileMap  = new FileMap(this.plugin.app, this.plugin);
			this.tickTickSync = new SyncMan(this.plugin.app, this.plugin);
			this.initialized = true;
			return true;
		} catch (error) {
			log('info', 'Error on initialization:', error);
		}
		return false;
	}

	backup() {
		this.tickTickSync?.backupTickTickAllResources();
	}

	//MB can be static
	async login(baseUrl: string, username: string, password: string):
		Promise<{ inboxId: string; token: string } | null> {
		try {
			const api = new Tick({
				username: username,
				password: password,
				baseUrl: baseUrl,
				token: "",
				checkPoint: 0
			});
			//try login
			return await api.login();
		} catch (error) {
			log('info', 'Error on login:', error);
		}
		return null;
	}

	async synchronization() {
		try {
			const bChanged = await doWithLock(LOCK_TASKS, async () => {
				return await this.syncTickTickToObsidian();
			});
			if (bChanged) {
				//the file system is farckled. Wait until next sync to avoid race conditions.
				return;
			}
			await this.syncFiles();
		} catch (error) {
			log('info', 'Error on synchronization:', error);
		}
	}

	async saveProjectsToCache(): Promise<boolean> {
		const projects = await this.api?.getProjects();
		if (!projects) {
			return false;
		}
		return this.cacheOperation.saveProjectsToCache(projects);
	}

	async getProjects() {
		//TODO: add a check for valid data
		return getProjects()
	}

	async getTasks(filter: string) {
		log('debug', 'getTasks', filter);
		return getTasks();
	}

	async deletedTaskCheck(filePath: string | null) {
		return await doWithLock(LOCK_TASKS, async () => {
			return this.tickTickSync?.deletedTaskCheck(filePath);
		});
	}

	async deletedFileCheck(filePath: string): Promise<boolean> {

		const fileMetadata = await this.cacheOperation?.getFileMetadata(filePath, null);
		if (!fileMetadata || !fileMetadata.TickTickTasks) {
			//console.log('There is no task in the deleted file')
			return false;
		}
		//TODO
		// if (!(this.checkModuleClass())) {
		// 	return false;
		// }

		await doWithLock(LOCK_TASKS, async () => {
			await this.tickTickSync.deletedTaskCheck(filePath);
			await this.cacheOperation.deleteFilepathFromMetadata(filePath);
		});
		return true;
	}

	async renamedFileCheck(filePath: string, oldPath: string): Promise<boolean> {
		// console.log(`${oldPath} is renamed`)
		//Read fileMetadata
		//const fileMetadata = await this.fileOperation.getFileMetadata(file)
		const fileMetadata = await this.cacheOperation?.getFileMetadata(oldPath, null);
		if (!fileMetadata || !fileMetadata.TickTickTasks) {
			//console.log('There is no task in the deleted file')
			return false;
		}
		//TODO
		// if (!(this.checkModuleClass())) {
		// 	return;
		// }

		await doWithLock(LOCK_TASKS, async () => {
			await this.tickTickSync.updateTaskContent(filePath);
			await this.cacheOperation.updateRenamedFilePath(oldPath, filePath);
		});
		return true;
	}

	async fullTextNewTaskCheck(filepath: string) {
		await doWithLock(LOCK_TASKS, async () => {
			await this.tickTickSync?.fullTextNewTaskCheck(filepath);
		});
	}

	async lineContentNewTaskCheck(editor: Editor, info: MarkdownView | MarkdownFileInfo) {
		return await doWithLock(LOCK_TASKS, async () => {
			await this.tickTickSync?.lineContentNewTaskCheck(editor, info);
		});
	}

	async lineModifiedTaskCheck(filepath: string, lastLineText: string, lastLine: number, fileContent: string): Promise<boolean> {
		return await doWithLock(LOCK_TASKS, async () => {
			return this.tickTickSync?.lineModifiedTaskCheck(filepath, lastLineText, lastLine, fileContent);
		});
	}

	//file Map opps

	async buildFileMap(filePath: TFile): Promise<iFileMap | null | undefined> {
		return this.fileMap?.buildFileMap(filePath);
	}

	getLastLine(): number {
		return this.fileMap?.getLastLine();
	}

	getInsertionLine(): number {
		return this.fileMap?.getInsertionLine();
	}

	getEndLineForTask(ID: string) {
		return this.fileMap?.getEndLineForTask(ID);
	}

	/*
	 * called only from settings tab
	 */
	//TODO: refactor
	async checkDataBase() {
		// Add code here to handle exporting TickTick data
		//reinstall plugin
		const vault = this.plugin.app.vault;
		const fileNum = await this.plugin.cacheOperation?.checkFileMetadata()
		log('debug', `checking metadata for ${fileNum} files`);
		if (!fileNum || fileNum < 1){ //nothing? really?
			console.log("File Metadata rebuild.");
			const allMDFiles: TFile[] = vault.getMarkdownFiles();
			allMDFiles.forEach(file => {
				// console.log("File: ", file);
				this.tickTickSync?.fullTextModifiedTaskCheck(file.path)
			});
		}
		await this.plugin.saveSettings()

		const metadatas = await this.cacheOperation?.getFileMetadatas()

		//if (!await this.plugin.checkAndHandleSyncLock()) return;

		log('debug', 'checking deleted tasks')
		await doWithLock(LOCK_TASKS, async () => {

			//check empty task
			for (const key in metadatas) {
				// console.log("Key: ", key)
				const value = metadatas[key];
				//console.log(value)
				for (const taskDetails of value.TickTickTasks) {
					//console.log(`${taskId}`)
					let taskObject
					try {
						taskObject = this.plugin.cacheOperation?.loadTaskFromCacheID(taskDetails.taskId)
					} catch (error) {
						log('error', 'An error occurred while loading task cache:', error)
					}
					if (!taskObject) {
						// console.log(`The task data of the ${taskId} is empty.`)
						//get from TickTick
						try {
							taskObject = await this.plugin.tickTickRestAPI?.getTaskById(taskDetails.taskId);
							if (taskObject && taskObject.deleted === 1) {
								await this.plugin.cacheOperation?.deleteTaskIdFromMetadata(key, taskDetails.taskId)
							}
						} catch (error) {
							if (error.message.includes('404')) {
								// console.log(`Task ${taskId} seems to not exist.`);
								await this.plugin.cacheOperation?.deleteTaskIdFromMetadata(key, taskDetails.taskId)
								continue
							} else {
								log('error', 'An error occurred while loading task from api:', error)
								continue
							}
						}

					}
				}
			}
			await this.plugin.saveSettings()


			log('debug', 'checking renamed files -- This operation takes a while, please be patient.')
			try {
				//check renamed files
				for (const key in metadatas) {
					console.log("Checking Renamed: ", key);
					const value = metadatas[key];
					//console.log(value)
					const obsidianURL = this.plugin.taskParser.getObsidianUrlFromFilepath(key)
					for (const taskDetail of value.TickTickTasks) {
						//console.log(`${taskId}`)
						let taskObject
						try {
							taskObject = this.plugin.cacheOperation?.loadTaskFromCacheID(taskDetail.taskId)
						} catch (error) {
							log('warn', `An error occurred while loading task ${taskDetail.taskId} from cache:`, error);
						}
						if (!taskObject) {
							log('warn', `Task ${taskDetail.id}: ${taskDetail.title} is not found.`)
							continue
						}
						const oldTitle = taskObject?.title ?? '';
						if (!oldTitle.includes(obsidianURL)) {
							// console.log('Preparing to update description.')
							// console.log(oldContent)
							// console.log(newContent)
							try {
								await this.tickTickSync?.updateTaskContent(key)
							} catch (error) {
								log('warn', `An error occurred while updating task description:`, error);
							}
						}
					}
				}
				log('debug', "Done File Rename check.");

				try {
					log('debug', 'checking unsynced tasks');
					const files = vault.getFiles();
					for (const v of files) {

						if (v.extension == 'md') {
							console.log("Now looking at: ", v);
							try {
								console.log(`Scanning file ${v.path}`)
								await this.plugin.fileOperation?.addTickTickLinkToFile(v.path);
								if (getSettings().enableFullVaultSync) {
									await this.plugin.fileOperation?.addTickTickTagToFile(v.path);
								}
							} catch (error) {
								log('warn', `An error occurred while check new tasks in the file: ${v.path}`, error);
							}

						}
					}
				} catch (error) {
					log('warn', `An error occurred while checking for unsynced tasks.:`, error)
					return;
				}

				new Notice(`All files have been scanned.`)

			} catch (error) {
				log('warn', `An error occurred while scanning the vault.:`, error)
			}
		});
	}

	/*

	 */

	private async syncTickTickToObsidian(): Promise<boolean> {
		return this.tickTickSync.syncTickTickToObsidian();
	}

	private async syncFiles(){
		const filesToSync = getSettings().fileMetadata;
		let newFilesToSync = filesToSync;
		//If one project is to be synced, don't look at it's other files.

		if (getSettings().SyncProject) {
			newFilesToSync = Object.fromEntries(Object.entries(filesToSync).filter(([key, value]) =>
				value.defaultProjectId === getSettings().SyncProject));
		}

		//Check for duplicates before we do anything
		try {
			const result = this.cacheOperation?.checkForDuplicates(newFilesToSync);
			if (result?.duplicates && (JSON.stringify(result.duplicates) != "{}")) {
				let dupText = '';
				for (const duplicatesKey in result.duplicates) {
					dupText += "Task: " + duplicatesKey + '\nin files: \n';
					result.duplicates[duplicatesKey].forEach(file => {
						dupText += file + "\n"
					})
				}
				const msg =
					"Found duplicates in MetaData.\n\n" +
					`${dupText}` +
					"\nPlease fix manually. This causes unpredictable results" +
					"\nPlease open an issue in the TickTickSync repository if you continue to see this issue." +
					"\n\nTo prevent data corruption. Sync is aborted."
				console.log("Metadata Duplicates: ", result.duplicates);
				new Notice(msg, 0);
				return;
			}


			const duplicateTasksInFiles = await this.fileOperation?.checkForDuplicates(filesToSync, result?.taskIds)
			if (duplicateTasksInFiles && (JSON.stringify(duplicateTasksInFiles) != "{}")) {
				let dupText = ""
				for (let duplicateTasksInFilesKey in duplicateTasksInFiles) {
					dupText += "Task: " + duplicateTasksInFilesKey + "\nFound in Files: \n"
					duplicateTasksInFiles[duplicateTasksInFilesKey].forEach(file => {
						dupText += file + "\n"
					})
				}
				const msg =
					"Found duplicates in Files.\n\n" +
					`${dupText}` +
					"\nPlease fix manually. This causes unpredictable results" +
					"\nPlease open an issue in the TickTickSync repository if you continue to see this issue." +
					"\n\nTo prevent data corruption. Sync is aborted."
				new Notice(msg, 0)
				return;
			}
		} catch (Error) {
			console.error(Error)
			new Notice(`Duplicate check failed:  ${Error}`, 0)
			return
		}


		//let's see if any files got killed while we weren't watching
		for (const fileKey in newFilesToSync) {
			const file = this.plugin.app.vault.getAbstractFileByPath(fileKey);
			if (!file) {
				console.log("File ", fileKey, " was deleted before last sync.");
				await this.cacheOperation?.deleteFilepathFromMetadata(fileKey);
				const toDelete = newFilesToSync.findIndex(fileKey)
				newFilesToSync.splice(toDelete, 1)
			}
		}

		//Now do the task checking.
		for (const fileKey in newFilesToSync) {
			if (getSettings().debugMode) {
				console.log(fileKey);
			}

			await doWithLock(LOCK_TASKS, async () => {
				try {
					await this.tickTickSync?.fullTextNewTaskCheck(fileKey);
				} catch (error) {
					console.error('An error occurred in fullTextNewTaskCheck:', error);
				}
			});

			await doWithLock(LOCK_TASKS, async () => {
				try {
					await this.tickTickSync?.fullTextModifiedTaskCheck(fileKey);
				} catch (error) {
					console.error('An error occurred in fullTextModifiedTaskCheck:', error);
				}
			});

			await doWithLock(LOCK_TASKS, async () => {
				try {
					await this.tickTickSync?.deletedTaskCheck(fileKey);
				} catch (error) {
					console.error('An error occurred in deletedTaskCheck:', error);
				}
			});
		}
	}
}
