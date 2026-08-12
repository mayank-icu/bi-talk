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
- ☁️ **Netlify Serverless Ready**: Includes automatic HTTP signaling fallback so the entire app can be deployed serverless on Netlify without extra infrastructure.

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

Open `.env` in your text editor and add your **Groq API Key**:
```env
# Get a free key at https://console.groq.com
GROQ_API_KEY=your_actual_groq_api_key_here

PORT=3000

# Metered TURN Credentials (optional for local testing, recommended for production)
TURN_URL=turn:global.relay.metered.ca:80
TURN_USERNAME=ee2d679c66ff42d230d8c23b
TURN_CREDENTIAL=kCBBTwb2W91ggq1a
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

## ☁️ Deploying to Netlify

This project is pre-configured with `netlify.toml` and serverless functions for seamless deployment on Netlify.

### Step 1: Push Code to GitHub
Push your repository to your GitHub account (see instructions below).

### Step 2: Import Project in Netlify
1. Go to your [Netlify Dashboard](https://app.netlify.com).
2. Click **Add new site** > **Import an existing project**.
3. Connect your GitHub account and select the **`bi-talk`** repository.
4. Netlify will automatically detect settings from `netlify.toml` (`publish = "public"`, `functions = "netlify/functions"`).

### Step 3: Add Environment Variables in Netlify
Before clicking Deploy, navigate to **Site Settings > Environment Variables** and add:
- `GROQ_API_KEY`: Your Groq API Key
- `TURN_URL`: `turn:global.relay.metered.ca:80`
- `TURN_USERNAME`: `ee2d679c66ff42d230d8c23b`
- `TURN_CREDENTIAL`: `kCBBTwb2W91ggq1a`

### Step 4: Deploy!
Click **Deploy Site**. Netlify will build your static files and deploy the API functions.

---

## 🛠️ Built With

- **Backend**: Node.js, Express, WebSocket (`ws`), Multer, `serverless-http`
- **Frontend**: Vanilla JavaScript (ES6+), HTML5, Custom CSS
- **Media & Signaling**: WebRTC (`RTCPeerConnection`, `RTCDataChannel`), Web Audio API
- **AI Models**: Groq Cloud API (`whisper-large-v3-turbo` + `llama-3.3-70b-versatile`)
- **Deployment**: Netlify Functions + Static Hosting

---

## 📄 License

MIT License — Feel free to use, modify, and build upon this project!
