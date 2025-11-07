
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { analyzeScene } from './services/geminiService';
import { PlayIcon, StopIcon, CameraIcon, LoadingSpinner } from './components/icons';

const App: React.FC = () => {
    const [isAssistantActive, setIsAssistantActive] = useState(false);
    const [statusMessage, setStatusMessage] = useState("Tap screen to begin");
    const [error, setError] = useState<string | null>(null);
    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const processingIntervalRef = useRef<number | null>(null);
    const isProcessingRef = useRef(false);
    const isSpeakingRef = useRef(false);

    // Effect to load available speech synthesis voices
    useEffect(() => {
        const loadVoices = () => {
            setVoices(window.speechSynthesis.getVoices());
        };
        loadVoices();
        window.speechSynthesis.onvoiceschanged = loadVoices;
        return () => {
            window.speechSynthesis.onvoiceschanged = null;
        };
    }, []);

    const speak = useCallback((text: string) => {
        window.speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);

        const preferredVoiceNames = [
            'Google US English', 'Alex', 'Samantha', 'Daniel', 
            'Microsoft David - English (United States)', 'Microsoft Zira - English (United States)'
        ];
        let selectedVoice = voices.find(voice => preferredVoiceNames.includes(voice.name));
        if (!selectedVoice) {
            selectedVoice = voices.find(voice => voice.lang.startsWith('en-US'));
        }
        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }

        // Removed custom rate and pitch for a more natural voice
        // utterance.rate = 1.2;
        // utterance.pitch = 1.1;

        utterance.onstart = () => {
            isSpeakingRef.current = true;
            setStatusMessage("Speaking...");
        };
        utterance.onend = () => {
            isSpeakingRef.current = false;
            if (isAssistantActive) {
                setStatusMessage("Listening...");
            } else {
                setStatusMessage("Assistant stopped.");
            }
        };
        utterance.onerror = (e) => {
            console.error('Speech synthesis error:', e);
            isSpeakingRef.current = false;
            setError("A speech error occurred.");
        };

        window.speechSynthesis.speak(utterance);
    }, [isAssistantActive, voices]);

    const stopCamera = useCallback(() => {
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }, []);

    const startCamera = useCallback(async () => {
        if (mediaStreamRef.current) return;
        try {
            setStatusMessage("Starting camera...");
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' } // Prioritize rear camera
            });
            mediaStreamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
            setStatusMessage("Listening...");
        } catch (err) {
            console.error("Error accessing camera:", err);
            setError("Could not access the camera. Please check permissions.");
            speak("Error: Could not access the camera.");
            setIsAssistantActive(false);
        }
    }, [speak]);

    const processFrame = useCallback(async () => {
        if (isProcessingRef.current || isSpeakingRef.current || !videoRef.current || !canvasRef.current) {
            return;
        }

        isProcessingRef.current = true;
        setStatusMessage("Analyzing scene...");

        try {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            
            const MAX_DIMENSION = 480;
            const { videoWidth, videoHeight } = video;

            let targetWidth = videoWidth;
            let targetHeight = videoHeight;

            if (videoWidth > videoHeight) {
                if (videoWidth > MAX_DIMENSION) {
                    targetHeight = Math.round((MAX_DIMENSION / videoWidth) * videoHeight);
                    targetWidth = MAX_DIMENSION;
                }
            } else {
                if (videoHeight > MAX_DIMENSION) {
                    targetWidth = Math.round((MAX_DIMENSION / videoHeight) * videoWidth);
                    targetHeight = MAX_DIMENSION;
                }
            }

            canvas.width = targetWidth;
            canvas.height = targetHeight;
            
            const context = canvas.getContext('2d');
            
            if (context) {
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                const base64ImageData = canvas.toDataURL('image/jpeg', 0.5); // Use lower quality for speed
                const description = await analyzeScene(base64ImageData);
                speak(description);
            }
        } catch (err) {
            console.error(err);
            const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
            setError(`Failed to process frame: ${errorMessage}`);
            speak(`Error: Failed to process the scene.`);
        } finally {
            isProcessingRef.current = false;
        }
    }, [speak]);

    useEffect(() => {
        if (isAssistantActive) {
            startCamera();
            processingIntervalRef.current = window.setInterval(processFrame, 2500);
        } else {
            stopCamera();
            if (processingIntervalRef.current) {
                clearInterval(processingIntervalRef.current);
                processingIntervalRef.current = null;
            }
            window.speechSynthesis.cancel();
            isProcessingRef.current = false;
            isSpeakingRef.current = false;
            setStatusMessage("Tap screen to begin");
        }

        return () => {
            stopCamera();
            if (processingIntervalRef.current) {
                clearInterval(processingIntervalRef.current);
            }
            window.speechSynthesis.cancel();
        };
    }, [isAssistantActive, startCamera, stopCamera, processFrame]);
    
    const handleToggleAssistant = () => {
        setError(null);
        if (!isAssistantActive) {
            speak("Starting assistant.");
        }
        setIsAssistantActive(prev => !prev);
    };
    
    return (
        <div className="relative w-screen h-screen bg-black text-white flex flex-col items-center justify-center font-sans select-none">
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute top-0 left-0 w-full h-full object-cover -z-10"
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Clickable Overlay */}
            <div 
                className="absolute inset-0 flex flex-col items-center justify-between p-8 bg-black/60 z-10 cursor-pointer" 
                onClick={handleToggleAssistant}
                role="button"
                tabIndex={0}
                aria-label={isAssistantActive ? "Stop Visual Assistant" : "Start Visual Assistant"}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleToggleAssistant() }}
            >
                {/* Status Display */}
                <div className="flex-grow flex items-center justify-center text-center">
                    <div className="flex flex-col items-center gap-4">
                        {isAssistantActive ? (
                            <div className="flex flex-col items-center justify-center min-h-[12rem]">
                                {statusMessage === "Analyzing scene..." && <LoadingSpinner className="w-16 h-16 text-cyan-400 mb-4" />}
                                <p className="text-3xl font-medium tracking-wide" aria-live="polite">
                                    {statusMessage}
                                </p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-4">
                               <CameraIcon className="w-24 h-24 text-cyan-400" />
                               <h1 className="text-5xl font-bold">Visual Assistant</h1>
                               <p className="text-2xl mt-2">{statusMessage}</p>
                            </div>
                        )}
                        {error && (
                            <p className="mt-4 text-xl text-red-500 bg-black/50 p-3 rounded-lg" role="alert">
                                {error}
                            </p>
                        )}
                    </div>
                </div>

                {/* Main Control Button Visual Cue */}
                <div className="flex-shrink-0 w-full flex justify-center pb-8">
                     <div
                        aria-hidden="true"
                        className="w-28 h-28 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white ring-4 ring-white/30"
                    >
                        {isAssistantActive ? (
                            <StopIcon className="w-14 h-14" />
                        ) : (
                            <PlayIcon className="w-14 h-14" />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default App;
