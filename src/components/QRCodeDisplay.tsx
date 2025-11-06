import { QRCodeSVG } from 'qrcode.react';

interface QRCodeDisplayProps {
  roomCode: string;
}

export default function QRCodeDisplay({ roomCode }: QRCodeDisplayProps) {
  const url = `${window.location.origin}?room=${roomCode}&mode=parent`;

  return (
    <div className="bg-white rounded-2xl p-6 border-2 border-dashed border-gray-300 space-y-3">
      <p className="text-sm font-medium text-gray-600 text-center">
        Scan to connect as parent
      </p>
      <div className="flex justify-center">
        <div className="bg-white p-4 rounded-xl">
          <QRCodeSVG value={url} size={200} level="H" />
        </div>
      </div>
    </div>
  );
}
