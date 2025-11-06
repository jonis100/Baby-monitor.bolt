import { useState, useEffect } from 'react';
import ModeSelector from './components/ModeSelector';
import BabyMode from './components/BabyMode';
import ParentMode from './components/ParentMode';

type Mode = 'selector' | 'baby' | 'parent';

function App() {
  const [mode, setMode] = useState<Mode>('selector');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlMode = params.get('mode');
    const roomCode = params.get('room');

    if (urlMode === 'parent' && roomCode) {
      setMode('parent');
    }
  }, []);

  const handleModeSelect = (selectedMode: 'baby' | 'parent') => {
    setMode(selectedMode);
  };

  if (mode === 'baby') {
    return <BabyMode />;
  }

  if (mode === 'parent') {
    return <ParentMode />;
  }

  return <ModeSelector onSelectMode={handleModeSelect} />;
}

export default App;
