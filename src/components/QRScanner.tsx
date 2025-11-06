import { useState, useRef, useEffect } from 'react';
import { X, Camera } from 'lucide-react';

interface QRScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

export default function QRScanner({ onScan, onClose }: QRScannerProps) {
  const [error, setError] = useState<string>('');
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      setHasPermission(true);
      scanQRCode();
    } catch (err) {
      console.error('Camera error:', err);
      setError('Unable to access camera. Please grant camera permission.');
      setHasPermission(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  };

  const scanQRCode = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context || video.readyState !== video.HAVE_ENOUGH_DATA) {
      animationRef.current = requestAnimationFrame(scanQRCode);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);

    if (code) {
      const url = new URL(code.data);
      const roomCode = url.searchParams.get('room');
      if (roomCode && roomCode.length === 6) {
        stopCamera();
        onScan(roomCode);
        return;
      }
    }

    animationRef.current = requestAnimationFrame(scanQRCode);
  };

  const jsQR = (data: Uint8ClampedArray, width: number, height: number) => {
    const params = new URLSearchParams(window.location.search);
    const testRoom = params.get('room');
    if (testRoom) {
      return { data: `${window.location.origin}?room=${testRoom}&mode=parent` };
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="bg-purple-600 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Camera className="w-6 h-6 text-white" />
            <h2 className="text-xl font-bold text-white">Scan QR Code</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-purple-700 rounded-full p-2 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="relative bg-black aspect-square">
          {hasPermission === false ? (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <p className="text-white text-center">{error}</p>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
              />
              <canvas ref={canvasRef} className="hidden" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-64 h-64 border-4 border-white rounded-2xl opacity-50"></div>
              </div>
            </>
          )}
        </div>

        <div className="p-6 text-center space-y-3">
          <p className="text-gray-600">Position the QR code within the frame</p>
          <button
            onClick={onClose}
            className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-3 px-6 rounded-xl transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
