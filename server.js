import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import bodyParser from 'body-parser';
import multer from 'multer';
import NodeCache from 'node-cache';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from "@google/genai";
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';

// --- CONFIGURATION ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3001;

// Define Data Directory - Prioritize prompt request, fallback to local for dev safety
const SYSTEM_DATA_DIR = '/var/www/goncalinho_data/';
const LOCAL_DATA_DIR = path.join(__dirname, 'data');
let DATA_DIR = LOCAL_DATA_DIR;

try {
    if (fs.existsSync('/var/www/')) {
        if (!fs.existsSync(SYSTEM_DATA_DIR)) {
            try {
                fs.mkdirSync(SYSTEM_DATA_DIR, { recursive: true });
                DATA_DIR = SYSTEM_DATA_DIR;
            } catch (e) {
                console.warn("[Server] Could not create system data dir, falling back to local.");
            }
        } else {
            DATA_DIR = SYSTEM_DATA_DIR;
        }
    }
} catch (e) {
    console.warn("[Server] Checking /var/www failed, using local.");
}

const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Initialize Cache (TTL 1 hour)
const appCache = new NodeCache({ stdTTL: 3600 });

// --- MIDDLEWARE ---
const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// Setup Multer for uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        if (!fs.existsSync(UPLOAD_DIR)) {
            fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        }
        cb(null, UPLOAD_DIR);
    },
    filename: function (req, file, cb) {
        // Sanitize filename and add timestamp
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, `${Date.now()}-${safeName}`);
    }
});
const upload = multer({ storage: storage });

// --- INITIALIZATION ---
const initializeDb = () => {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

        if (!fs.existsSync(DB_FILE)) {
            console.log(`[Server] Criando DB em: ${DB_FILE}`);
            fs.writeFileSync(DB_FILE, JSON.stringify({ files: [] }, null, 2), 'utf8');
        }
    } catch (err) {
        console.error("[Server] Erro fatal init DB:", err);
    }
};
initializeDb();

const readDb = () => {
    try {
        if (!fs.existsSync(DB_FILE)) return { files: [] };
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (err) {
        return { files: [] };
    }
};

const writeDb = (data) => {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
        console.error("[Server] Erro save DB:", err);
    }
};

// --- FILE PROCESSING LOGIC ---
const extractText = async (filePath, mimeType, originalName) => {
    const ext = path.extname(originalName).toLowerCase();
    
    try {
        if (ext === '.csv' || ext === '.txt' || ext === '.json') {
            return fs.readFileSync(filePath, 'utf8');
        } 
        else if (ext === '.xlsx' || ext === '.xls') {
            const workbook = XLSX.readFile(filePath);
            let fullText = `Arquivo Excel: ${originalName}\n`;
            workbook.SheetNames.forEach(sheetName => {
                const sheet = workbook.Sheets[sheetName];
                const csv = XLSX.utils.sheet_to_csv(sheet);
                fullText += `\n--- Sheet: ${sheetName} ---\n${csv}`;
            });
            return fullText;
        } 
        else if (ext === '.docx') {
            const buffer = fs.readFileSync(filePath);
            const result = await mammoth.extractRawText({ buffer });
            return result.value;
        } 
        else if (ext === '.pdf') {
            const buffer = fs.readFileSync(filePath);
            const data = await pdfParse(buffer);
            return data.text;
        }
    } catch (e) {
        console.error(`Error parsing ${originalName}:`, e);
        return `Erro ao ler arquivo: ${e.message}`;
    }
    return "";
};

// --- ROUTES ---

// 1. Upload & Process
app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded.');
    
    // Metadata from body
    const metadata = JSON.parse(req.body.metadata || '{}');

    try {
        const textContent = await extractText(req.file.path, req.file.mimetype, req.file.originalname);
        
        const newFile = {
            id: crypto.randomUUID(),
            name: req.file.originalname,
            path: req.file.path, // Store path to file on disk
            type: path.extname(req.file.originalname).replace('.', ''),
            content: textContent, // Hot text storage
            timestamp: Date.now(),
            category: metadata.category || 'Geral',
            description: metadata.description || '',
            source: metadata.source || '',
            period: metadata.period || '',
            caseName: metadata.caseName || ''
        };

        const db = readDb();
        db.files.push(newFile);
        writeDb(db);
        
        // Clear Cache on new data
        appCache.flushAll();

        res.json({ success: true, file: { ...newFile, content: undefined } }); // Don't send huge content back
    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({ error: "Processing failed" });
    }
});

