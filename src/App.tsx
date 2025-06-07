/// <reference types="vite/client" />

// Add this at the top of the file or in a separate types/env.d.ts fil
import { FC, useState, useRef, useEffect } from 'react'
import { socketService } from './socket';
import { Hands, Results } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini using .env variable (Vite/CRA)
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// Add type definition for ASL patterns
type ASLPattern = {
  thumb: boolean;
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
  isCurved?: boolean;
};

// Add ASL letter patterns
const ASL_LETTERS: Record<string, ASLPattern> = {
  A: { 
    thumb: true,  // Thumb should be extended to the side
    index: false, // Index finger should be bent
    middle: false, // Middle finger should be bent
    ring: false,  // Ring finger should be bent
    pinky: false, // Pinky should be bent
    isCurved: false // Hand should not be curved
  },
  B: { thumb: false, index: true, middle: true, ring: true, pinky: true },
  C: { thumb: true, index: true, middle: true, ring: true, pinky: true, isCurved: true },
  D: { thumb: true, index: true, middle: true, ring: false, pinky: false },
  E: { thumb: true, index: false, middle: false, ring: false, pinky: false, isCurved: true },
  F: { thumb: true, index: true, middle: true, ring: false, pinky: false },
  G: { thumb: true, index: true, middle: false, ring: false, pinky: false },
  H: { thumb: true, index: true, middle: true, ring: false, pinky: false },
  I: { thumb: true, index: false, middle: false, ring: false, pinky: true },
  K: { thumb: true, index: true, middle: true, ring: false, pinky: false },
  L: { thumb: true, index: true, middle: false, ring: false, pinky: false },
  M: { thumb: true, index: false, middle: false, ring: false, pinky: false, isCurved: true },
  N: { thumb: true, index: false, middle: false, ring: false, pinky: false, isCurved: true },
  O: { thumb: true, index: false, middle: false, ring: false, pinky: false, isCurved: true },
  P: { thumb: true, index: true, middle: true, ring: false, pinky: false },
  Q: { thumb: true, index: true, middle: false, ring: false, pinky: false },
  R: { thumb: true, index: true, middle: true, ring: false, pinky: false },
  S: { thumb: true, index: false, middle: false, ring: false, pinky: false },
  T: { thumb: true, index: true, middle: false, ring: false, pinky: false },
  U: { thumb: true, index: true, middle: true, ring: false, pinky: false },
  V: { thumb: true, index: true, middle: true, ring: false, pinky: false },
  W: { thumb: true, index: true, middle: true, ring: true, pinky: true },
  X: { thumb: true, index: true, middle: false, ring: false, pinky: false },
  Y: { thumb: true, index: false, middle: false, ring: false, pinky: true },
  Z: { thumb: true, index: true, middle: false, ring: false, pinky: false }
};

