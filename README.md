# 🌐 Talk (Bi-Talk)

> **Break down language barriers in real time.** Talk is a low-latency, bilingual WebRTC video calling application featuring live AI speech-to-text and instant translation, powered by Groq (Whisper & Llama 3.3).

---

## ✨ Features

- 🗣️ **Live Speech Translation**: Speak in English or Chinese (Mandarin)—captions automatically transcribe and translate in real time for your partner.
- ⚡ **Ultra-Fast AI Inference**: Powered by **Groq Cloud** using `whisper-large-v3-turbo` for STT and `llama-3.3-70b-versatile` for natural translation.
- 📹 **Peer-to-Peer WebRTC Calls**: HD video and audio connection with TURN relay support for seamless cross-network connectivity.
- 🎙️ **Integrated Voice Activity Detection (VAD)**: Smart audio buffering that captures speech segments naturally as you speak.
- 💬 **Live Translated Chat & Reactions**: Type messages with automatic translation or send expressive floating super-reactions.
- 📝 **Post-Call Summaries & Playback**: View a detailed timeline summary of your call transcript and listen back to the recorded audio.
- 🚀 **Always Free 24/7 Deployment**: Pre-configured for seamless 24/7 hosting on Google Cloud Platform's Always Free VM tier.

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
Make sure you have **Node.js (v18 or higher)** installed on your machine.

### 2. Clone the Repository
```bash
git clone https://github.com/mayank-icu/bi-talk.git
cd bi-talk
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Set Up Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Open `.env` in your text editor and fill in your keys:
```env
# Groq API Key (get yours free at https://console.groq.com)
GROQ_API_KEY=your_groq_api_key_here

PORT=3000

# Optional: TURN Credentials for cross-network relaying
TURN_URL=turn:your_turn_server_here:80
TURN_USERNAME=your_turn_username_here
TURN_CREDENTIAL=your_turn_credential_here
```

### 5. Start the Development Server
```bash
npm run dev
```

Open your browser and navigate to:
```
http://localhost:3000
```
Open a second tab or share your local IP to start a test call between two browser windows!

---

## ☁️ Deployment Guide (Google Cloud Always Free VM)

Google Cloud provides 1 free `e2-micro` Virtual Machine per month in US regions (`us-central1`, `us-east1`, or `us-west1`).

1. **Create a VM instance on GCP Compute Engine**:
   - **Machine Type**: `e2-micro` (1 GB RAM)
   - **Region**: `us-central1`, `us-east1`, or `us-west1`
   - **Boot Disk**: Standard Persistent Disk (up to 30 GB)

2. **SSH into your VM and deploy**:
   ```bash
   sudo apt-get update
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs git

   git clone https://github.com/mayank-icu/bi-talk.git
   cd bi-talk
   npm install

   # Setup .env file
   cp .env.example .env

   # Run server & Cloudflare HTTPS tunnel 24/7 with PM2
   sudo npm install -g pm2
   pm2 start server/index.js --name "bi-talk"
   pm2 start "npx cloudflared tunnel --url http://localhost:3000" --name "tunnel"
   pm2 save
   pm2 logs tunnel --lines 20
   ```

3. **Open the secure link**:
   Open the secure `https://...trycloudflare.com` URL from your PM2 logs in your browser for instant HTTPS, WebSockets, and microphone access!

---

## 🛠️ Built With

- **Backend**: Node.js, Express, WebSocket (`ws`), Multer
- **Frontend**: Vanilla JavaScript (ES6+), HTML5, Custom CSS
- **Media & Signaling**: WebRTC (`RTCPeerConnection`, `RTCDataChannel`), Web Audio API
- **AI Models**: Groq Cloud API (`whisper-large-v3-turbo` + `llama-3.3-70b-versatile`)
- **Deployment**: Google Cloud Platform (Compute Engine `e2-micro`)

---

## 📄 License

MIT License — Feel free to use, modify, and build upon this project!