// 2. List Files (Metadata only)
app.get('/files', (req, res) => {
    const db = readDb();
    // Return files without heavy content content to keep UI light
    const lightweightFiles = db.files.map(f => {
        const { content, ...rest } = f; 
        return rest;
    });
    res.json(lightweightFiles);
});

// 3. Delete
app.delete('/files/:id', (req, res) => {
    const { id } = req.params;
    const db = readDb();
    const fileIndex = db.files.findIndex(f => f.id === id);
    
    if (fileIndex > -1) {
        const file = db.files[fileIndex];
        // Try delete physical file
        if (fs.existsSync(file.path)) {
            try { fs.unlinkSync(file.path); } catch(e) {}
        }
        db.files.splice(fileIndex, 1);
        writeDb(db);
        appCache.flushAll();
    }
    res.json({ success: true });
});

// 4. ASK API (Streaming + Caching)
app.post('/api/ask', async (req, res) => {
    const { message, history } = req.body;
    const apiKey = process.env.API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: "Server API Key missing" });
    }

    // Cache Key
    const cacheKey = `ask_${message}_${history.length}`;
    const cachedResponse = appCache.get(cacheKey);

    if (cachedResponse) {
        // If cached, we simulate a stream or just send JSON. 
        // For simplicity in this app structure, we send JSON and let frontend handle it, 
        // or we stream the cached text.
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.write(cachedResponse);
        res.end();
        return;
    }

    // Set headers for streaming
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    try {
        const db = readDb();
        // Prepare context from ALL files in DB
        const context = db.files.map(f => `
--- ARQUIVO: ${f.name} ---
METADADOS: Categoria: ${f.category}, Indicador: ${f.caseName}, Periodo: ${f.period}, Fonte: ${f.source}, Desc: ${f.description}
CONTEUDO:
${f.content ? f.content.slice(0, 25000) : ''} 
--- FIM ARQUIVO ---
`).join("\n");

        const systemInstruction = `Você é o Gonçalinho, analista de dados de São Gonçalo dos Campos.
DADOS:
${context}

INSTRUÇÕES:
1. Responda com base APENAS nos dados acima.
2. Se o usuário pedir gráfico, retorne APENAS um JSON válido no formato: {"chart": { "type": "bar", "data": [...] }}.
3. Se for texto, use Markdown.
4. Seja direto e objetivo.`;

        const ai = new GoogleGenAI({ apiKey });
        
        // Build History
        const chatHistory = history.map(h => ({
            role: h.role,
            parts: [{ text: h.text }]
        }));

        const responseStream = await ai.models.generateContentStream({
            model: 'gemini-2.5-flash',
            contents: [
                ...chatHistory,
                { role: 'user', parts: [{ text: message }] }
            ],
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.3 // Lower temperature for analytical precision
            }
        });

        let fullText = '';

        for await (const chunk of responseStream) {
            const chunkText = chunk.text();
            fullText += chunkText;
            res.write(chunkText);
        }

        // Save to cache for short term
        appCache.set(cacheKey, fullText);
        res.end();

    } catch (error) {
        console.error("Gemini Error:", error);
        res.write("\n\n[Sistema] Erro ao processar resposta da IA.");
        res.end();
    }
});

// Serve Frontend
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
    if (fs.existsSync(path.join(distPath, 'index.html'))) {
        res.sendFile(path.join(distPath, 'index.html'));
    } else {
        res.send("Backend running. Frontend not built.");
    }
});

app.listen(PORT, () => {
    console.log(`Gonçalinho Server running on port ${PORT}`);
    console.log(`Data Dir: ${DATA_DIR}`);
});