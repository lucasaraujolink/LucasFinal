import { UploadedFile } from '../types';

// API Configuration
const ENV_API_URL = (import.meta as any).env?.VITE_API_URL;
const BASE_API_URL = ENV_API_URL || ''; 

class DatabaseService {
  
  constructor() {}

  getConnectionStatus(): 'cloud' | 'local' {
    return 'cloud'; // Always server-based now
  }

  // Fetch all file metadata
  async getAllFiles(): Promise<UploadedFile[]> {
    try {
      const response = await fetch(`${BASE_API_URL}/files`);
      if (!response.ok) throw new Error("Failed to fetch files");
      return await response.json();
    } catch (error) {
      console.error("API Error:", error);
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

  // Maintain interface compatibility (though deprecated logic removed)
  async addFile(file: UploadedFile): Promise<void> {
    // This is handled by uploadFile now
  }

  async deleteFile(id: string): Promise<void> {
    await fetch(`${BASE_API_URL}/files/${id}`, { method: 'DELETE' });
  }
}

export const db = new DatabaseService();