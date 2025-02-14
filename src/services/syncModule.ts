import TickTickSync from '@/main';
import {
  App,
  Editor,
  type EditorPosition,
  type MarkdownFileInfo,
  MarkdownView,
  Notice,
  TFile,
  TFolder
} from 'obsidian';
import type { ITask } from '@/api/types/Task';
import ObjectID from 'bson-objectid';
import type { TaskDetail } from '@/services/cacheOperation';
import { TaskDeletionModal } from '@/modals/TaskDeletionModal';
import { getSettings, updateProjectGroups } from '@/settings';
import {TickTickService} from '@/services';

type deletedTask = {
  taskId: string,
  projectId: string
}

export class SyncMan {
  private readonly app: App;
  private readonly plugin: TickTickSync;


  constructor(app: App, plugin: TickTickSync) {
    //super(app,settings,tickTickRestAPI,ticktickSyncAPI,taskParser,cacheOperation);
    this.app = app;
    this.plugin = plugin;
  }

  async deletedTaskCheck(file_path: string | null): Promise<void> {

    let file;
    let currentFileValue;
    let view;
    let filepath;

    if (file_path) {
      file = this.app.vault.getAbstractFileByPath(file_path);
      if ((file) && (file instanceof TFolder)) {
        //leave folders alone.
        return;
      }
      filepath = file_path;
      if (file instanceof TFile) {
        currentFileValue = await this.app.vault.read(file);
      }
    } else {
      view = this.app.workspace.getActiveViewOfType(MarkdownView);
      //const editor = this.app.workspace.activeEditor?.editor
      file = this.app.workspace.getActiveFile();
      filepath = file?.path;
      //Use view.data instead of vault.read. vault.read is delayed
      currentFileValue = view?.data;
    }

    let fileMetadata = await this.plugin.cacheOperation?.getFileMetadata(filepath, null);
    // console.log("fileMetaData: ", fileMetadata)
    if (!fileMetadata || !fileMetadata.TickTickTasks) {
      // console.log('fileMetaData has no task')
      return;
    }


    let fileMetadata_TickTickTasks: TaskDetail[] = fileMetadata.TickTickTasks;
    if (currentFileValue) {
      const currentFileValueWithOutFileMetadata = currentFileValue.replace(/^---[\s\S]*?---\n/, '');
      const deletedTaskIds = await this.findMissingTaskIds(currentFileValueWithOutFileMetadata, fileMetadata_TickTickTasks, filepath);
      const numDeletedTasks = deletedTaskIds.length;
      if (numDeletedTasks > 0) {

        await this.deleteTasksByIds(deletedTaskIds);
        //update filemetadata so we don't try to delete items for deleted tasks.
        fileMetadata = await this.plugin.cacheOperation?.getFileMetadata(filepath, null);
        if (!fileMetadata || !fileMetadata.TickTickTasks) {
          return;
        }
        fileMetadata_TickTickTasks = fileMetadata.TickTickTasks;
      }
      //That's Tasks out of the way. Their items will be magically deleted.
      //Now go through all the items, if any are deleted, their tasks have to be updated.
      const deletedItems: string[] = [];
      for (const task of fileMetadata_TickTickTasks) {
        if (!task.taskItems) {
          continue;
        }
        for (const taskItem of task.taskItems) {
          if (!currentFileValueWithOutFileMetadata.includes(taskItem)) {
            deletedItems.push(taskItem);
          }
        }
        if (deletedItems.length > 0) {
          //this will remove items, update the file metadata and update the cache in one swell foop.
          try {
            let updatedTask = await this.plugin.cacheOperation?.removeTaskItem(fileMetadata, task.taskId, deletedItems);
            if (updatedTask) {
              let taskURL = this.plugin.taskParser.getObsidianUrlFromFilepath(filepath);
              if (taskURL) {
                updatedTask.title = updatedTask.title + ' ' + taskURL;
              }
              let updateResult = await this.plugin.tickTickRestAPI?.UpdateTask(updatedTask);
            }
          } catch (error) {
            console.error('Task Item removal failed: ', error);
          }
        }
      }
      // console.log("deleted items: ", deletedItems)

    } else {
      //We had a file. There is no content. User deleted ALL tasks, all items will be deleted as a side effect.
      const deletedTaskIDs = fileMetadata_TickTickTasks.map((taskDetail) => taskDetail.taskId);
      if (deletedTaskIDs.length > 0) {
        //TODO: Assuming that if they for real deleted everything, it will get caught on the next sync
        console.error('Content not readable.', currentFileValue, filepath, ' file is possibly open elsewhere?');
        new Notice(`All content from ${file.name} APPEARS to have been removed.\n` +
          'If this is correct, please confirm task deletion. Otherwise, cancel task deletion.', 0);

        await this.deleteTasksByIds(deletedTaskIDs);
      }
    }

  }

  async findMissingTaskIds(currentContent: string, taskDetails: TaskDetail[], filePath: string) {

    // Extract all taskIds from the currentContent, considering the specific structure.
    const regex = /%%\[ticktick_id:: ([a-f0-9]{24})\]%%/g;
    const matches: RegExpMatchArray = currentContent.matchAll(regex);
    const existingTaskIds = new Set([...matches].map((match) => match[1]));
    // Find taskIds in the tasks list that are not present in the existingTaskIds set.
    // Filter and extract taskIds from taskDetails
    let missingTaskIds = taskDetails
      .filter((taskDetail) => !existingTaskIds.has(taskDetail.taskId))
      .map((taskDetail: TaskDetail) => taskDetail.taskId);// Explicitly create an array of strings

    //ok, but if they're just being moved? See if we can find them elsewhere first.
    //
    if (missingTaskIds && missingTaskIds.length > 0) {
      let saveTheseTasks: string[] = [];
      for (const taskId of missingTaskIds) {
        const location = await this.plugin.cacheOperation?.findTaskInFiles(taskId);
        if (location) {
          saveTheseTasks.push(taskId);
        }
      }
      // console.log("== saved:", saveTheseTasks)
      missingTaskIds = missingTaskIds
        .filter((taskId) => {
            return !saveTheseTasks.includes(taskId);
          }
        );
      // console.log("==", filePath, "sanitized", missingTaskIds)
    }
    // else {
    // 	console.log("== nothing missing.")
    // }
    return missingTaskIds;
  }

