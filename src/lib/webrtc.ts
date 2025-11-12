import { supabase } from './supabase';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

export class WebRTCManager {
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private localStream: MediaStream | null = null;
  private roomId: string | null = null;
  private deviceId: string;
  private deviceType: 'baby' | 'parent';
  private onRemoteStreamCallback?: (stream: MediaStream) => void;
  private onConnectionStateCallback?: (state: string) => void;
  private signalingChannel: ReturnType<typeof supabase.channel> | null = null;
  private dbSubscription: ReturnType<typeof supabase.from> | null = null;
  private processedMessageIds = new Set<string>();
  private remoteDescriptionSet: Map<string, boolean> = new Map();

  constructor(deviceType: 'baby' | 'parent') {
    this.deviceType = deviceType;
    this.deviceId = `${deviceType}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getPeerConnection(peerId: string = 'default'): RTCPeerConnection {
    if (!this.peerConnections.has(peerId)) {
      const pc = new RTCPeerConnection({
        iceServers: ICE_SERVERS
      });

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.sendSignalingMessage('ice-candidate', {
            candidate: event.candidate.toJSON(),
            targetPeerId: peerId
          });
        }
      };

      pc.ontrack = (event) => {
        if (this.onRemoteStreamCallback && event.streams[0]) {
          this.onRemoteStreamCallback(event.streams[0]);
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState || 'unknown';
        if (this.onConnectionStateCallback) {
          this.onConnectionStateCallback(state);
        }
      };

      this.peerConnections.set(peerId, pc);
    }

    return this.peerConnections.get(peerId)!;
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
    this.processedMessageIds.clear();
    this.remoteDescriptionSet.clear();

    const pc = this.getPeerConnection('default');

    if (this.localStream && this.deviceType === 'baby') {
      this.localStream.getTracks().forEach(track => {
        if (this.localStream && pc) {
          pc.addTrack(track, this.localStream);
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
    const pc = this.getPeerConnection('default');

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    this.sendSignalingMessage('offer', {
      sdp: offer.sdp,
      type: offer.type
    });
  }

  private async handleSignalingMessage(message: {
    senderId: string;
    senderType: string;
    messageType: string;
    payload: { sdp?: string; type?: string; candidate?: RTCIceCandidateInit; targetPeerId?: string };
  }) {
    if (message.senderId === this.deviceId) return;

    const peerId = message.senderId;
    const pc = this.getPeerConnection(peerId);

    try {
      switch (message.messageType) {
        case 'offer':
          if (this.deviceType === 'parent' && message.payload.sdp) {
            if (!this.remoteDescriptionSet.get(peerId)) {
              await pc.setRemoteDescription({
                sdp: message.payload.sdp,
                type: message.payload.type as RTCSdpType
              });
              this.remoteDescriptionSet.set(peerId, true);
            }
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            this.sendSignalingMessage('answer', {
              sdp: answer.sdp,
              type: answer.type,
              parentId: this.deviceId
            });
          }
          break;

        case 'answer':
          if (this.deviceType === 'baby' && message.payload.sdp) {
            if (!this.remoteDescriptionSet.get(peerId)) {
              await pc.setRemoteDescription({
                sdp: message.payload.sdp,
                type: message.payload.type as RTCSdpType
              });
              this.remoteDescriptionSet.set(peerId, true);
              console.log('Baby: Remote description set from parent', peerId);
            }
          }
          break;

        case 'ice-candidate':
          if (message.payload.candidate) {
            try {
              await pc.addIceCandidate(
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

    this.dbSubscription = supabase
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

    this.peerConnections.forEach((pc) => {
      pc.close();
    });
    this.peerConnections.clear();

    this.stopLocalStream();
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }
}
