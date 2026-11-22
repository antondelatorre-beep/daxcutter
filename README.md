# Audio Cutter Studio — Render deployment

A small Render-ready web app that accepts an audio file, lets the user choose start/end times, and converts that segment to MP3 with FFmpeg.

## Important limitation
This app does **not** download or extract audio from YouTube URLs. Use audio files you own or are authorized to download and convert. YouTube does not provide a general-purpose public API for downloading arbitrary videos as MP3.

## Deploy to Render
1. Create a new GitHub repository and upload the contents of this folder.
2. In Render, choose **New → Blueprint** and connect that repository.
3. Render detects `render.yaml` and builds the Docker service.
4. Open the generated `onrender.com` URL.

Alternatively, create a **Web Service** from the repository and select the Docker runtime.

## Run locally
Requirements: Node.js 20+ and FFmpeg (including `ffprobe`) installed and available on PATH.

```bash
npm install
npm start
```

Open http://localhost:10000.

## Limits and notes
- Upload limit: 100 MB per file.
- The service uses temporary files and deletes them after conversion.
- This starter project has no user accounts or persistent storage.
- For a public production service, add authentication, request throttling, monitoring, and stricter resource limits.
- Render free instances may sleep when idle and have limited CPU/RAM; large conversions can take time.