  async lineContentNewTaskCheck(editor: Editor, view: MarkdownView | MarkdownFileInfo): Promise<boolean> {
    //const editor = this.app.workspace.activeEditor?.editor
    //const view =this.app.workspace.getActiveViewOfType(MarkdownView)
    const filepath = view.file?.path;
    const fileContent = view?.data;
    const cursor = editor.getCursor();
    const line = cursor.line;
    const linetxt = editor.getLine(line);
    let before = fileContent?.length;
    await this.addTask(linetxt, filepath, line, fileContent, editor, cursor);
    let after = fileContent?.length;
    // console.log(" : ", before, after, (before != after))
    return (before != after);
  }

  async addTask(lineTxt: string, filePath: string, line: number, fileContent: string, editor: Editor | null, cursor: EditorPosition | null) {
    //Add task
    // if (getSettings().debugMode) {
    // 	console.log("Adding to: ", filePath)
    // }

    if ((!this.plugin.taskParser.hasTickTickId(lineTxt) && this.plugin.taskParser.hasTickTickTag(lineTxt))) {
      //Whether #ticktick is included, but not ticktickid: Task just added.
      try {
        const currentTask = await this.plugin.taskParser.convertLineToTask(lineTxt, filePath, line, fileContent);
        const newTask = await this.plugin.tickTickRestAPI?.AddTask(currentTask);
        // console.log("TRACETHIS New Task: ", newTask);
        if (currentTask.parentId) {
          let parentTask = await this.plugin.cacheOperation?.loadTaskFromCacheID(currentTask.parentId);
          parentTask = this.plugin.taskParser.addChildToParent(parentTask, currentTask.parentId);
          parentTask = await this.plugin.tickTickRestAPI?.UpdateTask(parentTask);
          await this.plugin.cacheOperation?.updateTaskToCache(parentTask);
        }
        const { id: ticktick_id, projectId: ticktick_projectId, url: ticktick_url } = newTask;
        //console.log(newTask);
        new Notice(`new task ${newTask.title} id is ${newTask.id}`);

        //If the task is completed
        if (currentTask.status != 0) {
          await this.plugin.tickTickRestAPI?.CloseTask(newTask.id);
          await this.plugin.cacheOperation?.closeTaskToCacheByID(ticktick_id);

        }

        //Save the data that TickTick Doesn't know about.
        newTask.dateHolder = currentTask.dateHolder;

        //Get TickTickID and links after updating.
        let updatedText = await this.updateTaskLine(newTask, lineTxt, editor, cursor, fileContent, line, filePath);

        //we want the line as it is in Obsidian.
        newTask.lineHash = await this.plugin.taskParser?.getLineHash(updatedText);
        //newTask writes to cache
        //Will handle meta data there.
        await this.plugin.cacheOperation?.appendTaskToCache(newTask, filePath);
        await this.plugin.saveSettings();
      } catch (error) {
        console.error('Error adding task:', error);
        console.error(`The error occurred in file: ${filePath}`);
        return fileContent;
      }

    }
    return fileContent;
  }

  async fullTextNewTaskCheck(file_path: string): Promise<boolean> {
    let file;
    let currentFileValue;
    let view;
    let filepath = null;
    let editor = null;
    let cursor = null;

    if (file_path) {
      file = this.app.vault.getAbstractFileByPath(file_path);
      if ((file) && (file instanceof TFolder)) {
        //leave folders alone.
        return false;
      }
      if (file) {
        filepath = file_path;
        currentFileValue = await this.app.vault.read(file);
      } else {
        console.error(`File: ${file_path} not found. Removing from Meta Data`);
        await this.plugin.cacheOperation?.deleteFilepathFromMetadata(file_path);
        return false;
      }
    } else {
      const workspace = this.app.workspace;
      view = workspace.getActiveViewOfType(MarkdownView);
      editor = workspace.activeEditor?.editor;
      file = workspace.getActiveFile();
      filepath = file?.path;
      //Use view.data instead of vault.read. vault.read is delayed
      currentFileValue = view?.data;
    }

    if (getSettings().enableFullVaultSync) {
      //console.log('full vault sync enabled')
      //console.log(filepath)
      // console.log("Called from sync.")
      await this.plugin.fileOperation?.addTickTickTagToFile(filepath);
    }

    const content = currentFileValue;
    const lines = content.split('\n');
    for (let line = 0; line < lines.length; line++) {
      const linetxt = lines[line];
      currentFileValue = await this.addTask(linetxt, filepath, line, currentFileValue, editor, cursor);
    }
    return true;
  }

