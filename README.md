# Comvibe — AI-Powered LinkedIn Comment Writer

> **Generate contextual, personalized, and engaging LinkedIn comments in seconds using your own LLM API keys. Privacy-first. No subscriptions. Total control.**


## 🎯 What is Comvibe?

Comvibe is a **Chrome Extension** that injects an AI comment generator directly into **LinkedIn's** comment boxes. It reads the post you're replying to, understands the context, and writes a thoughtful comment that sounds like *you* — not a generic bot.

**Perfect for:**
- Professionals building their personal brand
- Sales teams engaging with prospects
- Recruiters connecting with candidates
- Anyone wanting to show up consistently on LinkedIn without the mental load

---

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| **🎨 Inline Toolbar** | `✨ Generate` button + Tone + Length selectors appear *inside* every LinkedIn comment box |
| **🧠 Multi-LLM Support** | OpenAI, Groq, OpenRouter, or any OpenAI-compatible endpoint (LM Studio, Ollama, LocalAI) |
| **🔐 BYOK Privacy** | Your API keys stay in `chrome.storage.local` — requests go directly from your browser to the provider |
| **🎭 6 Tones** | Professional, Casual, Witty, Supportive, Analytical, Contrarian |
| **📏 3 Lengths** | Short (~1 sentence), Medium (~2–3 sentences), Long (~4–5 sentences) |
| **👤 Personalized Knowledge Base** | Feed it your role, expertise, company, writing style — comments sound uniquely like you |
| **⚡ Zero-Server** | No middleware, no proxy, no telemetry. Your data never leaves your browser except to your chosen LLM |

---

## 🖼️ Visual Guide

### 1. The Extension Popup — Your Command Center and choose your provider

Click the **Comvibe** icon in your Chrome toolbar to open the settings panel. This is where you configure everything: your LLM provider, API key, model, system prompt, and personal knowledge base. Toggle Active at the top to turn the extension on or off across LinkedIn at any time. Under Provider & Model, select which LLM provider you want to use — OpenAI, Groq, OpenRouter, or a Custom OpenAI-compatible endpoint. Comvibe isn't locked into a single model or vendor; use whichever provider fits your budget or quality preference.

![Extension Popup](./public/images/Group%2011.png)

### 2. Connect Your API Key & Fetch Models

Paste your API key into the field (it's masked by default — click the eye icon to reveal it). Click Fetch Models to pull the live, up-to-date list of models available to your account, then select the one you want to generate with. Your key is stored only on your device and sent directly to the provider you choose, never to any third-party server.

![Inline Toolbar](./public/images/Group%2012.png)

### 3. Personalize the Agent

Scroll down to shape how the agent writes:

- **System Prompt** — instructions for how the agent should think and behave when writing a comment.
- **Knowledge Base** — background about you: your role, expertise, and experience, so comments sound like they genuinely came from you.
- **Default Preferences** — set your default **Tone** (Professional, Casual, Witty, Supportive, Analytical, Contrarian) and **Length** (Short, Medium, Long) for every generated comment. Both can still be adjusted per-comment directly on LinkedIn.

![Generate Flow](./public/images/Group%2013.png)

### 4. Generate — Live, Inside LinkedIn

Open any post on LinkedIn and click into the comment box. A small toolbar appears with a Generate button plus quick Tone and Length selectors. Click Generate, and the agent reads the post, applies your system prompt and knowledge base, and writes a comment directly into the box, ready to review and post. Not happy with the result? Click Regenerate to try again with a different angle, tone, or length, right where you left off.

![Final Result](./public/images/Group%2014.png)


## 💡 Daily Workflow: How to Use Comvibe for Maximum Engagement

### Morning Routine (5 minutes)
1. **Open LinkedIn** — Scroll your feed
2. **Find 3–5 posts** relevant to your industry or network
3. **Click comment box** → Toolbar appears automatically
4. **Select tone** — *Professional* for peers, *Supportive* for connections, *Analytical* for thought-leadership posts
5. **Hit Generate** → Review → **Post**

### Weekly Power Moves
| Day | Focus | Tone Strategy |
|-----|-------|---------------|
| Monday | Industry trends | Analytical / Professional |
| Tuesday | Peer celebrations | Supportive / Casual |
| Wednesday | Thought leadership | Contrarian / Analytical |
| Thursday | Network engagement | Casual / Witty |
| Friday | Week wraps & gratitude | Supportive / Professional |

### Pro Tips for High-Value Comments
- **Fill your Knowledge Base** (popup → "About You") with: your role, company, expertise, opinions, writing quirks
- **Customize System Prompt** — e.g., *"You're a senior PM. Comment with one sharp insight + one question. No fluff."*
- **Use "Regenerate"** — Didn't like the first try? Click ↻ Regenerate for a fresh take
- **Mix tones** — Don't always use Professional; Witty/Contrarian comments stand out in feeds

---

## 🛠️ Installation

### Load Unpacked (Developer Mode)
```bash
# 1. Clone or download this repo
git clone https://github.com/devsWithRafi/Comvibe-Linkedin-comment-writer-agent.git

# 2. Open Chrome Extensions
#    Navigate to: chrome://extensions/

# 3. Enable "Developer mode" (top right toggle)

# 4. Click "Load unpacked" → Select the project folder
```


## ⚙️ Configuration Guide

### 1. Choose Your LLM Provider
| Provider | Best For | Get API Key |
|----------|----------|-------------|
| **OpenAI** | Highest quality, reasoning models (o1, o3-mini) | [platform.openai.com](https://platform.openai.com) |
| **Groq** | Free tier, ultra-fast inference (Llama 3.3, DeepSeek) | [console.groq.com](https://console.groq.com) |
| **OpenRouter** | Access 100+ models (Claude, Gemini, Llama) via one key | [openrouter.ai](https://openrouter.ai) |
| **Custom** | Local models (Ollama, LM Studio, vLLM) | Your local server URL |

### 2. Add Your API Key
- Paste in the popup → **API Key** field
- Keys stored locally in `chrome.storage.local` — never sent anywhere except to your provider

### 3. Fetch & Select Model
- Click **Fetch Models** → Choose your preferred model
- *Tip: `gpt-4o-mini` (OpenAI) or `llama-3.3-70b-versatile` (Groq) are great cost/quality balances*

### 4. Personalize (Highly Recommended)
**System Prompt** example:
> You are a Senior Product Manager at a B2B SaaS startup. Write concise, insightful comments that add a unique product perspective. Avoid generic praise. Max 2–3 sentences. Use "I've found..." or "In my experience..." when relevant.

**Knowledge Base** example:
> I'm Sarah, VP of Product at AcmeTech (Series B, 200 people). We build AI-powered dev tools. Background: 10 yrs PM, ex-Google, ex-Stripe. Passionate about PLG, developer experience, and remote team culture. Writing style: direct, slightly contrarian, uses concrete examples. Avoid: buzzwords, emojis, hashtags.

---

**Ready to transform your LinkedIn engagement?**

👉 [Install Comvibe](#installation) → Configure your API key → Start commenting like a pro

*Made with ☕ for builders, creators, and professionals who value their time and voice.*
