import React, { useEffect, useState } from 'react';
import { FileText, FolderOpen, RefreshCw, FolderIcon, Clock, XCircle } from 'lucide-react';

interface FileInfo {
  name: string;
  handle: FileSystemFileHandle;
  lastModified: Date;
  size: number;
}

interface SavedState {
  directoryHandle: FileSystemDirectoryHandle;
  selectedFile?: {
    name: string;
    handle: FileSystemFileHandle;
  };
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function App() {
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [db, setDb] = useState<IDBDatabase | null>(null);
  const [isApiSupported, setIsApiSupported] = useState(true);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [savedState, setSavedState] = useState<SavedState | null>(null);
  const [showResumePrompt, setShowResumePrompt] = useState(false);

  // Check API support
  useEffect(() => {
    if (!('showDirectoryPicker' in window)) {
      setIsApiSupported(false);
      setFileContent('Your browser does not support the File System Access API. Please use a modern browser like Chrome.');
    }
  }, []);

  // Initialize IndexedDB
  useEffect(() => {
    const DB_NAME = 'file-access-demo';
    const STORE_NAME = 'saved-state';

    const initDB = (): Promise<IDBDatabase> => {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 2);
        
        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    };

    initDB()
      .then((database) => {
        setDb(database);
      })
      .catch((error) => {
        console.error('Failed to initialize IndexedDB:', error);
      });
  }, []);

  // Check for saved state on initial load
  useEffect(() => {
    if (db) {
      checkSavedState();
    }
  }, [db]);

  const checkSavedState = async () => {
    if (!db) return;

    try {
      const transaction = db.transaction('saved-state', 'readonly');
      const store = transaction.objectStore('saved-state');
      const state = await new Promise<SavedState | null>((resolve, reject) => {
        const request = store.get('lastSession');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      if (state?.directoryHandle) {
        setSavedState(state);
        setShowResumePrompt(true);
      }
    } catch (error) {
      console.error('Error checking saved state:', error);
    }
  };

  const saveState = async (state: SavedState) => {
    if (!db) return;

    try {
      const transaction = db.transaction('saved-state', 'readwrite');
      const store = transaction.objectStore('saved-state');
      await store.put(state, 'lastSession');
    } catch (error) {
      console.error('Error saving state:', error);
    }
  };

  const clearSavedState = async () => {
    if (!db) return;

    try {
      const transaction = db.transaction('saved-state', 'readwrite');
      const store = transaction.objectStore('saved-state');
      await store.delete('lastSession');
    } catch (error) {
      console.error('Error clearing saved state:', error);
    }
  };

  const loadDirectory = async (directoryHandle: FileSystemDirectoryHandle) => {
    const fileList: FileInfo[] = [];
    
    try {
      for await (const [name, handle] of directoryHandle.entries()) {
        if (handle.kind === 'file') {
          const file = await (handle as FileSystemFileHandle).getFile();
          fileList.push({
            name,
            handle: handle as FileSystemFileHandle,
            lastModified: new Date(file.lastModified),
            size: file.size
          });
        }
      }
      
      setFiles(fileList.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime()));
    } catch (error) {
      console.error('Error loading directory:', error);
    }
  };

  const selectDirectory = async () => {
    if (!isApiSupported) return;

    try {
      const directoryHandle = await window.showDirectoryPicker();
      await loadDirectory(directoryHandle);
      
      const newState: SavedState = { directoryHandle };
      setSavedState(newState);
      await saveState(newState);
      setShowResumePrompt(false);
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Error selecting directory:', error);
      }
    }
  };

  const selectFile = async (fileInfo: FileInfo) => {
    if (fileInfo.size === 0) {
      setFileContent('This file is empty and cannot be viewed.');
      return;
    }

    try {
      const permissionResult = await fileInfo.handle.requestPermission({ mode: 'read' });
      if (permissionResult === 'granted') {
        const file = await fileInfo.handle.getFile();
        const content = await file.text();
        setFileContent(content);
        
        if (savedState) {
          const newState: SavedState = {
            ...savedState,
            selectedFile: {
              name: fileInfo.name,
              handle: fileInfo.handle
            }
          };
          setSavedState(newState);
          await saveState(newState);
        }
      }
    } catch (error) {
      console.error('Error reading file:', error);
    }
  };

  const resumeLastSession = async () => {
    if (!savedState?.directoryHandle) return;

    try {
      // First, verify we still have permission to the directory
      await savedState.directoryHandle.requestPermission({ mode: 'read' });
      
      // Load the directory contents
      await loadDirectory(savedState.directoryHandle);
      
      // If there was a selected file, try to load it
      if (savedState.selectedFile) {
        const file = await savedState.selectedFile.handle.getFile();
        const fileInfo = {
          name: savedState.selectedFile.name,
          handle: savedState.selectedFile.handle,
          lastModified: new Date(file.lastModified),
          size: file.size
        };
        await selectFile(fileInfo);
      }
      
      setShowResumePrompt(false);
    } catch (error) {
      console.error('Error resuming session:', error);
      setShowResumePrompt(false);
      await clearSavedState();
      setFiles([]);
      setFileContent(null);
    }
  };

  const startNewSession = async () => {
    setShowResumePrompt(false);
    await clearSavedState();
    setFiles([]);
    setFileContent(null);
    setSavedState(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Directory File Viewer
        </h1>

        {showResumePrompt ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Pick up where you left off?</h2>
            <div className="space-x-4">
              <button
                onClick={resumeLastSession}
                className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Yes, resume
              </button>
              <button
                onClick={startNewSession}
                className="inline-flex items-center px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
              >
                <XCircle className="w-4 h-4 mr-2" />
                No, start fresh
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-6">
            {/* File List Panel */}
            <div className="w-1/2 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-semibold text-gray-900">Directory Contents</h2>
                <button
                  onClick={selectDirectory}
                  disabled={!isApiSupported}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FolderOpen className="w-5 h-5 mr-2" />
                  Select Directory
                </button>
              </div>

              {files.length > 0 ? (
                <div className="divide-y divide-gray-200">
                  {files.map((file) => (
                    <button
                      key={file.name}
                      onClick={() => selectFile(file)}
                      disabled={file.size === 0}
                      className={`w-full text-left py-4 px-2 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-md transition-colors ${
                        file.size === 0 ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center flex-1 min-w-0 mr-4">
                          <FileText className={`w-5 h-5 mr-3 ${file.size === 0 ? 'text-gray-300' : 'text-gray-400'}`} />
                          <div className="truncate">
                            <span className={file.size === 0 ? 'text-gray-400' : 'text-gray-900'}>{file.name}</span>
                            <div className="text-sm text-gray-500">
                              {formatFileSize(file.size)}
                              {file.size === 0 && ' - Empty file'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center text-sm text-gray-500 shrink-0">
                          <Clock className="w-4 h-4 mr-1" />
                          {file.lastModified.toLocaleDateString()} {file.lastModified.toLocaleTimeString()}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <FolderIcon className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <p>Select a directory to view its contents</p>
                </div>
              )}
            </div>

            {/* File Content Panel */}
            <div className="w-1/2 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">File Contents</h2>
              {fileContent ? (
                <pre className="text-sm text-gray-800 whitespace-pre-wrap bg-gray-50 p-4 rounded-md overflow-auto max-h-[calc(100vh-16rem)]">
                  {fileContent}
                </pre>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <FileText className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <p>Select a file to view its contents</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;