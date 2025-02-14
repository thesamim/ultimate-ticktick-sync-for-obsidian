import "@/static/index.css";
import "@/static/styles.css";

import { MarkdownView, Plugin, Notice, TFolder } from 'obsidian';
import type {Editor, MarkdownFileInfo} from 'obsidian';

//settings
import {
	DEFAULT_SETTINGS,
	getProjects,
	getSettings,
	getTasks,
	updateProjectGroups,
	updateProjects,
	updateSettings,
	updateTasks
} from './settings';

import {TickTickService} from '@/services';
//TickTick api
import {TickTickRestAPI} from '@/services/TicktickRestAPI';
//task parser
import {TaskParser} from './taskParser';
//cache task read and write
import {CacheOperation} from '@/services/cacheOperation';
//file operation
import {FileOperation} from './fileOperation';

//import modals
import {SetDefaultProjectForFileModal} from './modals/DefaultProjectModal';
import {LatestChangesModal} from "./modals/LatestChangesModal"
import {isOlder} from "./utils/version";
import {TickTickSyncSettingTab} from "./ui/settings";
import {QueryInjector} from "@/query/injector";
import {log, logging, type LogOptions} from "@/utils/logging";
import store from "@/store";
import {DateMan} from "@/dateMan";
import type { iFileMap } from '@/services/fileMap';


export default class TickTickSync extends Plugin {

	readonly service: TickTickService = new TickTickService(this);
	readonly taskParser: TaskParser = new TaskParser(this.app, this);
	readonly fileOperation: FileOperation = new FileOperation(this.app, this);
	readonly cacheOperation: CacheOperation = new CacheOperation(this.app, this);
	readonly dateMan: DateMan = new DateMan();

	readonly lastLines: Map<string, number> = new Map(); //lastLine object {path:line} is saved in lastLines map


	tickTickRestAPI?: TickTickRestAPI;
	statusBar?: HTMLElement;

	async onload() {
		//We're doing too much at load time, and it's causing issues. Do it properly!

		this.app.workspace.onLayoutReady(() => {
			this.registerEvent(this.app.vault.on('create', this.pluginLoad(), this));
		});

	}


	private async pluginLoad() {
		logging.registerConsoleLogger();
		log('info', `loading plugin "${this.manifest.name}" v${this.manifest.version}`);

		const isSettingsLoaded = await this.loadSettings();
		if (!isSettingsLoaded) {
			new Notice('Settings failed to load. Please reload the TickTickSync plugin.');
			return;
		}

		this.reloadLogging();
		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new TickTickSyncSettingTab(this.app, this));

		try {
			await this.initializePlugin();
		} catch (error) {
			log('error', 'API Initialization Failed.', error);
		}

		store.service.set(this.service);
		const queryInjector = new QueryInjector(this);
		this.registerMarkdownCodeBlockProcessor(
			"ticktick",
			queryInjector.onNewBlock.bind(queryInjector),
		);


		const ribbonIconEl = this.addRibbonIcon('sync', 'TTS Test', async (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			await this.scheduledSynchronization();
			new Notice(`Sync completed..`);
		});

		//Used for testing adhoc code.
		const ribbonIconEl1 = this.addRibbonIcon('check', 'TickTickSync', async (evt: MouseEvent) => {
			// Nothing to see here right now.
			// const { target } = evt;
			const markDownView = this.app.workspace.getActiveViewOfType(MarkdownView);
			const file = markDownView?.app.workspace.activeEditor?.file;
			if (file) {
				console.time("Parse file")
				const taskData = await this.service.buildFileMap(file);
				console.timeEnd("Parse file")
				console.log("Last Line", this.service.getLastLine());
				console.log("Insertion Line", this.service.getInsertionLine());

				console.log("taskData", taskData);
				// console.log("Insertion point is: ", this.service.get);
				let outFile = this.app.vault.getAbstractFileByPath("taskdata.json")
				if (!outFile) {
					await this.app.vault.create("/taskdata.json", "")
				}
				// 	console.log("outFile", outFile);
				//
				// 	// let output = ""
				// 	// taskData.forEach(task => {
				// 	// 	output = output + `${task.line[0]} -- ${task.parent}\n`;
				// 	// })
				//
				await this.app.vault.modify(outFile, JSON.stringify(taskData.fileMapRecords, null, 4));
				// 	// await this.app.vault.modify(outFile, output);
				//
				// console.time("Parse files")
				// const filesToSync = getSettings().fileMetadata;
				// for (const fileKey in filesToSync) {
				// 	const file = this.app.vault.getAbstractFileByPath(fileKey);
				// 	console.log("found file", file?.name);
				// 	const taskData = await this.fileOperation?.buildTaskData(file);
				// 	console.log("found: ", taskData.length)

				// listItems?.forEach(item => {
				// 	console.log(`item id: ${item.id}, task: ${item.task}, Position: ${item.position.start}, ${item.position.end}`);
				// })
				// }
				// console.timeEnd("Parse files")
			}
		});


