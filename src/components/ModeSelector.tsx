import { Baby, Users } from 'lucide-react';

interface ModeSelectorProps {
  onSelectMode: (mode: 'baby' | 'parent') => void;
}

export default function ModeSelector({ onSelectMode }: ModeSelectorProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex flex-col items-center justify-center p-6">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-5xl font-bold text-gray-800 mb-2">Baby Monitor</h1>
          <p className="text-xl text-gray-600">
            Choose your device role to get started
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <button
            onClick={() => onSelectMode('baby')}
            className="group bg-white hover:bg-blue-50 rounded-3xl shadow-xl hover:shadow-2xl p-10 transition-all transform hover:scale-105 active:scale-95 border-2 border-transparent hover:border-blue-500"
          >
            <div className="flex flex-col items-center space-y-6">
              <div className="w-24 h-24 bg-blue-100 group-hover:bg-blue-200 rounded-full flex items-center justify-center transition-colors">
                <Baby className="w-12 h-12 text-blue-600" />
              </div>
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold text-gray-800">Baby Device</h2>
                <p className="text-gray-600">
                  Place this device near your baby to stream audio
                </p>
              </div>
              <div className="bg-blue-100 group-hover:bg-blue-200 text-blue-700 px-6 py-2 rounded-full text-sm font-semibold transition-colors">
                Start Monitoring
              </div>
            </div>
          </button>

          <button
            onClick={() => onSelectMode('parent')}
            className="group bg-white hover:bg-purple-50 rounded-3xl shadow-xl hover:shadow-2xl p-10 transition-all transform hover:scale-105 active:scale-95 border-2 border-transparent hover:border-purple-500"
          >
            <div className="flex flex-col items-center space-y-6">
              <div className="w-24 h-24 bg-purple-100 group-hover:bg-purple-200 rounded-full flex items-center justify-center transition-colors">
                <Users className="w-12 h-12 text-purple-600" />
              </div>
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold text-gray-800">Parent Device</h2>
                <p className="text-gray-600">
                  Listen to your baby's audio in real-time
                </p>
              </div>
              <div className="bg-purple-100 group-hover:bg-purple-200 text-purple-700 px-6 py-2 rounded-full text-sm font-semibold transition-colors">
                Start Listening
              </div>
            </div>
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 space-y-4">
          <h3 className="font-bold text-gray-800 text-lg">How it works</h3>
          <ul className="space-y-2 text-gray-600 text-sm">
            <li className="flex items-start gap-2">
              <span className="text-blue-500 font-bold">1.</span>
              <span>Select "Baby Device" on the device near your baby</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 font-bold">2.</span>
              <span>A unique room code will be generated</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 font-bold">3.</span>
              <span>On your parent device, select "Parent Device" and enter the code or scan the QR code</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 font-bold">4.</span>
              <span>Start monitoring with real-time audio streaming and sound detection</span>
            </li>
          </ul>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-600 text-center">
          <p className="font-medium mb-1">Privacy & Security</p>
          <p>All audio is streamed peer-to-peer with encryption. Nothing is recorded or stored on any server.</p>
        </div>
      </div>
    </div>
  );
}