  //Deal with Tasks and Task Items here because they are single line entities.
  async lineModifiedTaskCheck(filepath: string | undefined, lineText: string, lineNumber: number | undefined, fileContent: string): Promise<boolean> {
    let modified = false;
    if (getSettings().enableFullVaultSync) {
      //new empty metadata
      let metadata = await this.plugin.cacheOperation?.getFileMetadata(filepath);
      //TODO: I'm pretty sure this is redundant. Don't feel like taking it out now because it's been here forever and it works.
      if (!metadata) {
        //But if we still don't have anything bail the F out.
        return false;
      }
      await this.plugin.saveSettings();
    }

    //check task
    let bHashCheckFailed;
    if (this.plugin.taskParser?.hasTickTickId(lineText) && this.plugin.taskParser?.hasTickTickTag(lineText)) {
      const newHash = await this.plugin.taskParser?.getLineHash(lineText);
      //convertLineToTask has become a pretty expensive operation avoid it.
      //let's see if the saved task has a lineHash.
      const lineTask_ticktick_id = this.plugin.taskParser.getTickTickId(lineText);
      const savedTask = this.plugin.cacheOperation?.loadTaskFromCacheID(lineTask_ticktick_id);
      if (savedTask) {
        if (savedTask.lineHash) {
          //it has one. Is it the same as this one being edited?
          if (newHash == savedTask.lineHash) {
            return false;
          } else {
            if (getSettings().debugMode) {
              console.log('hashcheck failed.', '\n', lineText, '\n', savedTask.title, '\n', newHash, '\n', savedTask.lineHash);
            }
            bHashCheckFailed = true;
          }
        }
      }
      const lineTask = await this.plugin.taskParser?.convertLineToTask(lineText, filepath, lineNumber, fileContent);
      // console.log("TRACETHIS: 1", lineTask.dateHolder);

      if (!savedTask) {
		  //Task in note, but not in cache. Assuming this would only happen in testing, delete the task from the note
		  console.error(`There is no task ${lineTask.id}, ${lineTask.title} in the local cache. It will be deleted`);

		  new Notice(`There is no task ${lineTask.id}, ${lineTask.title} in the local cache. It will be deleted`);
		  //TODO: If there is no task in cache, we can't tell how many items there are. How did the task from from cache in the first place?
		  //TODO: Give them the opportunity to add to cache and TT?
		  const numItems = lineTask.items?.length + (lineTask.content.match(/\n/g) || []).length;
		  await this.plugin.fileOperation?.deleteTaskFromSpecificFile(filepath, lineTask, true);
		  return false;
	  } else {
		  //this should only be necessary for a while, until they update all tasks
		  if (!savedTask.dateHolder) {
			  savedTask.dateHolder = this.plugin.dateMan?.getEmptydateHolder();
			  await this.plugin.cacheOperation?.updateTaskToCache(savedTask, null);
		  }
		  if (!savedTask.lineHash) {
			  savedTask.lineHash = await this.plugin.taskParser?.getLineHash(lineText);
		  }
	  }

      //Check whether the content has been modified
      const lineTaskTitle = lineTask.title;


      //Whether content is modified?
      const titleModified = this.plugin.taskParser?.isTitleChanged(lineTask, savedTask);
      //tag or labels whether to modify
      const tagsModified = this.plugin.taskParser?.isTagsChanged(lineTask, savedTask);
      //project whether to modify

      const projectModified = this.plugin.taskParser?.isProjectIdChanged(lineTask, savedTask);
      //Check if task has been in moved inside Obsidian
      const oldFilePath = await this.plugin.cacheOperation?.isProjectMoved(lineTask, filepath);
      let projectMoved = false;
      if (oldFilePath) {
        projectMoved = true;
      }

      //Whether status is modified?
      const statusModified = this.plugin.taskParser?.isStatusChanged(lineTask, savedTask);

      //any dates modified
      const someDatesModified = this.plugin.dateMan?.areDatesChanged(lineTask, savedTask);
      // console.log("TRACETHIS: 2", lineTask.dateHolder);


      const parentIdModified = this.plugin.taskParser?.isParentIdChanged(lineTask, savedTask);
      //check priority
      const priorityModified = !(lineTask.priority == savedTask.priority);

      const taskItemsModified = lineTask.items?.length != savedTask.items?.length;


      try {
        let contentChanged = false;
        let tagsChanged = false;
        let projectChanged = false;
        let statusChanged = false;
        let datesChanged = false;
        let parentIdChanged = false;
        let priorityChanged = false;
        let taskItemsChanged = false;


        if (titleModified) {
          if (getSettings().debugMode) {
            console.log(`Title modified for task ${lineTask_ticktick_id}\n"New:" ${lineTask.title}\n"Cached:" ${savedTask.title}`);
          }
          // savedTask.title = lineTaskTitle
          contentChanged = true;
        }

        if (tagsModified) {
          if (getSettings().debugMode) {
            console.log(`Tags modified for task ${lineTask_ticktick_id}, , ${lineTask.tags}, ${savedTask.tags}`);
          }
          // savedTask.tags = lineTask.tags
          tagsChanged = true;
        }


        if (someDatesModified) {
          if (getSettings().debugMode) {
            console.log(`Due date modified for task ${lineTask_ticktick_id}`);
            console.log('new: ', lineTask.dueDate, 'old: ', savedTask.dueDate);
          }
          //console.log(savedTask.due.date)
          // savedTask.dueDate = lineTask.dueDate
          datesChanged = true;
        }

        //let's not lose the time zone!
        lineTask.timeZone = savedTask.timeZone;

        if (projectModified || projectMoved) {

          // console.log(`Project id modified for task ${lineTask_ticktick_id}, ${lineTask.projectId}, ${savedTask.projectId}`)
          await this.plugin.tickTickRestAPI?.moveTaskProject(lineTask, savedTask.projectId, lineTask.projectId);

          let noticeMessage = '';
          if (projectModified) {
            if (getSettings().debugMode) {
              console.log('Project Modified');
            }
            noticeMessage = `Task ${lineTask_ticktick_id}: ${lineTaskTitle} has moved from ` +
              `${await this.plugin.cacheOperation?.getProjectNameByIdFromCache(savedTask.projectId)} to ` +
              `${await this.plugin.cacheOperation?.getProjectNameByIdFromCache(lineTask.projectId)} \n` +
              `If any children were moved, they will be updated to ${getSettings().baseURL} on the next Sync event`;
          } else if (projectMoved) {
            if (getSettings().debugMode) {
              console.log('Project Moved');
            }
            noticeMessage = `Task ${lineTask_ticktick_id}: ${lineTaskTitle} has moved from ` +
              `${oldFilePath} to ` +
              `${filepath} \n` +
              `If any children were moved, they will be updated to ${getSettings().baseURL} on the next Sync event`;
          }
          new Notice(noticeMessage, 0);
          if (getSettings().debugMode) {
            console.log(noticeMessage);
          }

          // savedTask.projectId = lineTask.projectId
          projectChanged = true;
        }


        if (parentIdModified) {

          let oldParent = await this.plugin.cacheOperation?.loadTaskFromCacheID(savedTask.parentId);
          let newParent = await this.plugin.cacheOperation?.loadTaskFromCacheID(lineTask.parentId);
          let noticeMessage = `Task ${lineTask_ticktick_id}:\n${this.plugin.taskParser?.stripOBSUrl(lineTaskTitle).trim()}\n` +
            `used to be a child of:\n${oldParent ? oldParent.title.trim() : 'No old parent found'}\n` +
            `but is now a child of:\n${newParent ? newParent.title.trim() : 'No new parent found.'}\n` +
            `If any children were moved, they will be updated to ${getSettings().baseURL} on the next Sync event`;
          await this.plugin.tickTickRestAPI?.moveTaskParent(lineTask_ticktick_id, lineTask.parentId, lineTask.projectId);

          new Notice(noticeMessage, 0);
          if (getSettings().debugMode) {
            console.log(noticeMessage);
          }

          // savedTask.parentId = lineTask.parentId
          parentIdChanged = true;
        }

        if (priorityModified) {

          // savedTask.priority = lineTask.priority
          priorityChanged = true;
        }

        if (taskItemsModified) {
          if (getSettings().debugMode) {
            console.log('Number of items changed: ', lineTask.items?.length, savedTask.items?.length);
          }
          taskItemsChanged = true;
        }


        if (contentChanged || tagsChanged || datesChanged ||
          projectChanged || parentIdChanged || priorityChanged || parentIdChanged || taskItemsChanged) {
          //console.log(updatedContent)
          savedTask.modifiedTime = this.plugin.dateMan?.formatDateToISO(new Date());

          // console.log("TRACETHIS: 3", lineTask.dateHolder);
          const saveDateHolder = lineTask.dateHolder; //because it's going to get clobered when we refetch the tas,
          const updatedTask = <ITask>await this.plugin.tickTickRestAPI?.UpdateTask(lineTask);
          //TODO: This feels Kludgy AF. examine ways to get past this.
          updatedTask.dateHolder = saveDateHolder;
          updatedTask.lineHash = newHash;
          // console.log("TRACETHIS, should have a dateholder", updatedTask);

          await this.updateTaskLine(updatedTask, lineText, null, null, fileContent, lineNumber, filepath);


          if (!projectChanged) {
            await this.plugin.cacheOperation?.updateTaskToCache(updatedTask, null);
          } else {
            await this.plugin.cacheOperation?.updateTaskToCache(updatedTask, filepath);
          }
          modified = true;
        }
        // console.log(result)

        if (statusModified) {
          if (getSettings().debugMode) {
            console.log(`Status modified for task ${lineTask_ticktick_id}`);
          }
          if (lineTask.status != 0) {
            if (getSettings().debugMode) {
              console.log(`task completed`);
            }
            this.plugin.tickTickRestAPI?.CloseTask(lineTask.id, lineTask.projectId);
            await this.plugin.cacheOperation?.closeTaskToCacheByID(lineTask.id);
          } else {

            if (getSettings().debugMode) {
              console.log(`task not completed`);
            }
            this.plugin.tickTickRestAPI?.OpenTask(lineTask.id, lineTask.projectId);
            await this.plugin.cacheOperation?.reopenTaskToCacheByID(lineTask.id);
          }
          statusChanged = true;
          new Notice(`Task Status for ${lineTask_ticktick_id} updated `);
        }


        if (contentChanged || tagsChanged || datesChanged ||
          projectChanged || parentIdChanged || priorityChanged || parentIdChanged || taskItemsChanged) {

          // console.log(lineTask)
          // console.log(savedTask)
          //`Task ${lastLineTaskticktickId} was modified`
          await this.plugin.saveSettings();
          let message = `Task ${lineTask_ticktick_id} is updated.`;
          // console.log("#####", message);
          new Notice(message);

          if (contentChanged) {
            message += '\nContent was changed.';
          }
          if (statusChanged) {
            message += '\nStatus was changed.';
          }
          if (datesChanged) {
            message += '\nDue date was changed.';
          }
          if (tagsChanged) {
            message += '\nTags were changed.';
          }
          if (projectChanged) {
            message += '\nProject was changed.';
          }
          if (priorityChanged) {
            message += '\nPriority was changed.';
          }
          if (parentIdModified) {
            message += '\nParent was changed.';
          }
          if (taskItemsChanged) {
            message += '\nTask Items changed';
          }


          if (getSettings().debugMode) {
            console.log('Task Changed: ', lineTask.id, '\n', message);
          }

        } else {
          //console.log(`Task ${lineTask_ticktick_id} did not change`);
        }

      } catch (error) {
        console.error('Error updating task:', error);
      }
      //There's a corner case somewhere, where the line content hash that's saved is not the line content hash
      // from the line in Obsidian. Until I find that corner case, we're just going to reset the line hash here and
      // be done.
      if (!modified && bHashCheckFailed) {
        const updatedHash = await this.plugin.taskParser?.getLineHash(lineText);
        lineTask.lineHash = updatedHash;
        await this.plugin.cacheOperation?.updateTaskToCache(lineTask, null);
        await this.plugin.saveSettings();
        console.log(`Updated hash: ${updatedHash}`);
      }
    } else /*if (!getSettings().enableFullVaultSync) */{
      await this.handleTaskContent(lineText, filepath, lineNumber);
    }

    return modified;
  }

