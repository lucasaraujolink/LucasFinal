import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import bodyParser from 'body-parser';
import multer from 'multer';
import NodeCache from 'node-cache';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from "@google/genai";
import { createRequire } from 'module';

// Initialize require for CommonJS modules in ESM environment
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');

// --- CONFIGURATION ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3001;

// Define Data Directory - Prioritize prompt request, fallback to local for dev safety
const SYSTEM_DATA_DIR = '/var/www/goncalinho_data/';
const LOCAL_DATA_DIR = path.join(__dirname, 'data');
let DATA_DIR = LOCAL_DATA_DIR;

// Check if we can write to system dir
try {
    if (fs.existsSync('/var/www/')) {
        if (!fs.existsSync(SYSTEM_DATA_DIR)) {
            try {
                fs.mkdirSync(SYSTEM_DATA_DIR, { recursive: true });
                DATA_DIR = SYSTEM_DATA_DIR;
            } catch (e) {
                console.warn("[Server] Could not create system data dir, falling back to local.", e.message);
            }
        } else {
            // Check write permission
            fs.accessSync(SYSTEM_DATA_DIR, fs.constants.W_OK);
            DATA_DIR = SYSTEM_DATA_DIR;
        }
    }
} catch (e) {
    console.warn("[Server] System data dir not accessible, using local.");
    DATA_DIR = LOCAL_DATA_DIR;
}

const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Initialize Cache (TTL 1 hour)
const appCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

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
                // Convert to CSV for better token efficiency than raw JSON
                const csv = XLSX.utils.sheet_to_csv(sheet);
                fullText += `\n--- Planilha: ${sheetName} ---\n${csv}`;
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
    let metadata = {};
    try {
        metadata = JSON.parse(req.body.metadata || '{}');
    } catch (e) {
        console.warn("Invalid metadata JSON");
    }

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
        
        // Clear Cache on new data so queries use updated context
        appCache.flushAll();

        // Don't send huge content back to client
        const { content, ...fileWithoutContent } = newFile;
        res.json({ success: true, file: fileWithoutContent }); 
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
    const cacheKey = `ask_${message}_${JSON.stringify(history.length)}`;
    const cachedResponse = appCache.get(cacheKey);

    // If cached, return immediately
    if (cachedResponse) {
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
        
        // --- OPTIMIZATION FOR 429 ERRORS ---
        // 1. Simple Keyword Relevance (Very basic RAG)
        // If we have too many files, we filter. If few files, we send all.
        const MAX_CONTEXT_CHARS = 250000; // Safe limit for Gemini Flash Free Tier (~60k tokens)
        
        // Sort files by relevance (keyword match in name/metadata/content)
        const keywords = message.toLowerCase().split(' ').filter(w => w.length > 3);
        
        let sortedFiles = db.files.map(f => {
            let score = 0;
            const fullMeta = `${f.name} ${f.caseName} ${f.category} ${f.description}`.toLowerCase();
            keywords.forEach(k => {
                if (fullMeta.includes(k)) score += 10;
                // Don't search heavy content for score to save CPU, just assume metadata is good enough for sorting
            });
            return { file: f, score };
        }).sort((a, b) => b.score - a.score);

        // 2. Build Context respecting limit
        let currentChars = 0;
        let selectedContext = "";

        for (const item of sortedFiles) {
            const f = item.file;
            // Reduce per-file limit to 30,000 chars to allow more files in the window
            // (Previously was 100,000 which caused the 429 error quickly with multiple files)
            const contentSnippet = f.content ? f.content.slice(0, 30000) : ''; 
            
            const fileBlock = `
--- ARQUIVO: ${f.name} ---
METADADOS: Categoria: ${f.category}, Indicador: ${f.caseName}, Periodo: ${f.period}, Fonte: ${f.source}, Desc: ${f.description}
CONTEUDO:
${contentSnippet} 
--- FIM ARQUIVO ---
`;
            if (currentChars + fileBlock.length < MAX_CONTEXT_CHARS) {
                selectedContext += fileBlock;
                currentChars += fileBlock.length;
            } else {
                break; // Stop adding files if we hit the limit
            }
        }

        const systemInstruction = `Você é o Gonçalinho, um analista de dados especialista em indicadores de São Gonçalo dos Campos.

CONTEXTO GEOGRÁFICO:
- Se o usuário não especificar a cidade, ASSUMA AUTOMATICAMENTE que se refere a "São Gonçalo dos Campos".
- As siglas "SGC" e "Songa" significam "São Gonçalo dos Campos".
- Priorize dados locais desta cidade ao responder, a menos que uma comparação explícita seja solicitada.

DADOS DISPONÍVEIS:
${selectedContext}

DIRETRIZES:
1. Responda com base ESTRITAMENTE nos dados acima.
2. Se a informação não estiver nos arquivos, diga que não encontrou nos dados disponíveis.
3. SEMPRE que a resposta envolver comparação de dados numéricos (ex: entre cidades, anos, categorias) ou apresentar uma série de dados estatísticos, gere AUTOMATICAMENTE um gráfico representativo. Retorne o JSON do gráfico no final da resposta, sem markdown de bloco de código, no formato: 
{"chart": { "type": "bar", "title": "...", "data": [{"label": "A", "value": 10}, ...] }}
4. Use Markdown para formatar tabelas e textos.
5. Seja direto, técnico mas acessível.`;

        const ai = new GoogleGenAI({ apiKey });
        
        const chatHistory = history
            .filter(h => h.role === 'user' || h.role === 'model')
            .map(h => ({
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
                temperature: 0.2,
            }
        });

        let fullText = '';

        for await (const chunk of responseStream) {
            const chunkText = chunk.text;
            if (chunkText) {
                fullText += chunkText;
                res.write(chunkText);
            }
        }

        if (fullText.length > 0) {
            appCache.set(cacheKey, fullText);
        }
        res.end();

    } catch (error) {
        console.error("Gemini Error:", error);
        
        // Handle Rate Limit specifically
        if (error.status === 429 || error.message?.includes("429") || error.message?.includes("quota")) {
            res.write("\n\n⚠️ *O sistema está com alto volume de dados (Limite de Cota Atingido). Por favor, aguarde 30 segundos e tente novamente com uma pergunta mais específica.*");
        } else {
            res.write("\n\n[Sistema] Erro ao processar resposta da IA. Verifique logs do servidor.");
        }
        res.end();
    }
});

// Serve Frontend
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
    // If request is for API that didn't match, return 404
    if (req.path.startsWith('/api')) {
        return res.status(404).json({error: "API endpoint not found"});
    }
    
    // Otherwise serve index.html for React Router
    if (fs.existsSync(path.join(distPath, 'index.html'))) {
        res.sendFile(path.join(distPath, 'index.html'));
    } else {
        res.send("Backend running. Frontend not built. Run 'npm run build' first.");
    }
});

app.listen(PORT, () => {
    console.log(`Gonçalinho Server running on port ${PORT}`);
    console.log(`Data Storage: ${DATA_DIR}`);
});