import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Wifi, WifiOff, Activity } from 'lucide-react';
import { WebRTCManager } from '../lib/webrtc';
import { AudioAnalyzer, SoundEvent } from '../lib/audioAnalyzer';
import { createRoom, updateRoomStatus, requestWakeLock } from '../lib/roomUtils';
import QRCodeDisplay from './QRCodeDisplay';

export default function BabyMode() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [roomCode, setRoomCode] = useState<string>('');
  const [connectionStatus, setConnectionStatus] = useState<string>('disconnected');
  const [currentVolume, setCurrentVolume] = useState(0);
  const [soundEvent, setSoundEvent] = useState<SoundEvent>('silent');

  const webrtcRef = useRef<WebRTCManager | null>(null);
  const analyzerRef = useRef<AudioAnalyzer | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const roomIdRef = useRef<string>('');

  useEffect(() => {
    return () => {
      stopStreaming();
    };
  }, []);

  const startStreaming = async () => {
    try {
      const room = await createRoom();
      setRoomCode(room.roomCode);
      roomIdRef.current = room.roomId;

      webrtcRef.current = new WebRTCManager('baby');
      const stream = await webrtcRef.current.startLocalStream();

      analyzerRef.current = new AudioAnalyzer();
      await analyzerRef.current.initialize(stream);

      analyzerRef.current.onVolume((volume) => {
        setCurrentVolume(volume);
      });

      analyzerRef.current.onSoundEvent((event) => {
        setSoundEvent(event);
      });

      await webrtcRef.current.connectToRoom(room.roomCode, room.roomId);

      webrtcRef.current.onConnectionStateChange((state) => {
        setConnectionStatus(state);
      });

      await updateRoomStatus(room.roomId, { baby_connected: true });

      wakeLockRef.current = await requestWakeLock();

      setIsStreaming(true);
    } catch (error) {
      console.error('Failed to start streaming:', error);
      alert(error instanceof Error ? error.message : 'Failed to start streaming');
    }
  };

  const stopStreaming = async () => {
    if (webrtcRef.current) {
      await webrtcRef.current.disconnect();
      webrtcRef.current = null;
    }

    if (analyzerRef.current) {
      analyzerRef.current.stop();
      analyzerRef.current = null;
    }

    if (wakeLockRef.current) {
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
    }

    if (roomIdRef.current) {
      await updateRoomStatus(roomIdRef.current, { baby_connected: false });
      roomIdRef.current = '';
    }

    setIsStreaming(false);
    setRoomCode('');
    setConnectionStatus('disconnected');
    setCurrentVolume(0);
    setSoundEvent('silent');
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
      case 'crying': return 'Crying Detected';
      case 'coughing': return 'Coughing Detected';
      case 'loud': return 'Loud Noise';
      case 'normal': return 'Normal Sound';
      case 'silent': return 'Silent';
      default: return 'Listening';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-100 rounded-full mb-4">
            <Activity className="w-10 h-10 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Baby Monitor</h1>
          <p className="text-gray-600">Baby Device Mode</p>
        </div>

        {!isStreaming ? (
          <button
            onClick={startStreaming}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-6 px-8 rounded-2xl transition-all transform hover:scale-105 active:scale-95 flex items-center justify-center gap-3 text-xl shadow-lg"
          >
            <Mic className="w-8 h-8" />
            Start Monitoring
          </button>
        ) : (
          <>
            <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl p-6 text-white space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium opacity-90">Room Code</span>
                <div className="flex items-center gap-2">
                  {connectionStatus === 'connected' ? (
                    <Wifi className="w-5 h-5" />
                  ) : (
                    <WifiOff className="w-5 h-5 opacity-60" />
                  )}
                </div>
              </div>
              <div className="text-5xl font-bold tracking-wider text-center py-4">
                {roomCode}
              </div>
              <div className="text-xs text-center opacity-75">
                {connectionStatus === 'connected' ? 'Parent Connected' : 'Waiting for parent...'}
              </div>
            </div>

            <QRCodeDisplay roomCode={roomCode} />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">Audio Level</span>
                <span className="text-xs text-gray-500">{Math.round(currentVolume * 100)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-green-400 to-blue-500 h-full rounded-full transition-all duration-150"
                  style={{ width: `${currentVolume * 100}%` }}
                />
              </div>
            </div>

            <div className={`${getSoundEventColor()} rounded-2xl p-6 text-white text-center transform transition-all duration-300`}>
              <div className="font-bold text-xl">{getSoundEventText()}</div>
              <div className="text-sm opacity-90 mt-1">Audio analysis active</div>
            </div>

            <button
              onClick={stopStreaming}
              className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-6 px-8 rounded-2xl transition-all transform hover:scale-105 active:scale-95 flex items-center justify-center gap-3 text-xl shadow-lg"
            >
              <MicOff className="w-8 h-8" />
              Stop Monitoring
            </button>
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