  async deleteTaskItemCheck(filepath: string, lineText: string, lineNumber: number, fileContent: string): Promise<void> {


    if (!this.plugin.taskParser?.hasTickTickId(lineText) &&
      !this.plugin.taskParser?.hasTickTickTag(lineText) &&
      this.plugin.taskParser?.isMarkdownTask(lineText)) {
      //check for deleted Items.
      let modified = false;
      //Is it a task item?
      //is it a task at all?
      if (!this.plugin.taskParser?.isMarkdownTask(lineText)) {
        //Nah Brah. Bail.
        return;
      }
      let parsedItem = this.plugin.taskParser?.taskFromLine(lineText);
      let tabs = parsedItem?.indent;
      let content = parsedItem?.description;
      const thisLineStatus = parsedItem?.status;
      let parentTask;
      if (tabs > 0) {//must be indented at least once.
        const lines = fileContent.split('\n');
        //We're on a task item, need to find it's parent.
        //TODO: Do we get here on deleting a character
        for (let i = lineNumber - 1; i >= 0; i--) {
          const line = lines[i];
          if (this.plugin.taskParser?.hasTickTickId(line) && this.plugin.taskParser?.hasTickTickTag(line)) {
            const ticktickid = this.plugin.taskParser.getTickTickId(line);
            parentTask = await this.plugin.cacheOperation?.loadTaskFromCacheID(ticktickid);
            if (parentTask && parentTask.items) { //we have some items. Let's assume the order is the same?
              let itemId = '';
              let regex = /%%(.*)%%/;
              let match = regex.exec(content);
              if (match) {
                itemId = match[1];
                const oldItem = parentTask.items.find((item) => item.id === itemId);
                if (oldItem) {
                  parentTask.items = parentTask.items.filter(item => item.id !== itemId);
                  modified = true;
                }
                break;
              } else {
                //was it not added in the first place? Assume it will sort itself out on the next go around
                console.log(`${itemId} Not found.`);
                break;
              }
            } else {
              console.log(`parent didn't have items.`);
              break;
            }

          }
        }
        if (modified) {
          //do the update mambo. cache and api.
          //TODO: Verify that pushing an item with title and status will just matically add it.
          parentTask.modifiedTime = this.plugin.dateMan?.formatDateToISO(new Date());
          const result = await this.plugin.tickTickRestAPI?.UpdateTask(parentTask);
          await this.plugin.cacheOperation?.updateTaskToCache(parentTask);
        }

      }


    }
  }

