/* The app-wide rows of folder save, apart from folder.ts so the project screen can check them cheaply. */

/** The row that holds the folder handle. IndexedDB can store a handle as it is. */
export const FOLDER_KEY = 'backupFolder';

/** The row that holds the result of the last folder save. */
export const FOLDER_STATUS_KEY = 'backupFolderStatus';
