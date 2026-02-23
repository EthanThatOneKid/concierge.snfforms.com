'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  type FunctionResponse,
  GoogleGenAI,
  LiveServerMessage,
  Modality,
  Session,
} from '@google/genai';
import {
  functionDeclarations,
  getForm,
  listForms,
  searchForms,
} from './catalog';
import { systemInstruction } from './system';
import { createBlob, decode, decodeAudioData } from './utils';
import LiveAudioVisuals3D from './LiveAudioVisuals3D';

interface ListFormsArgs {
  category?: string;
  query?: string;
}

interface GetFormArgs {
  formId: string;
}

interface SearchFormsArgs {
  query?: string;
  category?: string;
  limit?: number;
  offset?: number;
}

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

export default function LiveAudio() {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [userTranscript, setUserTranscript] = useState('');
  const [agentTranscript, setAgentTranscript] = useState('');
  const [isAudioInitialized, setIsAudioInitialized] = useState(false);

  const clientRef = useRef<GoogleGenAI | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);

  const inputNodeRef = useRef<GainNode | null>(null);
  const outputNodeRef = useRef<GainNode | null>(null);

  const nextStartTimeRef = useRef(0);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const scriptProcessorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Initialization
  useEffect(() => {
    if (typeof window === 'undefined') return;

    inputAudioContextRef.current = new (
      window.AudioContext || window.webkitAudioContext
    )({ sampleRate: 16000 });
    outputAudioContextRef.current = new (
      window.AudioContext || window.webkitAudioContext
    )({ sampleRate: 24000 });

    inputNodeRef.current = inputAudioContextRef.current.createGain();
    outputNodeRef.current = outputAudioContextRef.current.createGain();
    outputNodeRef.current.connect(outputAudioContextRef.current.destination);

    setIsAudioInitialized(true);

    initSession();

    return () => {
      // Cleanup
      sessionRef.current?.close();
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (inputAudioContextRef.current?.state !== 'closed') {
        inputAudioContextRef.current?.close();
      }
      if (outputAudioContextRef.current?.state !== 'closed') {
        outputAudioContextRef.current?.close();
      }
    };
  }, []);

  const initSession = async () => {
    const model = 'gemini-2.5-flash-native-audio-preview-09-2025';

    if (!outputAudioContextRef.current) return;

    nextStartTimeRef.current = outputAudioContextRef.current.currentTime;

    try {
      setStatus('Fetching secure token...');
      const response = await fetch('/api/gemini-token');
      if (!response.ok) {
        throw new Error('Failed to fetch secure token');
      }
      const data = await response.json();
      clientRef.current = new GoogleGenAI({
        apiKey: data.token,
        httpOptions: { apiVersion: 'v1alpha' },
      });

      sessionRef.current = await clientRef.current.live.connect({
        model: model,
        callbacks: {
          onopen: () => {
            setStatus('Opened');
          },
          onmessage: async (message: LiveServerMessage) => {
            const toolCall = message.toolCall;
            if (toolCall) {
              const functionResponses: FunctionResponse[] = await Promise.all(
                (toolCall.functionCalls || []).map(async (fc) => {
                  try {
                    if (fc.name === 'list_forms') {
                      const { category, query } =
                        fc.args as unknown as ListFormsArgs;
                      const result = await listForms(category, query);
                      return { id: fc.id, name: fc.name, response: { result } };
                    } else if (fc.name === 'get_form') {
                      const { formId } = fc.args as unknown as GetFormArgs;
                      const result = await getForm(formId);
                      return { id: fc.id, name: fc.name, response: { result } };
                    } else if (fc.name === 'search_forms') {
                      const { query, category, limit, offset } =
                        fc.args as unknown as SearchFormsArgs;
                      const result = await searchForms(
                        query,
                        category,
                        limit,
                        offset,
                      );
                      return { id: fc.id, name: fc.name, response: { result } };
                    }
                  } catch (e: unknown) {
                    return {
                      id: fc.id,
                      name: fc.name,
                      response: {
                        error: e instanceof Error ? e.message : String(e),
                      },
                    };
                  }
                  return {
                    id: fc.id,
                    name: fc.name,
                    response: { error: `Unknown function: ${fc.name}` },
                  };
                }),
              );

              await sessionRef.current?.sendToolResponse({ functionResponses });
              return;
            }

            const audio =
              message.serverContent?.modelTurn?.parts?.[0]?.inlineData;

            if (
              audio?.data &&
              outputAudioContextRef.current &&
              outputNodeRef.current
            ) {
              nextStartTimeRef.current = Math.max(
                nextStartTimeRef.current,
                outputAudioContextRef.current.currentTime,
              );

              const audioBuffer = await decodeAudioData(
                decode(audio.data),
                outputAudioContextRef.current,
                24000,
                1,
              );
              const source = outputAudioContextRef.current.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputNodeRef.current);
              source.addEventListener('ended', () => {
                sourcesRef.current.delete(source);
              });

              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            const inputTranscription =
              message.serverContent?.inputTranscription;
            if (inputTranscription?.text) {
              setUserTranscript((prev) => prev + inputTranscription.text);
              setAgentTranscript('');
            }

            const outputTranscription =
              message.serverContent?.outputTranscription;
            if (outputTranscription?.text) {
              setAgentTranscript((prev) => prev + outputTranscription.text);
              setUserTranscript('');
            }

            const interrupted = message.serverContent?.interrupted;
            if (interrupted) {
              for (const source of sourcesRef.current.values()) {
                source.stop();
                sourcesRef.current.delete(source);
              }
              nextStartTimeRef.current = 0;
              setUserTranscript('');
              setAgentTranscript('');
            }
          },
          onerror: (e) => {
            setError(
              e instanceof Error
                ? e.message
                : (e as { message?: string })?.message || String(e),
            );
          },
          onclose: (e) => {
            setStatus('Close:' + (e.reason || ''));
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction,
          tools: [{ functionDeclarations }],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Orus' } },
          },
        },
      });
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Failed to initialize session');
    }
  };

  // No-op for parity logic
  useEffect(() => {}, []);

  const startRecording = async () => {
    if (
      isRecording ||
      !inputAudioContextRef.current ||
      !inputNodeRef.current ||
      !sessionRef.current
    ) {
      return;
    }

    inputAudioContextRef.current.resume();
    setStatus('Requesting microphone access...');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      mediaStreamRef.current = stream;

      setStatus('Microphone access granted. Starting capture...');

      const source =
        inputAudioContextRef.current.createMediaStreamSource(stream);
      sourceNodeRef.current = source;
      source.connect(inputNodeRef.current);

      const bufferSize = 256;
      const scriptProcessor =
        inputAudioContextRef.current.createScriptProcessor(bufferSize, 1, 1);
      scriptProcessorNodeRef.current = scriptProcessor;

      scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
        if (!isRecordingRef.current) return;
        const inputBuffer = audioProcessingEvent.inputBuffer;
        const pcmData = inputBuffer.getChannelData(0);
        sessionRef.current?.sendRealtimeInput({ media: createBlob(pcmData) });
      };

      source.connect(scriptProcessor);
      scriptProcessor.connect(inputAudioContextRef.current.destination);

      setIsRecording(true);
      isRecordingRef.current = true;
      setStatus('🔴 Recording... Capturing PCM chunks.');
    } catch (err: unknown) {
      console.error('Error starting recording:', err);
      setStatus(
        `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
      stopRecording();
    }
  };

  const isRecordingRef = useRef(false);

  const stopRecording = () => {
    setStatus('Stopping recording...');
    setIsRecording(false);
    isRecordingRef.current = false;

    if (scriptProcessorNodeRef.current && sourceNodeRef.current) {
      scriptProcessorNodeRef.current.disconnect();
      sourceNodeRef.current.disconnect();
    }
    scriptProcessorNodeRef.current = null;
    sourceNodeRef.current = null;

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    setStatus('Recording stopped. Click Start to begin again.');
  };

  const reset = () => {
    sessionRef.current?.close();
    initSession();
    setUserTranscript('');
    setAgentTranscript('');
    setStatus('Session cleared.');
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: '#100c14',
      }}
    >
      {isAudioInitialized && (
        <LiveAudioVisuals3D
          inputNode={inputNodeRef.current}
          outputNode={outputNodeRef.current}
        />
      )}

      <div
        className="controls"
        style={{
          zIndex: 10,
          position: 'absolute',
          bottom: '10vh',
          left: 0,
          right: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        {!isRecording && (
          <button
            onClick={reset}
            style={{
              outline: 'none',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: 'white',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.1)',
              width: '64px',
              height: '64px',
              cursor: 'pointer',
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              height="40px"
              viewBox="0 -960 960 960"
              width="40px"
              fill="#ffffff"
              style={{ margin: 'auto' }}
            >
              <path d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z" />
            </svg>
          </button>
        )}

        {!isRecording ? (
          <button
            onClick={startRecording}
            style={{
              outline: 'none',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: 'white',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.1)',
              width: '64px',
              height: '64px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              viewBox="0 0 100 100"
              width="32px"
              height="32px"
              fill="#c80000"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="50" cy="50" r="50" />
            </svg>
          </button>
        ) : (
          <button
            onClick={stopRecording}
            style={{
              outline: 'none',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: 'white',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.1)',
              width: '64px',
              height: '64px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              viewBox="0 0 100 100"
              width="32px"
              height="32px"
              fill="#000000"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect x="0" y="0" width="100" height="100" rx="15" />
            </svg>
          </button>
        )}
      </div>

      <div
        id="captions"
        style={{
          position: 'absolute',
          bottom: '22vh',
          left: '5vw',
          right: '5vw',
          zIndex: 10,
          textAlign: 'center',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: '1.25rem',
            lineHeight: '1.6',
            padding: '8px 16px',
            borderRadius: '8px',
            maxWidth: '80%',
            margin: '0 auto',
            transition: 'opacity 0.3s ease',
            color: '#a8d8ff',
            background: 'rgba(168, 216, 255, 0.1)',
            display: userTranscript ? 'block' : 'none',
          }}
        >
          {userTranscript}
        </div>
        <div
          style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: '1.25rem',
            lineHeight: '1.6',
            padding: '8px 16px',
            borderRadius: '8px',
            maxWidth: '80%',
            margin: '0 auto',
            transition: 'opacity 0.3s ease',
            color: '#ffd6a8',
            background: 'rgba(255, 214, 168, 0.1)',
            display: agentTranscript ? 'block' : 'none',
            marginTop: '10px',
          }}
        >
          {agentTranscript}
        </div>
      </div>

      <div
        id="status"
        style={{
          position: 'absolute',
          bottom: '5vh',
          left: 0,
          right: 0,
          zIndex: 10,
          textAlign: 'center',
          color: 'white',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {error || status}
      </div>
    </div>
  );
}