const App: FC = () => {
  const videoeRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const handsRef = useRef<Hands | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const recordedSignsRef = useRef<string[]>([])
  const [currentLetter, setCurrentLetter] = useState<string>('');
  const lastRecognizedRef = useRef<string>('');
  const recognitionTimeoutRef = useRef<number | undefined>(undefined);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [handDistance, setHandDistance] = useState<'too_far' | 'too_close' | 'good' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const processWithGemini = async (landmarks: any) => {
    try {
      console.log('=== GEMINI API REQUEST START ===');
      console.log('🔄 Starting Gemini API request...');
      setIsProcessing(true);
      
      // Enhanced prompt for better ASL recognition
      const prompt = `You are an expert in American Sign Language (ASL) recognition. Analyze these hand landmarks to identify the ASL letter being signed.

Context:
- The landmarks are 21 points representing hand positions in normalized coordinates (0-1)
- (0,0) is top-left, (1,1) is bottom-right of the frame
- Points 0-4: Thumb
- Points 5-8: Index finger
- Points 9-12: Middle finger
- Points 13-16: Ring finger
- Points 17-20: Pinky finger
- Point 0 is the wrist

Key features to analyze:
1. Finger extension: Check if each finger is extended or bent
2. Thumb position: Note if it's extended to the side or bent
3. Hand orientation: Consider palm facing direction
4. Finger spacing: Look at relative positions between fingers

Landmarks data:
${JSON.stringify(landmarks, null, 2)}

Instructions:
1. Analyze the landmarks carefully
2. Consider the relative positions and angles of fingers
3. Respond with ONLY the letter if you're confident (A-Z)
4. Respond with "unknown" if the hand position is unclear or doesn't match any ASL letter
5. Be precise and conservative in recognition

Response format:
Just the letter (A-Z) or "unknown"`;

      console.log('📤 Sending landmarks to Gemini:', {
        landmarksCount: landmarks.length,
        sampleLandmark: landmarks[0]
      });

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const recognizedLetter = response.text().trim();

      console.log('✅ Gemini API response:', recognizedLetter);

      if (recognizedLetter && recognizedLetter !== 'unknown') {
        setCurrentLetter(prev => prev + recognizedLetter);
      }
    } catch (error) {
      console.error('❌ Error in Gemini processing:', error);
    } finally {
      setIsProcessing(false);
      console.log('=== GEMINI API REQUEST END ===');
    }
  };

  const analyzeHandLandmarks = (landmarks: any) => {
    // Get finger states
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];
    const wrist = landmarks[0];

    console.log('🔍 Analyzing hand landmarks:', {
      thumbTip,
      indexTip,
      middleTip,
      ringTip,
      pinkyTip,
      wrist
    });

    // Calculate hand size to determine distance
    const calculateHandSize = () => {
      // Get the bounding box of the hand
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      
      landmarks.forEach((point: any) => {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      });

      // Calculate the size of the hand in the frame
      const width = maxX - minX;
      const height = maxY - minY;
      const size = Math.max(width, height);

      console.log('📏 Hand size calculation:', { width, height, size });

      // Determine if hand is at good distance
      if (size < 0.1) {
        setHandDistance('too_far');
        return false;
      } else if (size > 0.8) {
        setHandDistance('too_close');
        return false;
      } else {
        setHandDistance('good');
        return true;
      }
    };

    // Check if hand is at good distance
    const isGoodDistance = calculateHandSize();
    console.log('📍 Hand distance status:', { isGoodDistance, handDistance });

    if (!isGoodDistance) {
      console.log('⚠️ Hand is not at good distance, skipping recognition');
      return null;
    }

    // Calculate if fingers are extended
    const isFingerExtended = (tip: any, mcp: any, pip: any) => {
      // For thumb, we need to check if it's extended to the side
      if (tip === thumbTip) {
        const isExtended = Math.abs(tip.x - mcp.x) > 0.1;
        console.log('👍 Thumb extension check:', { 
          tipX: tip.x, 
          mcpX: mcp.x, 
          difference: Math.abs(tip.x - mcp.x),
          isExtended 
        });
        return isExtended;
      }
      
      // For other fingers, check if they're extended upward
      const threshold = 0.1;
      const isExtended = tip.y < mcp.y - threshold && tip.y < pip.y - threshold;
      console.log('👆 Finger extension check:', {
        tipY: tip.y,
        mcpY: mcp.y,
        pipY: pip.y,
        isExtended
      });
      return isExtended;
    };

    const fingerStates = {
      thumb: isFingerExtended(thumbTip, landmarks[2], landmarks[3]),
      index: isFingerExtended(indexTip, landmarks[6], landmarks[7]),
      middle: isFingerExtended(middleTip, landmarks[10], landmarks[11]),
      ring: isFingerExtended(ringTip, landmarks[14], landmarks[15]),
      pinky: isFingerExtended(pinkyTip, landmarks[18], landmarks[19]),
      isCurved: false
    };

    console.log('✋ Finger states:', fingerStates);

    // Update debug info
    setDebugInfo({
      fingerStates,
      landmarks: {
        thumbTip,
        indexTip,
        middleTip,
        ringTip,
        pinkyTip,
        wrist
      },
      distances: {
        thumbDistance: Math.abs(thumbTip.x - landmarks[2].x),
        indexDistance: Math.abs(indexTip.y - landmarks[6].y),
        middleDistance: Math.abs(middleTip.y - landmarks[10].y),
        ringDistance: Math.abs(ringTip.y - landmarks[14].y),
        pinkyDistance: Math.abs(pinkyTip.y - landmarks[18].y)
      }
    });

    // Only process with Gemini if recording is active and hand is at good distance
    if (isGoodDistance && isRecording) {
      console.log('🤖 Recording active, sending to Gemini for processing');
      processWithGemini(landmarks);
    }

    return fingerStates;
  };

  const recognizeLetter = (fingerStates: any) => {
    for (const [letter, pattern] of Object.entries(ASL_LETTERS)) {
      if (
        pattern.thumb === fingerStates.thumb &&
        pattern.index === fingerStates.index &&
        pattern.middle === fingerStates.middle &&
        pattern.ring === fingerStates.ring &&
        pattern.pinky === fingerStates.pinky &&
        (!pattern.isCurved || pattern.isCurved === fingerStates.isCurved)
      ) {
        return letter;
      }
    }
    return null;
  };

  const setupHandTracking = () => {
    if (!videoeRef.current || !canvasRef.current) return;

    const hands = new Hands({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
      }
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    hands.onResults((results: Results) => {
      if (!canvasRef.current || !videoeRef.current) return;

      const canvasCtx = canvasRef.current.getContext('2d');
      if (!canvasCtx) return;

      // Clear canvas
      canvasCtx.save();
      canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      canvasCtx.drawImage(results.image, 0, 0, canvasRef.current.width, canvasRef.current.height);

      // Draw hand landmarks
      if (results.multiHandLandmarks) {
        for (const landmarks of results.multiHandLandmarks) {
          drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {
            color: '#00FF00',
            lineWidth: 2
          });
          drawLandmarks(canvasCtx, landmarks, {
            color: '#FF0000',
            lineWidth: 1
          });

          // Process landmarks for ASL recognition
          if (isRecording) {
            const fingerStates = analyzeHandLandmarks(landmarks);
            const recognizedLetter = recognizeLetter(fingerStates);

            if (recognizedLetter) {
              // Add a small delay before recognizing a new letter
              if (recognitionTimeoutRef.current) {
                clearTimeout(recognitionTimeoutRef.current);
              }

              recognitionTimeoutRef.current = window.setTimeout(() => {
                if (recognizedLetter !== lastRecognizedRef.current) {
                  lastRecognizedRef.current = recognizedLetter;
                  setCurrentLetter(prev => prev + recognizedLetter);
                }
              }, 500);
            }
          }
        }
      }
      canvasCtx.restore();
    });

    const camera = new Camera(videoeRef.current, {
      onFrame: async () => {
        if (videoeRef.current) {
          await hands.send({ image: videoeRef.current });
        }
      },
      width: 1280,
      height: 720
    });

    camera.start();
    handsRef.current = hands;
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });
      
      if (videoeRef.current) {
        videoeRef.current.srcObject = stream;
        setupHandTracking();
      }
      
      socketService.connect();
      setIsCameraOpen(true);
    } catch (error) {
      console.error('Error accessing camera:', error);
    }
  };

  const stopCamera = () => {
    if (videoeRef.current?.srcObject) {
      const stream = videoeRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoeRef.current.srcObject = null;
    }
    if (handsRef.current) {
      handsRef.current.close();
    }
    socketService.disconnect();
    setIsCameraOpen(false);
  };

  const toggleCamera = async () => {
    if (isCameraOpen) {
      stopCamera();
    } else {
      await startCamera();
    }
  };

  const sendFrame = () => {
    if (videoeRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoeRef.current.videoWidth;
      canvas.height = videoeRef.current.videoHeight;
      
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(videoeRef.current, 0, 0);
      
      const imageData = canvas.toDataURL('image/jpeg');
      socketService.sendFrame(imageData);
    }
  };

  useEffect(() => {
    let interval: number;
    
    if (isCameraOpen) {
      interval = setInterval(sendFrame, 500); // Send frame every 500ms
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isCameraOpen]);

  const toggleRecording = () => {
    setIsRecording(!isRecording);
    if (!isRecording) {
      recordedSignsRef.current = [];
    }
  };

  const clearText = () => {
    setCurrentLetter('');
    lastRecognizedRef.current = '';
  };

  return (
    <>
    <div className='flex flex-col h-screen'>
      <nav className='flex justify-between items-center p-4 bg-gray-800 text-white'>
        <div className='text-xl font-bold'>Senyas</div>
        <div>Notification</div>
      </nav>
      <div className='flex-1 bg-gray-100'>
        <div className='h-full flex items-center justify-center p-4 gap-8'>
          <div className='relative w-full max-w-3xl aspect-video bg-black rounded-lg overflow-hidden shadow-2xl'>
            <video 
              ref={videoeRef} 
              autoPlay
              playsInline 
              className='w-full h-full object-cover'
              style={{ display: 'none' }}
            />
            <canvas 
              ref={canvasRef}
              className='w-full h-full object-cover'
            />
            {handDistance && (
              <div className={`absolute top-4 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded-full text-white font-medium ${
                handDistance === 'good' ? 'bg-green-500' : 'bg-red-500'
              }`}>
                {handDistance === 'too_far' && 'Move your hand closer'}
                {handDistance === 'too_close' && 'Move your hand further'}
                {handDistance === 'good' && 'Good distance!'}
              </div>
            )}
            {isProcessing && (
              <div className='absolute top-16 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded-full bg-blue-500 text-white font-medium'>
                Processing...
              </div>
            )}
            <div className='absolute bottom-6 left-1/2 transform -translate-x-1/2 flex gap-4'>
              <button 
                onClick={toggleCamera} 
                className='bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-full shadow-lg transition-all duration-200 flex items-center gap-2'
              >
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  className="h-6 w-6" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  {isCameraOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  )}
                </svg>
                <span className='text-lg font-medium'>{isCameraOpen ? 'Stop Camera' : 'Start Camera'}</span>
              </button>
              {isCameraOpen && (
                <>
                  <button 
                    onClick={toggleRecording} 
                    className={`${isRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'} text-white px-6 py-3 rounded-full shadow-lg transition-all duration-200 flex items-center gap-2`}
                  >
                    <svg 
                      xmlns="http://www.w3.org/2000/svg" 
                      className="h-6 w-6" 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      {isRecording ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      )}
                    </svg>
                    <span className='text-lg font-medium'>{isRecording ? 'Stop Recording' : 'Start Recording'}</span>
                  </button>
                  <button 
                    onClick={clearText}
                    className='bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-full shadow-lg transition-all duration-200 flex items-center gap-2'
                  >
                    <svg 
                      xmlns="http://www.w3.org/2000/svg" 
                      className="h-6 w-6" 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    <span className='text-lg font-medium'>Clear Text</span>
                  </button>
                </>
              )}
            </div>
          </div>
          <div className='w-96 h-full flex flex-col'>
            <div className='bg-white rounded-lg shadow-lg p-6 flex-1 overflow-hidden flex flex-col'>
              <h2 className='text-2xl font-bold mb-4 text-gray-800'>Recognized Text</h2>
              <div className='flex-1 overflow-y-auto bg-gray-50 rounded-lg p-4'>
                <p className='text-xl text-gray-700 whitespace-pre-wrap break-words'>{currentLetter || 'No text recognized yet'}</p>
              </div>
              <div className='mt-4 text-sm text-gray-500'>
                {isRecording ? (isProcessing ? 'Processing...' : 'Recording...') : 'Click "Start Recording" to begin'}
              </div>
              {debugInfo && (
                <div className='mt-4 p-4 bg-gray-100 rounded-lg text-sm'>
                  <h3 className='font-semibold mb-2'>Debug Info:</h3>
                  <div className='space-y-1'>
                    <p>Hand Distance: {handDistance}</p>
                    <p>Processing: {isProcessing ? 'Yes' : 'No'}</p>
                    <p>Thumb: {debugInfo.fingerStates.thumb ? 'Extended' : 'Bent'} (Distance: {debugInfo.distances.thumbDistance.toFixed(3)})</p>
                    <p>Index: {debugInfo.fingerStates.index ? 'Extended' : 'Bent'} (Distance: {debugInfo.distances.indexDistance.toFixed(3)})</p>
                    <p>Middle: {debugInfo.fingerStates.middle ? 'Extended' : 'Bent'} (Distance: {debugInfo.distances.middleDistance.toFixed(3)})</p>
                    <p>Ring: {debugInfo.fingerStates.ring ? 'Extended' : 'Bent'} (Distance: {debugInfo.distances.ringDistance.toFixed(3)})</p>
                    <p>Pinky: {debugInfo.fingerStates.pinky ? 'Extended' : 'Bent'} (Distance: {debugInfo.distances.pinkyDistance.toFixed(3)})</p>
                    <p>Curved: {debugInfo.fingerStates.isCurved ? 'Yes' : 'No'}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

// Add HAND_CONNECTIONS constant
const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], // thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // index finger
  [0, 9], [9, 10], [10, 11], [11, 12], // middle finger
  [0, 13], [13, 14], [14, 15], [15, 16], // ring finger
  [0, 17], [17, 18], [18, 19], [19, 20], // pinky
  [0, 5], [5, 9], [9, 13], [13, 17], [0, 17] // palm
];

export default App; 