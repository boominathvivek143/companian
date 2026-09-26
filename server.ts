import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import path from 'path';
import express from 'express';
import { GoogleGenAI } from '@google/genai';

// Serves the sender web page. Text and images go straight from the browser to the
// Electron desktop app (ws://<desktop-address>:8765); this server is not in that path.
// It also hosts the Gemini screenshot analysis (the API key never reaches the browser)
// and the desktop installer download.
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
// .env.example ships a placeholder; treat it as "not configured"
const geminiEnabled = !!GEMINI_API_KEY && GEMINI_API_KEY !== 'MY_GEMINI_API_KEY';
const ai = geminiEnabled ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

// Desktop app downloads: the zipped app in release/ or an installer .exe in dist-electron/
const DOWNLOAD_SOURCES = [
  { dir: path.resolve('release'), ext: '.zip' },
  { dir: path.resolve('dist-electron'), ext: '.exe' },
];

// Newest downloadable desktop build, if any
function findInstaller(): string | null {
  const files: string[] = [];
  for (const { dir, ext } of DOWNLOAD_SOURCES) {
    try {
      for (const name of fs.readdirSync(dir)) {
        if (name.toLowerCase().endsWith(ext)) files.push(path.join(dir, name));
      }
    } catch {
      // Folder not built yet
    }
  }
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] || null;
}

const ANALYZE_PROMPT = `You are looking at a screenshot.
1. Under the heading "Question", state the question or task in the screenshot in your own words (short; do not copy long passages verbatim).
2. Under the heading "Answer", answer the question(s) or task shown in the screenshot, clearly and concisely. For multiple choice, name the correct option and briefly say why. For code, give the corrected or completed code. If there is no question, summarise what the screenshot shows.
Reply in plain text: the page shows your reply as-is, so do not use Markdown symbols such as #, ** or backticks.`;

const TEXT_PROMPT = `The text above was copied by the user. Answer the question or complete the task it contains, clearly and concisely. For multiple choice, name the correct option and briefly say why. For code, give the corrected or completed code. If it is not a question, explain it briefly.
Reply in plain text without Markdown symbols such as #, ** or backticks.`;

const ANSWER_ONLY_PROMPT = `Solve the question or task shown above. Give only your own answer and explanation in plain text; do not quote the problem statement. For coding problems, explain the approach briefly and give the solution code.`;

function setupApi() {
  app.get('/api/config', (_req, res) => {
    res.json({ geminiEnabled, desktopDownload: !!findInstaller() });
  });

  app.get('/download/desktop', (_req, res) => {
    const installer = findInstaller();
    if (!installer) {
      res.status(404).send('No desktop installer has been built yet. Run `npm run package:win` on the server.');
      return;
    }
    res.download(installer, path.basename(installer));
  });

  // Screenshots are ~1-2 MB of base64; allow some headroom
  app.post('/api/analyze', express.json({ limit: '15mb' }), async (req, res) => {
    if (!ai) {
      res.status(503).json({ error: 'Gemini is not configured. Set GEMINI_API_KEY in .env and restart the server.' });
      return;
    }
    // Either a screenshot (image) or copied text (text) is analyzed
    const image = typeof req.body?.image === 'string' ? req.body.image : '';
    const copied = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 20000) : '';
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image);
    if (!match && !copied) {
      res.status(400).json({ error: 'Expected a PNG, JPEG or WebP image, or some text.' });
      return;
    }
    const question = typeof req.body?.question === 'string' ? req.body.question.trim().slice(0, 2000) : '';

    const ask = (prompt: string) =>
      ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              match
                ? { inlineData: { mimeType: match[1], data: match[2] } }
                : { text: `Copied text:\n"""\n${copied}\n"""` },
              { text: question ? `${prompt}\n\nThe user also asks: ${question}` : prompt },
            ],
          },
        ],
      });

    try {
      let response = await ask(match ? ANALYZE_PROMPT : TEXT_PROMPT);
      // Empty replies usually mean Gemini stopped to avoid reciting published text
      // (e.g. a LeetCode problem); retry asking only for the answer
      if (!response.text) response = await ask(ANSWER_ONLY_PROMPT);
      const text = response.text;
      if (!text) {
        // Say why: blocked prompt, safety stop, token limit, ...
        const candidate = response.candidates?.[0];
        const reason =
          response.promptFeedback?.blockReason || candidate?.finishReason || 'no candidates returned';
        console.warn('Gemini returned no text:', JSON.stringify({ reason, candidate, usage: response.usageMetadata }));
        res.status(502).json({ error: `Gemini returned no text (reason: ${reason}). Try again or send a smaller area.` });
        return;
      }
      res.json({ text });
    } catch (err: any) {
      console.error('Gemini analyze failed:', err);
      // The SDK puts Google's JSON error body in err.message; show just its readable message
      let message = err?.message || 'Gemini request failed.';
      try {
        message = JSON.parse(message)?.error?.message || message;
      } catch {}
      res.status(502).json({ error: `Gemini: ${message}` });
    }
  });
}

// Vite middleware in development vs static files in production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  // API routes go first so the SPA fallback below does not swallow them
  setupApi();

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve('dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Running at http://localhost:${PORT}`);
    console.log(`[Server] Gemini screenshot analysis: ${geminiEnabled ? `on (${GEMINI_MODEL})` : 'off (set GEMINI_API_KEY in .env)'}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
