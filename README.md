<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# SNF Forms Concierge

SNF Forms Concierge is an AI-powered voice assistant designed for [SNF Printing](https://snfforms.vercel.app/). It provides expert knowledge on medical forms and supplies, allowing users to interact naturally using voice and receive real-time assistance.

## Features

- **Gemini Live Integration:** Real-time multimodal voice interaction powered by the `gemini-2.5-flash-native-audio-preview` model.
- **Secure Ephemeral Tokens:** Architecture protects your API key by generating short-lived session tokens on the server.
- **Form Catalog Tooling:** Specialized tools to list, search, and retrieve detailed information about medical forms directly from the SNF Forms API.
- **3D Audio Visualization:** Immersive real-time audio visualization using Three.js and custom GLSL shaders.
- **Live Transcriptions:** Real-time display of both user and agent speech for better accessibility and clarity.
- **Company Context:** Pre-configured with deep knowledge of SNF Printing's history, mission, and contact information.

## Tech stack

- **Framework:** [Next.js 15+](https://nextjs.org/) (App Router)
- **Frontend library:** [React 19](https://react.dev/)
- **Visuals:** [Three.js](https://threejs.org/)
- **AI Backend:** [@google/genai](https://www.npmjs.com/package/@google/genai) (Gemini Live API)
- **Security:** Server-side token provisioning via Next.js Route Handlers.
- **Language:** [TypeScript](https://www.typescriptlang.org/)

## Prompt engineering & customization

The core prompt and company context are decoupled for easy customization. You can find and modify the prompt engineering within the codebase:

- **[`app/components/system.ts`](./app/components/system.ts)**: Contains the core system instructions, defining the AI's identity, tone, tool usage rules, and behavioral boundaries using XML-like tags.
- **[`app/components/company.ts`](./app/components/company.ts)**: Stores all the customizable business parameters (name, history, mission, contact info, etc.) which are dynamically injected into the system instructions.

To repurpose this concierge for a different business, you mainly need to update the variables in [`app/components/company.ts`](./app/components/company.ts). To change the underlying behavior or instructions of the assistant, edit [`app/components/system.ts`](./app/components/system.ts).

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later recommended)
- A Gemini API Key from [Google AI Studio](https://aistudio.google.com/)

### Installation

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/EthanThatOneKid/concierge.snfforms.com.git
    cd concierge.snfforms.com
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    ```

3.  **Configure Environment Variables:**
    Create a `.env.local` file in the root directory and add your Gemini API key (Ensure it does **not** have the `NEXT_PUBLIC_` prefix for security):

    ```env
    GEMINI_API_KEY=your_api_key_here
    ```

4.  **Run the application:**
    ```bash
    npm run dev
    ```
    The app will be available at `http://localhost:3000`.

## Usage

- **Click the red circle button** to start recording and talk to the concierge.
- **Click the black square button** to stop recording.
- **Click the reset button** (circular arrow) to clear the current session and start fresh.

---

© 2026 SNF Printing. Precision printing for the healthcare industry.
