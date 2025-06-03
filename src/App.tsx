import { FC, useState, useRef, useEffect } from 'react'
import { socketService } from './socket';


const App: FC = () => {
  const videoeRef = useRef<HTMLVideoElement>(null)
  const [isCameraOpen, setIsCameraOpen] = useState(false)

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });
      
      if (videoeRef.current) {
        videoeRef.current.srcObject = stream;
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

  return (
    <>
    <div className='flex flex-col h-screen'>
    <nav className='flex justify-between items-center p-4 bg-gray-300'>
        <div>Senyas</div>
     
          <div>Notification</div>
        
      </nav>
    <div className='flex  h-screen bg-gray-100'>
      <div className='text-4xl font-bold text-center w-2/3 bg-gray-200'>
        <div className='flex flex-col justify-center items-center h-full'>
          <div>Video Camera Part</div>
          <div>
            <video ref={videoeRef}  autoPlay
  playsInline className='w-full h-full object-cover' />
            <button onClick={toggleCamera} className='bg-blue-500 text-white p-2 rounded-md'>
             <p className='text-white'>{isCameraOpen ? 'Close Camera' : 'Open Camera'}</p>
            </button>
          </div>

        </div>
      </div>
      


    </div>
    </div>
    
 
      
    </>
  );
}

export default App; 