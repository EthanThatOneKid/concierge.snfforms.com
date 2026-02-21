'use client';

import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Session, type FunctionResponse } from '@google/genai';
import { listForms, getForm, searchForms, functionDeclarations } from './catalog';
import { companyInfo } from './company';
import { createBlob, decode, decodeAudioData } from './utils';
import LiveAudioVisuals3D from './LiveAudioVisuals3D';

export default function LiveAudio() {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [userTranscript, setUserTranscript] = useState('');
  const [agentTranscript, setAgentTranscript] = useState('');

  const clientRef = useRef<GoogleGenAI | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  
  const [inputNode, setInputNode] = useState<AudioNode | null>(null);
  const [outputNode, setOutputNode] = useState<AudioNode | null>(null);

  const nextStartTimeRef = useRef(0);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const scriptProcessorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Initialization
  useEffect(() => {
    if (typeof window === 'undefined') return;

    inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    
    const inNode = inputAudioContextRef.current.createGain();
    const outNode = outputAudioContextRef.current.createGain();
    outNode.connect(outputAudioContextRef.current.destination);
    
    setInputNode(inNode);
    setOutputNode(outNode);

    clientRef.current = new GoogleGenAI({
      apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY,
    });

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

    if (!clientRef.current || !outputAudioContextRef.current) return;
    
    nextStartTimeRef.current = outputAudioContextRef.current.currentTime;

    try {
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
                      const { category, query } = fc.args as any;
                      const result = await listForms(category, query);
                      return { id: fc.id, name: fc.name, response: { result } };
                    } else if (fc.name === 'get_form') {
                      const { formId } = fc.args as any;
                      const result = await getForm(formId);
                      return { id: fc.id, name: fc.name, response: { result } };
                    } else if (fc.name === 'search_forms') {
                      const { query, category, limit, offset } = fc.args as any;
                      const result = await searchForms(query, category, limit, offset);
                      return { id: fc.id, name: fc.name, response: { result } };
                    }
                  } catch(e: any) {
                    return { id: fc.id, name: fc.name, response: { error: e.message } };
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

            const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData;

            if (audio?.data && outputAudioContextRef.current && outNodeExists()) {
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
              source.connect(getOutputNode()!);
              source.addEventListener('ended', () => {
                sourcesRef.current.delete(source);
              });

              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            const inputTranscription = message.serverContent?.inputTranscription;
            if (inputTranscription?.text) {
              setUserTranscript(prev => prev + inputTranscription.text);
              setAgentTranscript('');
            }

            const outputTranscription = message.serverContent?.outputTranscription;
            if (outputTranscription?.text) {
              setAgentTranscript(prev => prev + outputTranscription.text);
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
          onerror: (e: any) => {
            setError(e.message || 'An error occurred');
          },
          onclose: (e: any) => {
            setStatus('Close:' + (e.reason || ''));
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction:
            `You are an expert on SNF Forms and the company SNF Printing. ` +
            `Company Information: ` +
            `${companyInfo.name} - ${companyInfo.description} ` +
            `Location: ${companyInfo.location.fullAddress}. ` +
            `Contact: Email ${companyInfo.contact.email}, Phone ${companyInfo.contact.phone}, Fax ${companyInfo.contact.fax}. ` +
            `History: ${companyInfo.history} ` +
            `Mission: ${companyInfo.mission} ` +
            'When the user asks about forms, always use the provided tools to look up accurate information. ' +
            'When searching for forms, use broad, concise keywords (e.g., \'Psychosocial\' instead of \'Psychosocial form\') to maximize search results. ' +
            'You can list forms, search for specific forms, or get details about a single form. ' +
            'If asked about visual details like color, size, or paper type, DO NOT say you lack access to visual details. ' +
            'Instead, use the search tool to identify the form, then get it to read the relevant details from the tool response. ' +
            'Present the information in a clear and engaging way. ' +
            'If the search returns no results, let the user know and suggest alternative queries.',
          tools: [{ functionDeclarations }],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Orus' } },
          },
        },
      });
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'Failed to initialize session');
    }
  };

  // Helper getters to use latest state inside closures
  const outNodeExists = () => {
    return !!outputAudioContextRef.current;
  };
  
  const getOutputNode = () => {
      // In a callback we might need the latest state. We can track it through state, but refs are safer for closures.
      // We rely on the initial outNode setup which stays intact.
      // Actually setOutputNode is called once, so outputNode closure might be stale.
      // Let's use a workaround for AudioNodes if we're not using refs.
      return document.querySelector('canvas') ? (window as any).__outNode : null;
  };

  // Improved way to bind nodes to be accessed in closures
  useEffect(() => {
    (window as any).__outNode = outputNode;
  }, [outputNode]);

  const startRecording = async () => {
    if (isRecording || !inputAudioContextRef.current || !inputNode || !sessionRef.current) {
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

      const source = inputAudioContextRef.current.createMediaStreamSource(stream);
      sourceNodeRef.current = source;
      source.connect(inputNode);

      const bufferSize = 256;
      const scriptProcessor = inputAudioContextRef.current.createScriptProcessor(bufferSize, 1, 1);
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
    } catch (err: any) {
      console.error('Error starting recording:', err);
      setStatus(`Error: ${err.message}`);
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
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#100c14' }}>
      <LiveAudioVisuals3D inputNode={inputNode} outputNode={outputNode} />
      
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
          gap: '10px'
        }}
      >
        {!isRecording && (
          <button
            onClick={reset}
            style={{
              outline: 'none', border: '1px solid rgba(255, 255, 255, 0.2)', color: 'white', borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.1)', width: '64px', height: '64px', cursor: 'pointer',
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="#ffffff" style={{ margin: 'auto' }}>
              <path d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z"/>
            </svg>
          </button>
        )}
        
        {!isRecording ? (
          <button
            onClick={startRecording}
            style={{
              outline: 'none', border: '1px solid rgba(255, 255, 255, 0.2)', color: 'white', borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.1)', width: '64px', height: '64px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <svg viewBox="0 0 100 100" width="32px" height="32px" fill="#c80000" xmlns="http://www.w3.org/2000/svg">
              <circle cx="50" cy="50" r="50" />
            </svg>
          </button>
        ) : (
          <button
            onClick={stopRecording}
            style={{
              outline: 'none', border: '1px solid rgba(255, 255, 255, 0.2)', color: 'white', borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.1)', width: '64px', height: '64px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <svg viewBox="0 0 100 100" width="32px" height="32px" fill="#000000" xmlns="http://www.w3.org/2000/svg">
              <rect x="0" y="0" width="100" height="100" rx="15" />
            </svg>
          </button>
        )}
      </div>

      <div
        id="captions"
        style={{
          position: 'absolute', bottom: '22vh', left: '5vw', right: '5vw', zIndex: 10, textAlign: 'center', pointerEvents: 'none'
        }}
      >
        <div style={{
          fontFamily: "'Inter', system-ui, sans-serif", fontSize: '1.25rem', lineHeight: '1.6', padding: '8px 16px', borderRadius: '8px', maxWidth: '80%', margin: '0 auto', transition: 'opacity 0.3s ease',
          color: '#a8d8ff', background: 'rgba(168, 216, 255, 0.1)', display: userTranscript ? 'block' : 'none'
        }}>{userTranscript}</div>
        <div style={{
          fontFamily: "'Inter', system-ui, sans-serif", fontSize: '1.25rem', lineHeight: '1.6', padding: '8px 16px', borderRadius: '8px', maxWidth: '80%', margin: '0 auto', transition: 'opacity 0.3s ease',
          color: '#ffd6a8', background: 'rgba(255, 214, 168, 0.1)', display: agentTranscript ? 'block' : 'none', marginTop: '10px'
        }}>{agentTranscript}</div>
      </div>
      
      <div id="status" style={{ position: 'absolute', bottom: '5vh', left: 0, right: 0, zIndex: 10, textAlign: 'center', color: 'white', fontFamily: "system-ui, sans-serif" }}>
        {error || status}
      </div>
    </div>
  );
}
