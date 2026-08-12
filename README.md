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
- ☁️ **Netlify & Serverless Ready**: Uses Upstash Redis for persistent shared room state across serverless function invocations.

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
GROQ_API_KEY=your_actual_groq_api_key_here

PORT=3000

# Optional: TURN Credentials for cross-network relaying
# TURN_URL=turn:your.turn.server:80
# TURN_USERNAME=your_turn_username
# TURN_CREDENTIAL=your_turn_credential

# Upstash Redis (required for Netlify serverless room signaling)
# Get free REST credentials at https://console.upstash.com
UPSTASH_REDIS_REST_URL=your_upstash_redis_rest_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_rest_token
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

This project is pre-configured with `netlify.toml` and Netlify Functions.

### Step 1: Create a Free Upstash Redis Database
Serverless environments like Netlify are stateless. To let two users join the same call room across serverless function invocations:
1. Create a free Redis database at [console.upstash.com](https://console.upstash.com).
2. Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

### Step 2: Import Project in Netlify
1. Go to your [Netlify Dashboard](https://app.netlify.com).
2. Click **Add new site** > **Import an existing project**.
3. Select the **`bi-talk`** repository.

### Step 3: Add Environment Variables in Netlify
Navigate to **Site Settings > Environment Variables** and add:
- `GROQ_API_KEY`: Your Groq API Key
- `UPSTASH_REDIS_REST_URL`: Your Upstash Redis REST URL
- `UPSTASH_REDIS_REST_TOKEN`: Your Upstash Redis REST Token
- `TURN_URL` *(Optional)*: Your TURN Server URL
- `TURN_USERNAME` *(Optional)*: Your TURN Username
- `TURN_CREDENTIAL` *(Optional)*: Your TURN Credential

### Step 4: Deploy!
Click **Deploy Site**. Netlify will build your static files and deploy the API functions.

---

## 🛠️ Built With

- **Backend**: Node.js, Express, WebSocket (`ws`), `@upstash/redis`, `serverless-http`
- **Frontend**: Vanilla JavaScript (ES6+), HTML5, Custom CSS
- **Media & Signaling**: WebRTC (`RTCPeerConnection`, `RTCDataChannel`), Web Audio API
- **AI Models**: Groq Cloud API (`whisper-large-v3-turbo` + `llama-3.3-70b-versatile`)
- **Deployment**: Netlify Functions + Upstash Redis

---

## 📄 License

MIT License — Feel free to use, modify, and build upon this project!