		this.registerEvents();
		this.reloadInterval();

		// set default project for TickTick task in the current file
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'set-default-project-for-TickTick-task-in-the-current-file',
			name: 'Set default TickTick project for Tasks in the current file',
			editorCallback: (editor: Editor, view: MarkdownView | MarkdownFileInfo) => {
				if (!view || !view.file) {
					new Notice(`No active file.`)
					return;
				}
				const filepath = view.file.path;
				new SetDefaultProjectForFileModal(this.app, this, filepath);
			}
		});

		//display default project for the current file on status bar
		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		this.statusBar = this.addStatusBarItem();

		log('debug', `loaded plugin "${this.manifest.name}" v${this.manifest.version}`);
	}

	private syncIntervalId?: number;
	reloadInterval() {
		if (this.syncIntervalId) {
			window.clearInterval(this.syncIntervalId);
			this.syncIntervalId = undefined;
		}
		const timeout = getSettings().automaticSynchronizationInterval * 1000;
		if (timeout === 0) {
			return;
		}
		this.syncIntervalId = window.setInterval(this.scheduledSynchronization.bind(this), timeout);
	}

	// Configure logging.
	reloadLogging() {
		const options: LogOptions = {
			minLevels: {
				'': getSettings().logLevel,
				ticktick: getSettings().logLevel,
			},
		};
		logging.configure(options);
	}

	private registerEvents() {
		//Key event monitoring, judging line breaks and deletions
		this.registerDomEvent(document, 'keyup', async (evt: KeyboardEvent) => {
			if (!getSettings().token) {
				return;
			}

			const editor = this.app.workspace.activeEditor?.editor;
			if (!editor || !editor.hasFocus()) {
				return;
			}

			if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown'].includes(evt.key)) {
				// log('trace', `${evt.key} arrow key is released`);
				if (!this.checkModuleClass()) {
					return;
				}
				await this.lineNumberCheck();
			}

			if (['Delete', 'Backspace'].includes(evt.key)) {
				try {
					// log('trace', `${evt.key} arrow key is released`);
					if (!(this.checkModuleClass())) {
						return;
					}
					await this.service.deletedTaskCheck(null);
					await this.saveSettings();
				} catch (error) {
					log('warn', `An error occurred while deleting tasks: ${error}`);
				}

			}
		});

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', async (evt: MouseEvent) => {
			if (!getSettings().token) {
				return;
			}

			const editor = this.app.workspace.activeEditor?.editor;
			if (!editor || !editor.hasFocus()) {
				return;
			}

			if (!(this.checkModuleClass())) {
				return;
			}

			await this.lineNumberCheck();

			//Here for future debugging.
			const {target} = evt;
			if (target && target.type === 'checkbox') {
				await this.checkboxEventhandle(evt);
			}
			// 	// this.tickTickSync?.fullTextModifiedTaskCheck()
			//
			// }

		});


		//hook editor-change event, if the current line contains #ticktick, it means there is a new task
		this.registerEvent(this.app.workspace.on('editor-change', async (editor: Editor, info: MarkdownView | MarkdownFileInfo) => {
			try {
				if (!getSettings().token) {
					return;
				}
				console.log("editor change");
				//TODO: lineNumberCheck also triggers a line modified check. I suspect this is redundant and
				//      inefficient when a new task is being added. I've added returns out of there, but I need for find if the last line check
				//      is needed for an add.
				await this.lineNumberCheck();
				if (!(this.checkModuleClass())) {
					return;
				}
				if (getSettings().enableFullVaultSync) {
					return;
				}
				await this.service.lineContentNewTaskCheck(editor, info);
				await this.saveSettings();
			} catch (error) {
				log('error', 'An error occurred while check new task in line:', error);
			}
		}));

		//Listen to the delete event
		this.registerEvent(this.app.vault.on('delete', async (file) => {
			if (file instanceof TFolder || !getSettings().token) {
				//individual file deletes will be handled. I hope.
				return;
			}
			const updated = await this.service.deletedFileCheck(file.path);
			if (updated) {
				await this.saveSettings();
			}
		}));

		//Listen to the rename event and update the path in task data
		this.registerEvent(this.app.vault.on('rename', async (file, oldPath) => {
			if (file instanceof TFolder || !getSettings().token) {
				//individual file rename will be handled. I hope.
				return;
			}
			const updated = await this.service.renamedFileCheck(file.path, oldPath);
			if (updated) {
				await this.saveSettings();
			}
		}));


		//Listen for file modified events and execute fullTextNewTaskCheck
		this.registerEvent(this.app.vault.on('modify', async (file) => {
			try {
				console.log("modified.");
				if (!getSettings().token) {
					return;
				}
				const filepath = file.path;
				// console.log(`${filepath} is modified`)
				//get current view
				const activateFile = this.app.workspace.getActiveFile();
				//To avoid conflicts, Do not check files being edited
				if (activateFile?.path == filepath) {
					//TODO: find out if they cut or pasted task(s) in here.
					return;
				}

				await this.service.fullTextNewTaskCheck(filepath);
			} catch (error) {
				log('error', 'An error occurred while modifying the file:', error);
				// You can add further error handling logic here. For example, you may want to
				// revert certain operations, or alert the user about the error.
			}
		}));

		this.registerEvent(this.app.workspace.on('active-leaf-change', async (leaf) => {
			await this.setStatusBarText();
		}));
    }


	async onunload() {
		if (this.syncIntervalId) {
			window.clearInterval(this.syncIntervalId);
		}
		log('debug', `TickTickSync unloaded!`);
	}

	async loadSettings() {
		try {
			let data = await this.loadData();
			try {
				data = await this.migrateData(data);
			} catch (error) {
				console.error('Failed to migrate data:', error);
				return false; // Returning false indicates that the setting loading failed
			}
			if (data?.TickTickTasksData) {
				updateProjects(data.TickTickTasksData.projects);
				updateTasks(data.TickTickTasksData.tasks);
				updateProjectGroups(data.TickTickTasksData.projectGroups);
				delete data.TickTickTasksData;
			}
			const settings = Object.assign({}, DEFAULT_SETTINGS, data);
			updateSettings(settings);
		} catch (error) {
			log('error', 'Failed to load data:', error);
			return false; // Returning false indicates that the setting loading failed
		}
		return true; // Returning true indicates that the settings are loaded successfully
	}

	private async migrateData(data: any) {
		if (!data) return data;

		const notableChanges: string [][] = [];
		//TODO make more clean
		//We're going to handle data structure conversions here.
		if (!data.version) {
			const fileMetaDataStructure = data.fileMetadata;
			if (Array.isArray(fileMetaDataStructure)){
				for (const file in fileMetaDataStructure) {
					const oldTasksHolder = fileMetaDataStructure[file]; //an array of tasks.
					let newTasksHolder = {};
					newTasksHolder = {
						TickTickTasks: oldTasksHolder.TickTickTasks.map((taskIDString) => ({
							taskId: taskIDString,
							taskItems: [] //TODO: Validate that the assumption that the next sync will fill these correctly.
						})),
						TickTickCount: oldTasksHolder.TickTickCount,
						defaultProjectId: oldTasksHolder.defaultProjectId
					};
					fileMetaDataStructure[file] = newTasksHolder;
				}
			}
			//Force a sync
			if (getSettings().token) {
				await this.scheduledSynchronization();
			}
		}
		if ((!data.version) || (isOlder(data.version, '1.0.10'))) {
			//get rid of username and password. we don't need them no more.
			//delete data.username; //keep username for info
			// @ts-ignore
			delete data.username;
			delete data.password;
		}
		if ((!data.version) || (isOlder(data.version, '1.0.36'))) {
			//default to AND because that's what we used to do:
			data.tagAndOr = 1;
			//warn about tag changes.
			notableChanges.push(['New Task Limiting rules', 'Please update your preferences in settings as needed.', 'priorTo1.0.36']);
		}
		if ((!data.version) || (isOlder(data.version, '1.0.40'))) {
			//warn about the date/time foo
			notableChanges.push(['New Date/Time Handling', 'Old date formats will be converted on the next synchronization operation.', 'priorTo1.0.40']);
		}

		if (notableChanges.length > 0) {
			await this.LatestChangesModal(notableChanges);
		}

		//Update the version number. It will save me headaches later.
		if ((!data.version) || (isOlder(data.version, this.manifest.version))) {
			data.version = this.manifest.version;
			await this.saveSettings();
		}

		return data;
    }

	async saveSettings() {
		try {
			const settings = getSettings();
			// Verify that the setting exists and is not empty
			if (settings && Object.keys(settings).length > 0) {
				await this.saveData( //TODO: migrate to getSettings
					{
						...settings,
						TickTickTasksData: {"projects": getProjects(), "tasks": getTasks()}
					});
			} else {
				log('warn', 'Settings are empty or invalid, not saving to avoid data loss.');
			}
		} catch (error) {
			//Print or handle errors
			log('error', 'Error saving settings:', error);
		}
	}


	// return true of false
	async initializePlugin(): Promise<boolean> {
		if (!getSettings().token) {
			return false;
		}

		const isProjectsSaved = await this.saveProjectsToCache();
		if (!isProjectsSaved) {// invalid token or offline?
			this.tickTickRestAPI = undefined;
			new Notice(`TickTickSync plugin initialization failed, please check userID and password in settings.`);
			return false;
		}

		this.initializeModuleClass();
		//Create a backup folder to back up TickTick data
		try {
			//Back up all data before each startup
			if (!getSettings().skipBackup) {
				this.service.backup();
			}
		} catch (error) {
			log('error', 'error creating user data folder:', error);
			new Notice(`error creating user data folder`);
			return false;
		}
		new Notice('TickTickSync loaded successfully.' + getSettings().skipBackup ? ' Skipping backup.' : 'TickTick data has been backed up.');
		return true;
	}

	initializeModuleClass() {
		// console.log("initializeModuleClass")
		//initialize TickTick restapi
		if (!this.tickTickRestAPI) {
			// console.log("API wasn't inited?")
			this.tickTickRestAPI = new TickTickRestAPI(this.app, this, null);
		}
	}

	async lineNumberCheck(): Promise<boolean> {
		const markDownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!markDownView) {
			return false;
		}

		const cursor = markDownView?.editor.getCursor();
		const line = cursor?.line;
		//const lineText = view.editor.getLine(line)
		const fileContent = markDownView.data;

		//console.log(line)
		//const fileName = view.file?.name
		const file = markDownView?.app.workspace.activeEditor?.file;
		const fileName = file?.name;
		const filepath = file?.path;

		if (typeof this.lastLines === 'undefined' || typeof this.lastLines.get(fileName as string) === 'undefined') {
			this.lastLines.set(fileName as string, line as number);
			return false;
		}

		//console.log(`filename is ${fileName}`)
		if (this.lastLines.has(fileName as string) && line !== this.lastLines.get(fileName as string)) {
			const lastLine = this.lastLines.get(fileName as string);
			// if (this.settings.debugMode) {
			// 	console.log('Line changed!', `current line is ${line}`, `last line is ${lastLine}`);
			// }

			//Perform the operation you want
			const lastLineText = markDownView.editor.getLine(lastLine as number);
			// console.log(lastLineText)
			if (!(this.checkModuleClass())) {
				return false;
			}
			this.lastLines.set(fileName as string, line as number);
			// try{

			return await this.service.lineModifiedTaskCheck(filepath as string, lastLineText, lastLine as number, fileContent);

			// }catch(error){
			//     console.error(`An error occurred while check modified task in line text: ${error}`);
			//     await this.unlockSynclock();
			// }
		} else {
			//console.log('Line not changed');
		}
		return false;
	}

	async checkboxEventhandle(evt: MouseEvent) {
		const target = evt.target as HTMLInputElement;
		const bOpenTask = target.checked;

		new Notice(`Task will be updated as ${bOpenTask ? 'closed' : 'opened'} on next Sync`);
	}


	// async oldCheckboxEventhandle(evt: MouseEvent) {
	// 	if (!(this.checkModuleClass())) {
	// 		return;
	// 	}
	//
	//
	// 	const target = evt.target as HTMLInputElement;
	// 	const bOpenTask = target.checked;
	// 	console.log('Second: Checked: ', bOpenTask);
	//
	// 	//This breaks for subtasks if Tasks is installed. See: https://github.com/obsidian-tasks-group/obsidian-tasks/discussions/2685
	// 	//hence the else.
	// 	const taskElement = target.closest('div');
	// 	if (taskElement) {
	// 		const taskLine = taskElement.textContent;
	// 		const taskId = this.taskParser?.getTickTickId(taskLine);
	// 		if (taskId) {
	// 			// let task = this.taskParser?.convertTextToTickTickTaskObject(tas)
	// 			if (bOpenTask) {
	// 				console.log('it\'s open, close it.');
	// 				this.tickTickSync?.closeTask(taskId);
	// 			} else {
	// 				console.log('it\'s closed, open it.');
	// 				this.tickTickSync?.reopenTask(taskId);
	// 			}
	// 		}
	// 	} else {
	// 		console.log('#### TickTick_id not found -- do it the hard way.');
	// 		//Start full-text search and check status updates
	// 		try {
	// 			console.log('#### Full text modified??');
	// 			let file = this.app.workspace.getActiveFile();
	// 			let filePath = null;
	// 			if (file instanceof TFile) {
	// 				filePath = file.path;
	// 			}
	//
	// 			if (!await this.checkAndHandleSyncLock()) return;
	// 			await this.tickTickSync?.fullTextModifiedTaskCheck(filePath);
	// 			await this.unlockSynclock();
	// 		} catch (error) {
	// 			console.error(`An error occurred while check modified tasks in the file: ${error}`);
	// 			await this.unlockSynclock();
	//
	// 		}
	// 	}
	// }

	//return true
	checkModuleClass() {
		if (!getSettings().token){
			new Notice(`Please login from settings.`);
			return false;
		}

		if (!this.service.initialized) {
			this.service.initialize();
		}
		if (this.tickTickRestAPI === undefined) {
			this.initializeModuleClass();
		}
		return true;
	}

	async setStatusBarText() {
		const markDownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!markDownView || !markDownView.file) {
			this.statusBar?.setText('');
			return;
		}

		const filepath = markDownView.file.path;
		const defaultProjectName = await this.cacheOperation.getDefaultProjectNameForFilepath(filepath);
		if (!defaultProjectName) {
			// console.log(`projectName undefined`)
			return;
		}
		this.statusBar?.setText(defaultProjectName);

	}

	async scheduledSynchronization() {
		if (!this.checkModuleClass()) {
			return;
		}
		log('debug', `TickTick scheduled synchronization task started at ${new Date().toLocaleString()}`)
		try {
			await this.service.synchronization();
		} catch (error) {
			log('error', 'An error occurred:', error);
			new Notice(`An error occurred: ${error}`);
		}
		log('debug', `TickTick scheduled synchronization task completed at ${new Date().toLocaleString()}`)
	}

	async saveProjectsToCache(): Promise<boolean> {
		if (!this.checkModuleClass()) {
			return false;
		}
		log('debug', `TickTick saveProjectsToCache started at ${new Date().toLocaleString()}`)
		try {
			return await this.service.saveProjectsToCache();
		} catch (error) {
			log('error', 'An error in saveProjectsToCache occurred:', error);
			new Notice(`An error in saveProjectsToCache occurred: ${error}`);
		}
		log('debug', `TickTick saveProjectsToCache completed at ${new Date().toLocaleString()}`)
		return false;
	}

	private async LatestChangesModal(notableChanges: string[][]) {
		const myModal = new LatestChangesModal(this.app, notableChanges, (result) => {
			this.ret = result;
		});
		return await myModal.showModal();

	}
}




