import { GoogleGenAI, Modality } from '@google/genai';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const token = await client.authTokens.create({
      config: {
        uses: 1, // Single use
        expireTime: expireTime,
        liveConnectConstraints: {
          model: 'gemini-2.5-flash-native-audio-preview-09-2025',
          config: {
            temperature: 0.7,
            responseModalities: [Modality.AUDIO],
          },
        },
        httpOptions: {
          apiVersion: 'v1alpha',
        },
      },
    });

    return NextResponse.json({ token: token.name });
  } catch (error) {
    console.error('Error generating ephemeral token:', error);
    return NextResponse.json(
      { error: 'Failed to generate token' },
      { status: 500 },
    );
  }
}
