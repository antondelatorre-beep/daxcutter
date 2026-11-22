
const express = require('express');
const multer = require('multer');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 10000;

// Serve index.html and other frontend files directly from the root
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const upload = multer({
  dest: os.tmpdir(),
  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 1
  }
});

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stderr = '';

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    child.on('error', reject);

    child.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr.slice(-1800) || `${command} exited ${code}`));
      }
    });
  });
}

function clean(file) {
  if (file) {
    fs.promises.unlink(file).catch(() => {});
  }
}

app.post('/api/convert', upload.single('audio'), async (req, res) => {
  const input = req.file?.path;
  let output;

  try {
    if (!input) {
      return res.status(400).json({
        error: 'Choose an audio file first.'
      });
    }

    const start = Number(req.body.start);
    const end = Number(req.body.end);

    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end <= start
    ) {
      clean(input);
      return res.status(400).json({
        error: 'Enter a valid start and end time.'
      });
    }

    const duration = await new Promise((resolve, reject) => {
      const child = spawn('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        input
      ]);

      let result = '';

      child.stdout.on('data', data => {
        result += data.toString();
      });

      child.on('error', reject);

      child.on('close', code => {
        if (code === 0) {
          resolve(Number(result.trim()));
        } else {
          reject(new Error('Could not read this audio file.'));
        }
      });
    });

    if (!Number.isFinite(duration) || end > duration + 0.05) {
      clean(input);
      return res.status(400).json({
        error: `End time must be within the audio duration (${Number.isFinite(duration) ? duration.toFixed(2) : 'unknown'} seconds).`
      });
    }

    if (end - start > 7200) {
      clean(input);
      return res.status(400).json({
        error: 'Please select a section no longer than 2 hours.'
      });
    }

    output = path.join(
      os.tmpdir(),
      `audio-${crypto.randomUUID()}.mp3`
    );

    await run('ffmpeg', [
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-ss', String(start),
      '-i', input,
      '-t', String(end - start),
      '-vn',
      '-codec:a', 'libmp3lame',
      '-q:a', '2',
      '-map_metadata', '-1',
      output
    ]);

    const base = path.basename(
      req.file.originalname,
      path.extname(req.file.originalname)
    )
      .replace(/[^a-z0-9_-]/gi, '_')
      .slice(0, 60) || 'audio';

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${base}_cut.mp3"`
    );

    const stream = fs.createReadStream(output);

    stream.on('error', err => {
      console.error(err);
      clean(input);
      clean(output);

      if (!res.headersSent) {
        res.status(500).end('Could not read converted audio.');
      }
    });

    stream.on('close', () => {
      clean(input);
      clean(output);
    });

    stream.pipe(res);

  } catch (err) {
    console.error(err);
    clean(input);
    clean(output);

    if (!res.headersSent) {
      res.status(500).json({
        error: 'Conversion failed. Try a different audio file.'
      });
    }
  }
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.use((err, req, res, next) => {
  console.error(err);

  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      error: err.code === 'LIMIT_FILE_SIZE'
        ? 'Maximum file size is 100 MB.'
        : 'Upload limit reached.'
    });
  }

  res.status(500).json({
    error: 'Unexpected server error.'
  });
});

app.listen(PORT, () => {
  console.log(`Audio converter listening on port ${PORT}`);
});
