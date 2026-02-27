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
import { companyInfo } from './company';

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

    setStatus('Recording stopped. Click to begin again.');
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
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* 3D Core Visuals (Background-like but interactive) */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 1,
        }}
      >
        {isAudioInitialized && (
          <LiveAudioVisuals3D
            inputNode={inputNodeRef.current}
            outputNode={outputNodeRef.current}
          />
        )}
      </div>

      {/* Top Section: Transcripts */}
      <div
        id="captions-container"
        style={{
          zIndex: 10,
          flex: '0 0 auto',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          pointerEvents: 'none',
          maxHeight: '40vh',
          overflowY: 'auto',
          maskImage: 'linear-gradient(to bottom, black 80%, transparent 100%)',
        }}
      >
        {userTranscript && (
          <div
            style={{
              fontSize: 'clamp(1rem, 2.5vw, 1.25rem)',
              lineHeight: '1.6',
              padding: '12px 24px',
              borderRadius: '16px',
              maxWidth: '900px',
              width: 'fit-content',
              color: '#a8d8ff',
              background: 'rgba(168, 216, 255, 0.08)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(168, 216, 255, 0.2)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
              textAlign: 'center',
              pointerEvents: 'auto',
            }}
          >
            {userTranscript}
          </div>
        )}
        {agentTranscript && (
          <div
            style={{
              fontSize: 'clamp(1rem, 2.5vw, 1.25rem)',
              lineHeight: '1.6',
              padding: '12px 24px',
              borderRadius: '16px',
              maxWidth: '900px',
              width: 'fit-content',
              color: '#ffd6a8',
              background: 'rgba(255, 214, 168, 0.08)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 214, 168, 0.2)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
              textAlign: 'center',
              pointerEvents: 'auto',
            }}
          >
            {agentTranscript}
          </div>
        )}
      </div>

      {/* Middle Spacing (Reserved for the 3D Orb visibility) */}
      <div style={{ flex: '1 1 auto', pointerEvents: 'none' }} />

      {/* Bottom Section: Controls & Status */}
      <div
        style={{
          zIndex: 10,
          flex: '0 0 auto',
          padding: '40px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '24px',
          background:
            'linear-gradient(to top, rgba(16, 12, 20, 0.9) 0%, transparent 100%)',
          backdropFilter: 'blur(4px)',
        }}
      >
        <div
          className="controls"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '32px',
          }}
        >
          {!isRecording ? (
            <button
              onClick={startRecording}
              title={`Call ${companyInfo.name}`}
              style={{
                outline: 'none',
                border: '1px solid rgba(75, 255, 75, 0.2)',
                color: 'white',
                borderRadius: '50%',
                background: 'rgba(40, 180, 40, 0.15)',
                backdropFilter: 'blur(12px)',
                width: '80px',
                height: '80px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: '0 8px 32px rgba(40, 180, 40, 0.2)',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(40, 180, 40, 0.25)';
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'rgba(40, 180, 40, 0.15)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                height="32px"
                viewBox="0 0 24 24"
                width="32px"
                fill="#4bff4b"
              >
                <path d="M0 0h24v24H0V0z" fill="none" />
                <path d="M6.62 10.79c1.44 2.83 3.76 5.15 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
              </svg>
            </button>
          ) : (
            <>
              <button
                onClick={reset}
                title="Restart Connection"
                style={{
                  outline: 'none',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: 'white',
                  borderRadius: '50%',
                  background: 'rgba(255, 255, 255, 0.05)',
                  backdropFilter: 'blur(12px)',
                  width: '56px',
                  height: '56px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                }}
                onMouseOver={(e) =>
                  (e.currentTarget.style.background =
                    'rgba(255, 255, 255, 0.15)')
                }
                onMouseOut={(e) =>
                  (e.currentTarget.style.background =
                    'rgba(255, 255, 255, 0.05)')
                }
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  height="24px"
                  viewBox="0 -960 960 960"
                  width="24px"
                  fill="#ffffff"
                >
                  <path d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z" />
                </svg>
              </button>

              <button
                onClick={stopRecording}
                title="End Call"
                style={{
                  outline: 'none',
                  border: '1px solid rgba(255, 75, 75, 0.2)',
                  color: 'white',
                  borderRadius: '50%',
                  background: 'rgba(180, 40, 40, 0.2)',
                  backdropFilter: 'blur(12px)',
                  width: '80px',
                  height: '80px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: '0 8px 32px rgba(180, 40, 40, 0.3)',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(180, 40, 40, 0.35)';
                  e.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(180, 40, 40, 0.2)';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  height="32px"
                  viewBox="0 0 24 24"
                  width="32px"
                  fill="#ff4b4b"
                >
                  <path d="M0 0h24v24H0V0z" fill="none" />
                  <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9l-2.03 1.01c-.14.07-.3.11-.46.11-.27 0-.53-.11-.7-.3l-1.45-1.45c-.19-.19-.3-.45-.3-.72 0-.27.11-.53.3-.72C4.16 9.4 8.16 7 12 7s7.84 2.4 9.85 4.65c.19.19.3.45.3.72 0 .27-.11.53-.3.72l-1.45 1.45c-.17.19-.43.3-.7.3-.16 0-.32-.04-.46-.11l-2.03-1.01c-.33-.16-.56-.51-.56-.9v-3.1c-1.45-.47-3-.72-4.6-.72z" />
                </svg>
              </button>
            </>
          )}
        </div>

        <div
          id="status"
          style={{
            color: 'rgba(255, 255, 255, 0.5)',
            fontSize: '0.85rem',
            textAlign: 'center',
            minHeight: '1.2em',
            fontWeight: 400,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          {error || status}
        </div>
      </div>
    </div>
  );
}
