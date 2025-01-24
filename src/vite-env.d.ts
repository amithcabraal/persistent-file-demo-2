/// <reference types="vite/client" />

interface FileSystemFileHandle extends FileSystemHandle {
  getFile(): Promise<File>;
  requestPermission(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
  values(): AsyncIterableIterator<FileSystemHandle>;
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
}

interface FileSystemHandle {
  kind: 'file' | 'directory';
  name: string;
}

interface Window {
  showOpenFilePicker(options?: {
    multiple?: boolean;
    types?: Array<{
      description: string;
      accept: Record<string, string[]>;
    }>;
  }): Promise<FileSystemFileHandle[]>;
  
  showDirectoryPicker(): Promise<FileSystemDirectoryHandle>;
}