  async fullTextModifiedTaskCheck(filepath: string | null): Promise<void> {
    let file;
    let currentFileValue;
    let view;

    try {
      if (filepath) {
        file = this.app.vault.getAbstractFileByPath(filepath);
        if ((file) && (file instanceof TFolder)) {
          //leave folders alone.
          return;
        }
        currentFileValue = await this.app.vault.read(file);
      } else {
        view = this.app.workspace.getActiveViewOfType(MarkdownView);
        file = this.app.workspace.getActiveFile();
        filepath = file?.path;
        currentFileValue = view?.data;
      }

      //TODO: Find a single pass way of doing this.
      const content = currentFileValue;

      let hasModifiedTask = false;
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (this.plugin.taskParser?.isMarkdownTask(line)) {
          try {
            await this.lineModifiedTaskCheck(filepath, line, i, content);
            hasModifiedTask = true;
          } catch (error) {
            console.error('Error modifying task:', error);
          }
        }
      }
      //let's check if we have any notes to update.
      const fileMap = await this.plugin.service.buildFileMap(file);
      fileMap?.fileMapRecords?.forEach(async element => {
        if (element.type == 'Task') {
          if (element?.taskLines?.length > 1) {
            //we have a task, it has notes.
            hasModifiedTask = await this.noteModifiedCheck(element.taskLines, element.ID, filepath as string);
          }
        }
      });


      //TODO: at some point, I had a notion to simplify the change handling, this is an after effect.
      if (hasModifiedTask) {
        try {
          // Perform necessary actions on the modified content and file meta data
        } catch (error) {
          console.error('Error processing modified content:', error);
        }
      }
    } catch (error) {
      console.error('Error:', error);
    }
  }

  // Close a task by calling API and updating JSON file
  async closeTask(taskId: string): Promise<void> {
    try {
      let projectId = await this.plugin.cacheOperation?.closeTaskToCacheByID(taskId);
      await this.plugin.tickTickRestAPI?.CloseTask(taskId, projectId);
      await this.plugin.fileOperation?.completeTaskInTheFile(taskId);

      this.plugin.saveSettings();
      new Notice(`Task ${taskId} is closed.`);
    } catch (error) {
      console.error('Error closing task:', error);
      throw error; // Throw an error so that the caller can catch and handle it
    }
  }

  //open task
  async reopenTask(taskId: string): Promise<void> {
    try {
      let projectId = await this.plugin.cacheOperation?.reopenTaskToCacheByID(taskId);
      await this.plugin.tickTickRestAPI?.OpenTask(taskId, projectId);
      await this.plugin.fileOperation.uncompleteTaskInTheFile(taskId);

      this.plugin.saveSettings();
      new Notice(`Task ${taskId} is reopened.`);
    } catch (error) {
      console.error('Error opening task:', error);
      throw error; // Throw an error so that the caller can catch and handle it
    }
  }

  /**
   * Delete the task with the specified ID from the task list and update the JSON file
   * @param taskIds array of task IDs to be deleted
   * @returns Returns the successfully deleted task ID array
   */
  async deleteTasksByIds(taskIds: string[]): Promise<string[]> {
    const deletedTaskIds = [];

    const bConfirm = await this.confirmDeletion(taskIds, 'The tasks were removed from the file');
    if (!bConfirm) {
      new Notice('Tasks will not be deleted. Please rectify the issue before the next sync.', 0);
      return [];
    }

    for (const taskId of taskIds) {
      try {
        let response;
        let projectId = await this.plugin.cacheOperation?.getProjectIdForTask(taskId);
        if (projectId) {
          response = await this.plugin.tickTickRestAPI?.deleteTask(taskId, projectId);
        }
        if (response) {
          //console.log(`Task ${taskId} deleted successfully`);
          new Notice(`Task ${taskId} is deleted.`);
        }
        //TODO: Verify that we are not over deleting.
        //We may end up with stray tasks, that are not in ticktick. if we're here, just delete them anyway.
        deletedTaskIds.push(taskId); // Add the deleted task ID to the array

      } catch (error) {
        console.error(`Failed to delete task ${taskId}: ${error}`);
        // You can add better error handling methods, such as throwing exceptions or logging here, etc.
      }
    }

    if (!deletedTaskIds.length) {
      if (getSettings().debugMode) {
        console.log('Task not deleted');
      }
      return [];
    }

    await this.plugin.cacheOperation?.deleteTaskFromCacheByIDs(deletedTaskIds); // Update JSON file
    this.plugin.saveSettings();
    //console.log(`A total of ${deletedTaskIds.length} tasks were deleted`);


    return deletedTaskIds;
  }

  // Synchronize completed task status to Obsidian file
  async syncCompletedTaskStatusToObsidian(unSynchronizedEvents) {
    // Get unsynchronized events
    //console.log(unSynchronizedEvents)
    try {

      // Handle unsynchronized events and wait for all processing to complete
      const processedEvents = [];
      for (const e of unSynchronizedEvents) { //If you want to modify the code so that completeTaskInTheFile(e.object_id) is executed in order, you can change the Promise.allSettled() method to use a for...of loop to handle unsynchronized events . Specific steps are as follows:
        //console.log(`Completing ${e.object_id}`)
        await this.plugin.fileOperation.completeTaskInTheFile(e.object_id);
        await this.plugin.cacheOperation?.closeTaskToCacheByID(e.object_id);
        new Notice(`Task ${e.object_id} is closed.`);
        processedEvents.push(e);
      }

      // Save events to the local database."
      //const allEvents = [...savedEvents, ...unSynchronizedEvents]
      //TODO: This is just wrong. Probably delete this function or fix this~
      await this.plugin.cacheOperation?.appendTaskToCache(processedEvents);
      this.plugin.saveSettings();


    } catch (error) {
      console.error('Error synchronizing task status:', error);
    }
  }


  //TODO: Determine deletion candidate

  //TODO: Determine deletion candidate
  async syncUncompletedTaskStatusToObsidian(unSynchronizedEvents) {

    //console.log(unSynchronizedEvents)

    try {

      // Handle unsynchronized events and wait for all processing to complete
      const processedEvents = [];
      for (const e of unSynchronizedEvents) { //If you want to modify the code so that uncompleteTaskInTheFile(e.object_id) is executed in order, you can change the Promise.allSettled() method to use a for...of loop to handle unsynchronized events . Specific steps are as follows:
        //console.log(`uncheck task: ${e.object_id}`)
        await this.plugin.fileOperation.uncompleteTaskInTheFile(e.object_id);
        await this.plugin.cacheOperation?.reopenTaskToCacheByID(e.object_id);
        new Notice(`Task ${e.object_id} is reopened.`);
        processedEvents.push(e);
      }


      // Merge new events into existing events and save to JSON
      //const allEvents = [...savedEvents, ...unSynchronizedEvents]
      //TODO: This is just wrong. Probably delete this function or fix this!
      await this.plugin.cacheOperation?.appendTaskToCache(processedEvents);
      await this.plugin.saveSettings();
    } catch (error) {
      console.error('Error synchronizing task status:', error);
    }
  }


  // Synchronize completed task status to Obsidian file

  /*
   * Synchronizes the tasks between TickTick and Obsidian.
   * //TODO: split this function into smaller functions
   * return:
   *  true if the function is in the process of modifying files
   *  false otherwise
   */
  async syncTickTickToObsidian(): Promise<boolean> {
    //Tasks in Obsidian, not in TickTick: upload
    //Tasks in TickTick, not in Obsidian: Download
    //Tasks in both: check for updates.
    try {
      const res = await this.plugin.saveProjectsToCache();
      if (!res) {
        console.error('probable network connection error.');
        return false;
      }

      let bModifiedFileSystem = false;
      const allResources = await this.plugin.tickTickRestAPI?.getAllResources();
      if (!allResources) {
        console.error('probable network connection error.');
        return false;
      }

      if (allResources.projectGroups) {
        updateProjectGroups(allResources.projectGroups);
      }

      const allTaskDetails = allResources['syncTaskBean'];//await this.plugin.tickTickRestAPI?.getAllTasks();
      // console.log("All task details have been saved.", allTaskDetails);
      let tasksFromTickTic = allTaskDetails.update;
      let deletedTasks = allTaskDetails.delete;
      // this.dumpArray("tick Tick ", tasksFromTickTic)
      // this.dumpArray("deleted  ", deletedTasks)

      //TODO: Filtering deleted tasks would take an act of congress. Just warn the user in Readme.

      let syncTag: string = getSettings().SyncTag;
      if (syncTag) {
        //TODO: In the fullness of time we need to look at Tag Labels not Tag Names.
        //because TickTick only stores lowercase tags.;
        syncTag.toLowerCase();
        if (syncTag.includes('/')) {
          syncTag = syncTag.replace(/\//g, '-');
        }
      }
      //Both Tag and Project limiting present
      if (syncTag && getSettings().SyncProject) {

        //Check for AND/OR presences to determine processing.
        const AndOrIndicator = getSettings().tagAndOr;

        // AND selected. They want only tasks with the tag in the project.
        if (AndOrIndicator == 1) {
          let tasksWithTag;
          tasksWithTag = tasksFromTickTic.filter(task => {
            tasksWithTag = task.tags?.includes(syncTag); //because TickTick only stores lowercase tags.
            return tasksWithTag;
          });
          if (tasksWithTag) {
            tasksFromTickTic = tasksWithTag.filter(task => {
              return task.projectId === getSettings().SyncProject;
            });
          }
        } else {
          //OR they want tasks with either the tag or the project
          let tasksWithTag = tasksFromTickTic.filter(task => {
            return task.tags?.includes(syncTag);
          });
          let tasksInProject = tasksFromTickTic.filter(task => {
            return task.projectId === getSettings().SyncProject;
          });

          tasksFromTickTic = [...tasksWithTag, ...tasksInProject].reduce((acc, current) => {
            const existing = acc.find(item => item.id === current.id);
            if (existing) {
              Object.assign(existing, current);
            } else {
              acc.push(current);
            }
            return acc;
          }, []);
        }
      } else {
        //Either tag or project is present
        //Will process whichever one is present.
        if (syncTag || getSettings().SyncProject) {
          tasksFromTickTic = tasksFromTickTic.filter(task => {
            const hasTag = task.tags?.includes(syncTag);
            const hasProjectId = task.projectId === getSettings().SyncProject;
            return hasTag || hasProjectId;
          });
        }
      }

      // this.dumpArray('== remote:', tasksFromTickTic);
      let tasksInCache = await this.plugin.cacheOperation?.loadTasksFromCache();
      // this.dumpArray("cache", tasksInCache)

      if (getSettings().debugMode) {
        if (tasksFromTickTic) {
          console.log('We have: ', tasksFromTickTic.length, ' tasks on ' + this.plugin.tickTickRestAPI?.api?.apiUrl);
          const closedTasks = tasksFromTickTic.filter(task => task.status != 0);
          const openTasks = tasksFromTickTic.filter(task => task.status === 0);
          console.log('openTasks', openTasks.length, 'closedTasks', closedTasks.length);
        } else {
          console.log('No tasks found.');
        }
        if (tasksInCache) {
          console.log('There are: ', tasksInCache.length, ' tasks in Cache.');
        } else {
          console.log('There are no tasks in cache.');
        }

      }

      tasksFromTickTic = tasksFromTickTic.sort((a, b) => (a.id > b.id) ? 1 : ((b.id > a.id) ? -1 : 0));
      // console.log("num remote tasks: ", tasksFromTickTic.length)

      // this.dumpArray('== local:', tasksInCache);

      if (tasksInCache) {
        tasksInCache = tasksInCache.sort((a, b) => (a.id > b.id) ? 1 : ((b.id > a.id) ? -1 : 0));
        // console.log("local tasks: ", tasksInCache.length);
      } else {
        tasksInCache = [];
      }
      if (tasksFromTickTic) {
        tasksFromTickTic = tasksFromTickTic.sort((a, b) => (a.id > b.id) ? 1 : ((b.id > a.id) ? -1 : 0));
        // console.log("local tasks: ", tasksInCache.length);
      } else {
        tasksFromTickTic = [];
      }
      // Check for new tasks in TickTick

      const newTickTickTasks = tasksFromTickTic.filter(task => !tasksInCache.some(t => t.id === task.id));
      // this.dumpArray('== Add to Obsidian:', newTickTickTasks);
      //download remote only tasks to Obsidian
      if (newTickTickTasks.length > 0) {
        //New Tasks, create their dateStruct
        newTickTickTasks.forEach((newTickTickTask: ITask) => {
          this.plugin.dateMan?.addDateHolderToTask(newTickTickTask);
        });
        let result = await this.plugin.fileOperation?.addTasksToFile(newTickTickTasks);
        if (result) {
          // Sleep for 1 seconds
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        bModifiedFileSystem = true;
      }


      // Check for deleted tasks in TickTick
      const deletedTickTickTasks = tasksInCache.filter(task => !tasksFromTickTic.some(t => t.id === task.id));
      // this.dumpArray('deletedTickTickTasks Deleted tasks in TickTick:', deletedTickTickTasks);

      const reallyDeletedTickTickTasks = deletedTickTickTasks.filter(task => deletedTasks.some(t => t.taskId === task.id));
      // this.dumpArray('== reallyDeletedTickTickTasks deleted from TickTick:', reallyDeletedTickTickTasks);


      if (reallyDeletedTickTickTasks.length > 0) {
        const taskTitlesForConfirmation = reallyDeletedTickTickTasks.map((task: ITask) => task.id);

        const bConfirm = await this.confirmDeletion(taskTitlesForConfirmation, 'tasks deleted from TickTick');

        if (bConfirm) {
          for (const task of reallyDeletedTickTickTasks) {
            try {
              await this.plugin.fileOperation?.deleteTaskFromFile(task);
            } catch (error) {
              console.log('Tasks with no associated file found.');
            }
            await this.plugin.cacheOperation?.deleteTaskFromCache(task.id);
            bModifiedFileSystem = true;
          }

        }
      }


      // Check for new tasks in Obsidian
      const newObsidianTasks = tasksInCache.filter(task => !tasksFromTickTic.some(t => t.id === task.id));
      const reallyNewObsidianTasks = newObsidianTasks.filter(task => reallyDeletedTickTickTasks.some(t => t.taskId === task.id));
      //this.dumpArray('== Add to TickTick:', reallyNewObsidianTasks);
      //upload local only tasks to TickTick

      for (const task of reallyNewObsidianTasks) {
        await this.plugin.tickTickRestAPI?.AddTask(task);
        bModifiedFileSystem = true;
      }


      // Check for updated tasks in TickTick
      const tasksUpdatedInTickTick = tasksFromTickTic.filter(task => {
        const modifiedTask = tasksInCache.find(t => t.id === task.id);
        return modifiedTask && (new Date(modifiedTask.modifiedTime) < new Date(task.modifiedTime));
      });
      // this.dumpArray('Tasks Updated in TickTick:', tasksUpdatedInTickTick);


      // Check for updated tasks in Obsidian
      const tasksUpdatedInObsidian = tasksInCache.filter(task => {
        const modifiedTask = tasksFromTickTic.find(t => t.id === task.id);
        return modifiedTask && (new Date(modifiedTask.modifiedTime) > new Date(task.modifiedTime));
      });
      // this.dumpArray('Tasks updated in Obsidian:', tasksUpdatedInObsidian);

      //   // Check for updated tasks in Obsidian
      //   const updatedObsidianTasks = tasksInCache.filter(task => {
      //     const tickTickTask = tasksFromTickTic.find(t => t.id === task.id);
      //     return tickTickTask && ((tickTickTask.title !== task.title) || (tickTickTask.modifiedTime !== task.modifiedTime));
      // });
      // //this.dumpArray('updatedObsidianTasks:', updatedObsidianTasks);

      //If they are updated in ticktick more recently, update from ticktick to obsidian

      const recentUpdates = tasksUpdatedInTickTick.filter(tickTask => {
        const obsTask = tasksUpdatedInObsidian.find(obsTask => obsTask.id === tickTask.id);
        if (obsTask && (obsTask.modifiedTime === undefined)) {
          //No mod time on obs side: ticktick got modified.
          return true;
        } else {
          return obsTask && new Date(tickTask.modifiedTime) > new Date(obsTask.modifiedTime);
        }
      });


      //Need to have updates in parentage order else everything goes Tango Uniform
      recentUpdates.sort((left, right) => {
        if (!left.parentId && right.parentId) {
          return -1;
        } else if (left.parentId && !right.parentId) {
          return 1;
        } else {
          return 0;
        }
      });


      // this.dumpArray('== Update in  Obsidian:', recentUpdates);

      const toBeProcessed = recentUpdates.map(task => task.id);
      for (const task of recentUpdates) {
        await this.plugin.fileOperation?.updateTaskInFile(task, toBeProcessed);
        await this.plugin.cacheOperation?.updateTaskToCache(task);
        bModifiedFileSystem = true;
      }
      if (bModifiedFileSystem) {
        // Sleep for 5 second
        await new Promise(resolve => setTimeout(resolve, 5000));
      }


      await this.plugin.saveSettings();
      //If we just farckled the file system, stop Syncing to avoid race conditions.
      if (getSettings().debugMode) {
        console.log(bModifiedFileSystem ? 'File System Modified.' : 'No synchronization changes.');
      }
      return bModifiedFileSystem;

    } catch (err) {
      console.error('An error occurred while synchronizing:', err);
    }
    return false;
  }

  dumpArray(which: string, arrayIn: ITask[]) {
    console.log(which);
    arrayIn.forEach(item => {
        console.log(' ',
          item);
        // console.log(' ',
        // 	item.id, '--',
        // 	// item.title,
        // 	// item.parentId,
        // 	// item.childIds,
        // 	'modification time: ', item.modifiedTime);
      }
    );

  }

  async backupTickTickAllResources() {
    try {
      // console.log("backing up.")
      // if (this.plugin.tickTickSyncAPI) {
      // console.log("It's defined", this.plugin.tickTickSyncAPI)
      // }
      const bkupData = await this.plugin.tickTickRestAPI?.exportData();

      if (bkupData) {
        const now: Date = new Date();
        const timeString: string = `${now.getFullYear()}${now.getMonth() + 1}${now.getDate()}${now.getHours()}${now.getMinutes()}${now.getSeconds()}`;

        const name = 'ticktick-backup-' + timeString + '.csv';

        await this.app.vault.create(name, bkupData);
        //console.log(`ticktick backup successful`)
        new Notice(`TickTick backup data is saved in the path ${name}`);
      }
    } catch (error) {
      console.error('An error occurred while creating TickTick backup', error);
      new Notice('An error occurred while creating TickTick backup' + error, 0);
    }

  }

  ///End of Test

  //After renaming the file, check all tasks in the file and update all links.
  async updateTaskContent(filepath: string) {
    const metadata = await this.plugin.cacheOperation?.getFileMetadata(filepath);
    if (!metadata || !metadata.TickTickTasks) {
      return;
    }
    const taskURL = this.plugin.taskParser?.getObsidianUrlFromFilepath(filepath);
    try {
      for (const taskDetail of metadata.TickTickTasks) {
        const task = await this.plugin.cacheOperation?.loadTaskFromCacheID(taskDetail.taskId);
        if (task) {


          task.title = task.title + ' ' + taskURL;
          const updatedTask = await this.plugin.tickTickRestAPI?.UpdateTask(task);
          //Cache the title without the URL because that's what we're going to do content compares on.
          updatedTask.title = await this.plugin.taskParser?.stripOBSUrl(updatedTask.title);
          await this.plugin.cacheOperation?.updateTaskToCache(updatedTask);
        } else {
          const error = 'Task: ' + taskDetail + 'from file: ' + filepath + 'not found.';
          throw new Error(error);
        }
      }
    } catch (error) {
      console.error('An error occurred in updateTaskDescription:', error);
    }


  }

  //get the TickTick data into the task line.
  private async updateTaskLine(newTask: ITask, lineTxt: string, editor: Editor | null, cursor: EditorPosition | null, fileContent: string, line: number | null, filePath: string) {
	  let newTaskCopy = { ...newTask };
	  newTaskCopy.items = [];
	  // console.log("TRACETHIS: dateStruct in: ", newTask.dateHolder);
	  const numTabs = this.plugin.taskParser.getTabIndentation(lineTxt);
	  let text = await this.plugin.taskParser?.convertTaskToLine(newTaskCopy, numTabs, 'OBSUpdating');

	  text = "\t".repeat(numTabs) + text;

	  if (editor && cursor) {
		  const from = { line: cursor.line, ch: 0 };
		  const to = { line: cursor.line, ch: lineTxt.length };
		  editor?.replaceRange(text, from, to);
		  return text;
	  } else {
		  try {
			  // save file
			  const lines = fileContent.split('\n');
			  lines[line] = text;
			  const file = this.app.vault.getAbstractFileByPath(filePath);
			  const newContent = lines.join('\n');
			  await this.app.vault.modify(file, newContent);
			  // console.error("Modified: ", file?.path, new Date().toISOString());
			  return newContent;
		  } catch (error) {
			  console.error(error);
			  return text;
		  }
	  }
  }

  private async confirmDeletion(taskIds: string[], reason: string) {
    const tasksTitles = await this.plugin.cacheOperation?.getTaskTitles(taskIds);


    const myModal = new TaskDeletionModal(this.app, tasksTitles, reason, (result) => {
      this.ret = result;
    });
    const bConfirmation = await myModal.showModal();

    return bConfirmation;
  }

  //Really only dealing with task items. Was going to deal with Notes too, but that was going to get Kludgy quick.
  //Leaving it as a catchall function in case I change my mind.
  private async handleTaskContent(lineText: string, filepath: string | undefined, lineNumber: number | undefined) {
    if (lineText.trim().length == 0) {
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(filepath);
    const fileMap = await this.plugin.service.buildFileMap(file);
	const taskData = fileMap?.fileMapRecords
    const currentObject = this.findTaskOrItemByLineNumber(taskData, lineNumber);

    if (!currentObject) {
      //a text line of no interest.
      return;
    }

    const currentObjectID = currentObject?.ID;
    //when FullVaultSync == true, task items get converted to subtasks....
    if (currentObject.type == 'Item' && !getSettings().enableFullVaultSync) {
      //task Item.
      await this.handleTaskItem(lineText, currentObjectID, currentObject.parentId, filepath, lineNumber);
    }
  }

  private async handleTaskItem(newText: string, itemId: string, parentID: string, filepath: string, lineNumber: number): Promise<boolean> {
    let modified = false;
    let added = false;
    //it's a task. Is it a task item?
    //is it a task at all?
    if (!this.plugin.taskParser?.isMarkdownTask(newText)) {
      //Nah Brah. Bail.
      return false;
    }

    const newItem = this.plugin.taskParser?.taskFromLine(newText);

    const parentTask = this.plugin.cacheOperation?.loadTaskFromCacheID(parentID);
    if (parentTask && parentTask.items) { //we have some items.
      if (itemId) {
        const oldItem = parentTask.items.find((item) => item.id === itemId);
        if (oldItem && oldItem.title != newItem?.description) {
          oldItem.title = newItem?.description;
          oldItem.status = newItem?.status ? 2 : 0;
          modified = true;
        } else {
          //TODO: not handled: New Item is not in the Parent's task item list.
        }
      } else {
        const Oid = ObjectID();
        const OidHexString = Oid.toHexString();
        parentTask.items.push({
          id: OidHexString,
          title: newItem?.description,
          status: newItem?.status ? 2 : 0
        });
        const updatedItemContent = `${newText} %%${OidHexString}%%`;
        //Update the line in the file.
        try {
          const markDownView = this.app.workspace.getActiveViewOfType(MarkdownView);
          const editor = markDownView?.app.workspace.activeEditor?.editor;
          const from = { line: lineNumber, ch: 0 };
          const to = { line: lineNumber, ch: updatedItemContent.length };
          editor?.setLine(lineNumber, updatedItemContent);
        } catch (error) {
          console.error(`Error updating item: ${error}`);
        }
        added = true;
      }

    } else {
      if (getSettings().debugMode) {
        console.log(`parent didn't have items.`);
      }
    }

    if (modified || added) {
      //do the update mambo. cache and api.
      if (parentTask) {
        modified = await this.updateTask(parentTask, filepath);
      }
    }

    return modified;
  }

  private async noteModifiedCheck(currentNoteLines: string[], taskID: number, filepath: string) {
    //TODO: deal with note format cruft
    currentNoteLines.splice(0, 2) //get rid of the task and the callout header
    console.log("Before: " + currentNoteLines);
    for (let i = 0; i < currentNoteLines.length; i++) {
      currentNoteLines[i] = currentNoteLines[i].replace("  >", "")
    }


    console.log("After: " + currentNoteLines);

    let bModified = false;
    const parentTask = this.plugin.cacheOperation?.loadTaskFromCacheID(taskID);
    if (parentTask) {
      if (parentTask.content) { //There's an existing note on the parent. Has it changed?
        let oldNote = parentTask.content.split(/\r?\n/);
        if (this.compareNotes(currentNoteLines, oldNote)) {
          bModified = true;
        }
      } else { //they just added a note.
        bModified = true;
      }

      if (bModified) {
        //At some point may add some metadata and stuff....
        const newContent = currentNoteLines.join('\n');
        parentTask.content = newContent;
        bModified = await this.updateTask(parentTask, filepath);
      }
    }
  }

  private async updateTask(parentTask: ITask, filepath: string) {
    parentTask.modifiedTime = this.plugin.dateMan?.formatDateToISO(new Date());
    await this.plugin.cacheOperation?.updateTaskToCache(parentTask);
    let taskURL = this.plugin.taskParser?.getObsidianUrlFromFilepath(filepath);
    if (taskURL) {
      parentTask.title = parentTask.title + ' ' + taskURL;
    }
    const result = await this.plugin.tickTickRestAPI?.UpdateTask(parentTask);
    const updateFailed = !result;
    new Notice(`Task ${parentTask.title} modified.`);
    return !updateFailed;
  }

  private findTaskOrItemByLineNumber(tasks, lineNumber) {
    for (let task of tasks) {
      if (lineNumber >= task.startLine && lineNumber <= task.endLine) {
        return task;
      }
    }
    return null; // Return null if no task or item is found for the given line number
  }

  private compareNotes(newNote: string[], oldNote: string[]) {
    // Check if arrays have different lengths
    if (newNote.length !== oldNote.length) {
      return true;  // Arrays are different
    }

    // Check if elements are different
    for (let i = 0; i < newNote.length; i++) {
      if (newNote[i] !== oldNote[i]) {
        return true;  // Arrays are different
      }
    }

    return false;  // Arrays are exactly the same
  }


}
