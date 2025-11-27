// CLIENT-SIDE PARSING REMOVED
// All processing is now done at: POST /api/upload
// This file is kept to avoid breaking import references during migration but should be cleaned up.

import { FileType } from '../types';

export const detectFileType = (fileName: string): FileType => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'csv': return FileType.CSV;
    case 'xlsx':
    case 'xls': return FileType.XLSX;
    case 'docx': return FileType.DOCX;
    case 'pdf': return FileType.PDF;
    case 'txt': return FileType.TXT;
    case 'json': return FileType.JSON;
    default: return FileType.UNKNOWN;
  }
};

export const readFileContent = async (file: File): Promise<string> => {
   throw new Error("Client side parsing is disabled. Use the server upload.");
};