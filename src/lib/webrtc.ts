import { supabase } from './supabase';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

export class WebRTCManager {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private roomId: string | null = null;
  private deviceId: string;
  private deviceType: 'baby' | 'parent';
  private onRemoteStreamCallback?: (stream: MediaStream) => void;
  private onConnectionStateCallback?: (state: string) => void;
  private signalingChannel: ReturnType<typeof supabase.channel> | null = null;

  constructor(deviceType: 'baby' | 'parent') {
    this.deviceType = deviceType;
    this.deviceId = `${deviceType}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async startLocalStream(): Promise<MediaStream> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
      return this.localStream;
    } catch (error) {
      console.error('Error accessing microphone:', error);
      throw new Error('Failed to access microphone. Please grant permission and try again.');
    }
  }

  async connectToRoom(roomCode: string, roomId: string) {
    this.roomId = roomId;

    this.peerConnection = new RTCPeerConnection({
      iceServers: ICE_SERVERS
    });

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignalingMessage('ice-candidate', {
          candidate: event.candidate.toJSON()
        });
      }
    };

    this.peerConnection.ontrack = (event) => {
      if (this.onRemoteStreamCallback && event.streams[0]) {
        this.onRemoteStreamCallback(event.streams[0]);
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState || 'unknown';
      if (this.onConnectionStateCallback) {
        this.onConnectionStateCallback(state);
      }
    };

    if (this.localStream && this.deviceType === 'baby') {
      this.localStream.getTracks().forEach(track => {
        if (this.localStream && this.peerConnection) {
          this.peerConnection.addTrack(track, this.localStream);
        }
      });
    }

    this.signalingChannel = supabase.channel(`room:${roomCode}`)
      .on('broadcast', { event: 'signaling' }, async (payload) => {
        await this.handleSignalingMessage(payload.payload);
      })
      .subscribe();

    if (this.deviceType === 'baby') {
      await this.createOffer();
    }
  }

  private async createOffer() {
    if (!this.peerConnection) return;

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    this.sendSignalingMessage('offer', {
      sdp: offer.sdp,
      type: offer.type
    });
  }

  private async handleSignalingMessage(message: {
    senderId: string;
    senderType: string;
    messageType: string;
    payload: { sdp?: string; type?: string; candidate?: RTCIceCandidateInit };
  }) {
    if (!this.peerConnection || message.senderId === this.deviceId) return;

    try {
      switch (message.messageType) {
        case 'offer':
          if (this.deviceType === 'parent' && message.payload.sdp) {
            await this.peerConnection.setRemoteDescription(
              new RTCSessionDescription({
                sdp: message.payload.sdp,
                type: message.payload.type as RTCSdpType
              })
            );
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            this.sendSignalingMessage('answer', {
              sdp: answer.sdp,
              type: answer.type
            });
          }
          break;

        case 'answer':
          if (this.deviceType === 'baby' && message.payload.sdp) {
            await this.peerConnection.setRemoteDescription(
              new RTCSessionDescription({
                sdp: message.payload.sdp,
                type: message.payload.type as RTCSdpType
              })
            );
          }
          break;

        case 'ice-candidate':
          if (message.payload.candidate) {
            await this.peerConnection.addIceCandidate(
              new RTCIceCandidate(message.payload.candidate)
            );
          }
          break;
      }
    } catch (error) {
      console.error('Error handling signaling message:', error);
    }
  }

  private async sendSignalingMessage(messageType: string, payload: unknown) {
    if (!this.signalingChannel) return;

    await this.signalingChannel.send({
      type: 'broadcast',
      event: 'signaling',
      payload: {
        senderId: this.deviceId,
        senderType: this.deviceType,
        messageType,
        payload
      }
    });

    if (this.roomId) {
      await supabase.from('signaling_messages').insert({
        room_id: this.roomId,
        sender_type: this.deviceType,
        sender_id: this.deviceId,
        message_type: messageType,
        payload: payload
      });
    }
  }

  onRemoteStream(callback: (stream: MediaStream) => void) {
    this.onRemoteStreamCallback = callback;
  }

  onConnectionStateChange(callback: (state: string) => void) {
    this.onConnectionStateCallback = callback;
  }

  stopLocalStream() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
  }

  async disconnect() {
    if (this.signalingChannel) {
      await this.signalingChannel.unsubscribe();
      this.signalingChannel = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.stopLocalStream();
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }
}
