import { UploadedFile } from '../types';

// API Configuration
// If VITE_API_URL is set, use it. Otherwise relative paths (via proxy)
const ENV_API_URL = (import.meta as any).env?.VITE_API_URL;
const BASE_API_URL = ENV_API_URL || ''; 

class DatabaseService {
  
  constructor() {}

  getConnectionStatus(): 'cloud' | 'local' {
    return 'cloud';
  }

  // Fetch all file metadata
  async getAllFiles(): Promise<UploadedFile[]> {
    try {
      const response = await fetch(`${BASE_API_URL}/files`);
      if (!response.ok) throw new Error("Failed to fetch files");
      return await response.json();
    } catch (error) {
      console.error("API Error - Fetch Files:", error);
      // Return empty array to prevent UI crash, but log error
      return [];
    }
  }

  // Upload file to server
  async uploadFile(file: File, metadata: any): Promise<UploadedFile> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('metadata', JSON.stringify(metadata));

    const response = await fetch(`${BASE_API_URL}/api/upload`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) throw new Error("Upload failed");
    const result = await response.json();
    return result.file;
  }

  // Delete file
  async deleteFile(id: string): Promise<void> {
    await fetch(`${BASE_API_URL}/files/${id}`, { method: 'DELETE' });
  }

  // Deprecated methods kept for interface safety if needed
  async addFile(file: UploadedFile): Promise<void> {}
}

export const db = new DatabaseService();
