export type SoundEvent = 'crying' | 'coughing' | 'loud' | 'normal' | 'silent';

export class AudioAnalyzer {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private animationFrameId: number | null = null;
  private onVolumeCallback?: (volume: number) => void;
  private onSoundEventCallback?: (event: SoundEvent) => void;

  private volumeHistory: number[] = [];
  private readonly HISTORY_SIZE = 30;
  private readonly CRYING_THRESHOLD = 0.6;
  private readonly LOUD_THRESHOLD = 0.5;
  private readonly CRYING_DURATION = 10;
  private readonly COUGH_DURATION = 3;

  async initialize(stream: MediaStream) {
    this.audioContext = new AudioContext();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;

    const bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(bufferLength);

    this.source = this.audioContext.createMediaStreamSource(stream);
    this.source.connect(this.analyser);

    this.startAnalysis();
  }

  private startAnalysis() {
    const analyze = () => {
      if (!this.analyser || !this.dataArray) return;

      this.analyser.getByteTimeDomainData(this.dataArray);

      let sum = 0;
      for (let i = 0; i < this.dataArray.length; i++) {
        const normalized = (this.dataArray[i] - 128) / 128;
        sum += normalized * normalized;
      }

      const rms = Math.sqrt(sum / this.dataArray.length);
      const volume = Math.min(1, rms * 3);

      this.volumeHistory.push(volume);
      if (this.volumeHistory.length > this.HISTORY_SIZE) {
        this.volumeHistory.shift();
      }

      if (this.onVolumeCallback) {
        this.onVolumeCallback(volume);
      }

      this.detectSoundEvent(volume);

      this.animationFrameId = requestAnimationFrame(analyze);
    };

    analyze();
  }

  private detectSoundEvent(currentVolume: number) {
    if (this.volumeHistory.length < this.HISTORY_SIZE) return;

    const avgVolume = this.volumeHistory.reduce((a, b) => a + b, 0) / this.volumeHistory.length;
    const recentVolumes = this.volumeHistory.slice(-this.CRYING_DURATION);
    const recentAvg = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;

    let event: SoundEvent = 'normal';

    if (avgVolume < 0.05) {
      event = 'silent';
    } else if (recentAvg > this.CRYING_THRESHOLD && this.isSustained(recentVolumes, this.CRYING_THRESHOLD)) {
      event = 'crying';
    } else if (currentVolume > this.LOUD_THRESHOLD && this.isShortBurst()) {
      event = 'coughing';
    } else if (currentVolume > this.LOUD_THRESHOLD) {
      event = 'loud';
    }

    if (this.onSoundEventCallback) {
      this.onSoundEventCallback(event);
    }
  }

  private isSustained(volumes: number[], threshold: number): boolean {
    const aboveThreshold = volumes.filter(v => v > threshold).length;
    return aboveThreshold / volumes.length > 0.7;
  }

  private isShortBurst(): boolean {
    const recent = this.volumeHistory.slice(-this.COUGH_DURATION);
    const beforeRecent = this.volumeHistory.slice(-this.COUGH_DURATION * 2, -this.COUGH_DURATION);

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const beforeAvg = beforeRecent.reduce((a, b) => a + b, 0) / beforeRecent.length;

    return recentAvg > this.LOUD_THRESHOLD && beforeAvg < 0.3;
  }

  onVolume(callback: (volume: number) => void) {
    this.onVolumeCallback = callback;
  }

  onSoundEvent(callback: (event: SoundEvent) => void) {
    this.onSoundEventCallback = callback;
  }

  stop() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
