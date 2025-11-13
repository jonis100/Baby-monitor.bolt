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
  private dbSubscription: ReturnType<typeof supabase.from> | null = null;
  private processedMessageIds = new Set<string>();

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
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Channel subscribed:', roomCode);
          if (this.deviceType === 'baby') {
            this.createOffer();
          } else if (this.deviceType === 'parent') {
            await new Promise(resolve => setTimeout(resolve, 500));
            await this.loadPendingMessages(roomCode);
          }
        }
      });
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
            await this.peerConnection.setRemoteDescription({
              sdp: message.payload.sdp,
              type: message.payload.type as RTCSdpType
            });
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
            await this.peerConnection.setRemoteDescription({
              sdp: message.payload.sdp,
              type: message.payload.type as RTCSdpType
            });
          }
          break;

        case 'ice-candidate':
          if (message.payload.candidate) {
            try {
              await this.peerConnection.addIceCandidate(
                new RTCIceCandidate(message.payload.candidate)
              );
            } catch (e) {
              console.log('ICE candidate error (can be normal):', e);
            }
          }
          break;
      }
    } catch (error) {
      console.error('Error handling signaling message:', error);
    }
  }

  private async loadPendingMessages(roomCode: string) {
    try {
      if (!this.roomId) return;

      const { data } = await supabase
        .from('signaling_messages')
        .select('*')
        .eq('room_id', this.roomId)
        .eq('message_type', 'offer')
        .eq('sender_type', 'baby')
        .order('created_at', { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        const message = data[0];
        console.log('Processing pending offer message');
        this.processedMessageIds.add(message.id);
        await this.handleSignalingMessage({
          senderId: message.sender_id,
          senderType: message.sender_type,
          messageType: message.message_type,
          payload: message.payload as { sdp?: string; type?: string; candidate?: RTCIceCandidateInit }
        });
      }

      this.setupDatabaseListener(roomCode);
    } catch (error) {
      console.error('Error loading pending messages:', error);
    }
  }

  private setupDatabaseListener(roomCode: string) {
    if (!this.roomId) return;

    supabase
      .from(`signaling_messages:room_id=eq.${this.roomId}`)
      .on('*', (payload) => {
        if (payload.eventType === 'INSERT') {
          const message = payload.new as any;
          if (!this.processedMessageIds.has(message.id)) {
            this.processedMessageIds.add(message.id);
            console.log('New message from database:', message.message_type);
            this.handleSignalingMessage({
              senderId: message.sender_id,
              senderType: message.sender_type,
              messageType: message.message_type,
              payload: message.payload as { sdp?: string; type?: string; candidate?: RTCIceCandidateInit }
            });
          }
        }
      })
      .subscribe();
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

    if (this.dbSubscription) {
      await this.dbSubscription.unsubscribe();
      this.dbSubscription = null;
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
