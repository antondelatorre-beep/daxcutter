const express = require('express');
const multer = require('multer');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const crypto = require('crypto');

const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(path.join(__dirname, "public")));
const PORT = process.env.PORT || 10000;
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 100 * 1024 * 1024, files: 1 }
});

app.use(express.static(path.join(__dirname, 'public')));

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() :
      reject(new Error(stderr.slice(-1800) || `${command} exited ${code}`)));
  });
}

function clean(file) {
  if (file) fs.promises.unlink(file).catch(() => {});
}

app.post('/api/convert', upload.single('audio'), async (req, res) => {
  const input = req.file?.path;
  let output;
  try {
    if (!input) return res.status(400).json({ error: 'Choose an audio file first.' });

    const start = Number(req.body.start);
    const end = Number(req.body.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
      return res.status(400).json({ error: 'Enter a valid start and end time.' });
    }

    const probe = await new Promise((resolve, reject) => {
      const child = spawn('ffprobe', [
        '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', input
      ]);
      let out = '';
      child.stdout.on('data', d => out += d.toString());
      child.on('error', reject);
      child.on('close', code => code === 0 ? resolve(Number(out.trim())) :
        reject(new Error('Could not read this audio file.')));
    });

    if (!Number.isFinite(probe) || end > probe + 0.05) {
      return res.status(400).json({ error: `End time must be within the audio duration (${probe.toFixed(2)} seconds).` });
    }
    if (end - start > 7200) {
      return res.status(400).json({ error: 'Please select a section no longer than 2 hours.' });
    }

    output = path.join(os.tmpdir(), `audio-${crypto.randomUUID()}.mp3`);
    await run('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-ss', String(start), '-i', input, '-t', String(end - start),
      '-vn', '-codec:a', 'libmp3lame', '-q:a', '2',
      '-map_metadata', '-1', output
    ]);

    const base = path.basename(req.file.originalname, path.extname(req.file.originalname))
      .replace(/[^a-z0-9_-]/gi, '_').slice(0, 60) || 'audio';
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${base}_cut.mp3"`);
    const stream = fs.createReadStream(output);
    stream.on('error', () => { if (!res.headersSent) res.status(500).end('Could not read converted audio.'); });
    stream.on('close', () => { clean(input); clean(output); });
    stream.pipe(res);
  } catch (err) {
    console.error(err);
    clean(input); clean(output);
    if (!res.headersSent) res.status(500).json({ error: 'Conversion failed. Try a different audio file.' });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Maximum file size is 100 MB.' : 'Upload limit reached.' });
  console.error(err);
  res.status(500).json({ error: 'Unexpected server error.' });
});

app.listen(PORT, () => console.log(`Audio converter listening on ${PORT}`));
