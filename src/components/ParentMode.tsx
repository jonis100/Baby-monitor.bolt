import { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, Wifi, WifiOff, Play } from 'lucide-react';
import { WebRTCManager } from '../lib/webrtc';
import { AudioAnalyzer, SoundEvent } from '../lib/audioAnalyzer';
import { joinRoom, updateRoomStatus, requestWakeLock, requestNotificationPermission, sendNotification } from '../lib/roomUtils';
import QRScanner from './QRScanner';

export default function ParentMode() {
  const [isListening, setIsListening] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<string>('disconnected');
  const [currentVolume, setCurrentVolume] = useState(0);
  const [soundEvent, setSoundEvent] = useState<SoundEvent>('silent');
  const [isMuted, setIsMuted] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const webrtcRef = useRef<WebRTCManager | null>(null);
  const analyzerRef = useRef<AudioAnalyzer | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const roomIdRef = useRef<string>('');
  const lastNotificationRef = useRef<SoundEvent | null>(null);

  useEffect(() => {
    return () => {
      stopListening();
    };
  }, []);

  useEffect(() => {
    if (soundEvent === 'crying' || soundEvent === 'coughing') {
      if (lastNotificationRef.current !== soundEvent) {
        const title = soundEvent === 'crying' ? 'Baby is Crying!' : 'Coughing Detected';
        const body = soundEvent === 'crying'
          ? 'Your baby needs attention'
          : 'Your baby is coughing';

        sendNotification(title, body);
        lastNotificationRef.current = soundEvent;
      }
    } else {
      lastNotificationRef.current = null;
    }
  }, [soundEvent]);

  const startListening = async (code: string) => {
    try {
      const normalizedCode = code.toUpperCase().trim();
      const roomId = await joinRoom(normalizedCode);
      roomIdRef.current = roomId;

      await requestNotificationPermission();

      webrtcRef.current = new WebRTCManager('parent');

      webrtcRef.current.onRemoteStream((stream) => {
        if (!audioRef.current) {
          audioRef.current = new Audio();
          audioRef.current.autoplay = true;
        }
        audioRef.current.srcObject = stream;
        audioRef.current.play().catch(e => console.error('Audio play error:', e));

        analyzerRef.current = new AudioAnalyzer();
        analyzerRef.current.initialize(stream);

        analyzerRef.current.onVolume((volume) => {
          setCurrentVolume(volume);
        });

        analyzerRef.current.onSoundEvent((event) => {
          setSoundEvent(event);
        });
      });

      webrtcRef.current.onConnectionStateChange((state) => {
        setConnectionStatus(state);
      });

      await webrtcRef.current.connectToRoom(normalizedCode, roomId);

      await updateRoomStatus(roomId, { parent_count: 1 });

      wakeLockRef.current = await requestWakeLock();

      setIsListening(true);
      setRoomCode(normalizedCode);
    } catch (error) {
      console.error('Failed to start listening:', error);
      alert(error instanceof Error ? error.message : 'Failed to connect to room');
    }
  };

  const stopListening = async () => {
    if (webrtcRef.current) {
      await webrtcRef.current.disconnect();
      webrtcRef.current = null;
    }

    if (analyzerRef.current) {
      analyzerRef.current.stop();
      analyzerRef.current = null;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
      audioRef.current = null;
    }

    if (wakeLockRef.current) {
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
    }

    if (roomIdRef.current) {
      await updateRoomStatus(roomIdRef.current, { parent_count: 0 });
      roomIdRef.current = '';
    }

    setIsListening(false);
    setRoomCode('');
    setConnectionStatus('disconnected');
    setCurrentVolume(0);
    setSoundEvent('silent');
  };

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomCode.trim()) {
      startListening(roomCode);
    }
  };

  const handleQRScan = (code: string) => {
    setShowScanner(false);
    setRoomCode(code);
    startListening(code);
  };

  const getSoundEventColor = () => {
    switch (soundEvent) {
      case 'crying': return 'bg-red-500';
      case 'coughing': return 'bg-yellow-500';
      case 'loud': return 'bg-orange-500';
      case 'normal': return 'bg-green-500';
      case 'silent': return 'bg-gray-400';
      default: return 'bg-gray-400';
    }
  };

  const getSoundEventText = () => {
    switch (soundEvent) {
      case 'crying': return 'Crying Detected!';
      case 'coughing': return 'Coughing Detected';
      case 'loud': return 'Loud Noise';
      case 'normal': return 'Normal Sound';
      case 'silent': return 'Silent';
      default: return 'Listening';
    }
  };

  if (showScanner) {
    return <QRScanner onScan={handleQRScan} onClose={() => setShowScanner(false)} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-purple-100 rounded-full mb-4">
            <Volume2 className="w-10 h-10 text-purple-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Baby Monitor</h1>
          <p className="text-gray-600">Parent Device Mode</p>
        </div>

        {!isListening ? (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Enter Room Code
                </label>
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                  maxLength={6}
                  className="w-full px-6 py-4 text-2xl text-center font-bold tracking-wider border-2 border-gray-300 rounded-2xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all uppercase"
                />
              </div>

              <button
                type="submit"
                disabled={roomCode.length !== 6}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-6 px-8 rounded-2xl transition-all transform hover:scale-105 active:scale-95 flex items-center justify-center gap-3 text-xl shadow-lg"
              >
                <Play className="w-8 h-8" />
                Start Listening
              </button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-gray-500">or</span>
              </div>
            </div>

            <button
              onClick={() => setShowScanner(true)}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-4 px-6 rounded-2xl transition-all"
            >
              Scan QR Code
            </button>
          </>
        ) : (
          <>
            <div className="bg-gradient-to-r from-purple-500 to-pink-600 rounded-2xl p-6 text-white space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium opacity-90">Connected to</span>
                <div className="flex items-center gap-2">
                  {connectionStatus === 'connected' ? (
                    <Wifi className="w-5 h-5" />
                  ) : (
                    <WifiOff className="w-5 h-5 opacity-60" />
                  )}
                </div>
              </div>
              <div className="text-4xl font-bold tracking-wider text-center">
                {roomCode}
              </div>
              <div className="text-xs text-center opacity-75">
                {connectionStatus === 'connected' ? 'Receiving audio stream' : 'Connecting...'}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">Audio Level</span>
                <span className="text-xs text-gray-500">{Math.round(currentVolume * 100)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-6 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-purple-400 to-pink-500 h-full rounded-full transition-all duration-150"
                  style={{ width: `${currentVolume * 100}%` }}
                />
              </div>
            </div>

            <div className={`${getSoundEventColor()} rounded-2xl p-6 text-white text-center transform transition-all duration-300 ${soundEvent === 'crying' ? 'animate-pulse' : ''}`}>
              <div className="font-bold text-xl">{getSoundEventText()}</div>
              <div className="text-sm opacity-90 mt-1">
                {soundEvent === 'crying' && 'Check on your baby'}
                {soundEvent === 'coughing' && 'Baby might need attention'}
                {soundEvent === 'loud' && 'Loud sound detected'}
                {soundEvent === 'normal' && 'Everything is normal'}
                {soundEvent === 'silent' && 'All quiet'}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={toggleMute}
                className={`flex-1 ${isMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-600 hover:bg-gray-700'} text-white font-bold py-4 px-6 rounded-2xl transition-all transform hover:scale-105 active:scale-95 flex items-center justify-center gap-2 shadow-lg`}
              >
                {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
                {isMuted ? 'Unmute' : 'Mute'}
              </button>

              <button
                onClick={stopListening}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-4 px-6 rounded-2xl transition-all transform hover:scale-105 active:scale-95 shadow-lg"
              >
                Disconnect
              </button>
            </div>
          </>
        )}

        <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-600 text-center space-y-1">
          <p className="font-medium">Privacy Notice</p>
          <p>Audio is streamed live and never recorded or stored. Connection is peer-to-peer and encrypted.</p>
        </div>
      </div>
    </div>
  );
}
