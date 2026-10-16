import type { Socket } from 'socket.io-client';

type Signal = { sender: string; type: 'offer' | 'answer' | 'ice'; payload: RTCSessionDescriptionInit & RTCIceCandidateInit };
type ScreenHandler = (peerId: string, stream: MediaStream | null) => void;

export class WebRTCManager {
  private stream?: MediaStream;
  private screenStream?: MediaStream;
  private peers = new Map<string, RTCPeerConnection>();
  private audio = new Map<string, HTMLAudioElement>();
  private candidates = new Map<string, RTCIceCandidateInit[]>();
  private queues = new Map<string, Promise<void>>();
  private generation = 0;
  private active = false;
  private sharing = false;
  private onRemoteScreen: ScreenHandler = () => undefined;
  private onLocalScreen: (stream: MediaStream | null) => void = () => undefined;

  constructor(private socket: Socket, private report: (message: string) => void) {
    socket.on('signal', this.onSignal);
    socket.on('voice:left', this.remove);
    socket.on('screen:replaced', this.onReplaced);
  }

  setScreenHandlers(remote: ScreenHandler, local: (stream: MediaStream | null) => void) {
    this.onRemoteScreen = remote;
    this.onLocalScreen = local;
  }

  isSharing() {
    return this.sharing;
  }

  async join() {
    const generation = ++this.generation;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access requires HTTPS or localhost.');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    if (generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); return false; }
    this.stream = stream;
    this.active = true;
    try {
      const result = await this.socket.timeout(5000).emitWithAck('voice:join') as { peers?: string[]; error?: string };
      if (generation !== this.generation) return false;
      if (result.error) throw new Error(result.error);
      for (const id of result.peers ?? []) {
        const peer = this.create(id);
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        if (generation !== this.generation) return false;
        this.send(id, 'offer', peer.localDescription);
      }
      return true;
    } catch (error) {
      if (generation === this.generation) this.leave();
      throw error;
    }
  }

  async startScreen() {
    if (!this.active) throw new Error('Join voice before sharing your screen.');
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Screen sharing is not supported in this browser.');
    if (this.sharing) return true;
    const result = await this.socket.timeout(5000).emitWithAck('screen:start') as { error?: string };
    if (result.error) throw new Error(result.error);
    let display: MediaStream;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
    } catch (error) {
      this.socket.emit('screen:stop');
      throw error;
    }
    const video = display.getVideoTracks()[0];
    if (!video) {
      display.getTracks().forEach(t => t.stop());
      this.socket.emit('screen:stop');
      throw new Error('No screen video track available.');
    }
    video.addEventListener('ended', () => { void this.stopScreen(); });
    this.screenStream = display;
    this.sharing = true;
    this.onLocalScreen(display);
    for (const [id, peer] of this.peers) {
      peer.addTrack(video, display);
      await this.renegotiate(id, peer);
    }
    return true;
  }

  async stopScreen(options?: { replaced?: boolean }) {
    if (!this.sharing && !this.screenStream) return;
    const stream = this.screenStream;
    const wasActive = this.active;
    const replaced = Boolean(options?.replaced);
    this.screenStream = undefined;
    this.sharing = false;
    this.onLocalScreen(null);
    if (this.socket.connected && !replaced) this.socket.emit('screen:stop');
    if (stream) {
      for (const track of stream.getTracks()) {
        if (wasActive) {
          for (const peer of this.peers.values()) {
            for (const sender of peer.getSenders()) {
              if (sender.track === track) peer.removeTrack(sender);
            }
          }
        }
        track.stop();
      }
    }
    if (wasActive) {
      for (const [id, peer] of this.peers) await this.renegotiate(id, peer);
    }
  }

  private onReplaced = () => {
    if (!this.sharing && !this.screenStream) return;
    void this.stopScreen({ replaced: true });
  };

  private clearScreenLocal() {
    this.screenStream?.getTracks().forEach(track => track.stop());
    this.screenStream = undefined;
    this.sharing = false;
    this.onLocalScreen(null);
  }

  private async renegotiate(id: string, peer: RTCPeerConnection) {
    if (!this.active) return;
    try {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      this.send(id, 'offer', peer.localDescription);
    } catch (error) {
      this.report(`Screen share renegotiation failed: ${String(error)}`);
    }
  }

  private send(target: string, type: string, payload: unknown) {
    this.socket.emit('signal', { target, type, payload });
  }

  private attachLocalTracks(peer: RTCPeerConnection) {
    this.stream?.getTracks().forEach(track => peer.addTrack(track, this.stream!));
    this.screenStream?.getTracks().forEach(track => peer.addTrack(track, this.screenStream!));
  }

  private create(id: string) {
    const existing = this.peers.get(id);
    if (existing) return existing;
    const peer = new RTCPeerConnection({ iceServers: [] });
    this.peers.set(id, peer);
    this.attachLocalTracks(peer);
    peer.onicecandidate = event => { if (event.candidate) this.send(id, 'ice', event.candidate.toJSON()); };
    peer.ontrack = event => {
      if (event.track.kind === 'video') {
        const media = event.streams[0] ?? new MediaStream([event.track]);
        this.onRemoteScreen(id, media);
        event.track.addEventListener('ended', () => this.onRemoteScreen(id, null));
        event.track.addEventListener('mute', () => {
          if (event.track.readyState === 'ended') this.onRemoteScreen(id, null);
        });
        return;
      }
      let audio = this.audio.get(id);
      if (!audio) {
        audio = document.createElement('audio');
        audio.autoplay = true;
        document.body.appendChild(audio);
        this.audio.set(id, audio);
      }
      audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
      void audio.play().catch(() => this.report('Click Enable audio to allow voice playback.'));
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'failed') this.report('Voice connection failed. Leave and rejoin voice; check LAN firewall and Wi-Fi isolation.');
      if (peer.connectionState === 'closed' || peer.connectionState === 'failed' || peer.connectionState === 'disconnected') {
        this.onRemoteScreen(id, null);
      }
    };
    return peer;
  }

  private onSignal = (data: Signal) => {
    if (!this.active) return;
    const generation = this.generation;
    const pending = this.queues.get(data.sender) ?? Promise.resolve();
    const next = pending.then(async () => {
      if (!this.active || generation !== this.generation) return;
      await this.handle(data);
    }).catch(error => {
      if (this.active && generation === this.generation) this.report(`Voice: ${String(error)}`);
    });
    this.queues.set(data.sender, next);
  };

  private async handle({ sender, type, payload }: Signal) {
    if (type === 'ice') {
      const peer = this.peers.get(sender);
      if (peer?.remoteDescription) await peer.addIceCandidate(payload);
      else this.candidates.set(sender, [...(this.candidates.get(sender) ?? []), payload]);
      return;
    }
    const peer = type === 'offer' ? this.create(sender) : this.peers.get(sender);
    if (!peer) return;
    await peer.setRemoteDescription(payload);
    for (const candidate of this.candidates.get(sender) ?? []) await peer.addIceCandidate(candidate);
    this.candidates.delete(sender);
    if (type === 'offer') {
      await peer.setLocalDescription(await peer.createAnswer());
      this.send(sender, 'answer', peer.localDescription);
    }
  }

  mute(value: boolean) { this.stream?.getAudioTracks().forEach(track => { track.enabled = !value; }); }
  enableAudio() { this.audio.forEach(audio => { void audio.play().catch(() => this.report('Browser blocked audio playback.')); }); }

  private remove = (id: string) => {
    const peer = this.peers.get(id);
    if (peer) { peer.ontrack = null; peer.onicecandidate = null; peer.onconnectionstatechange = null; peer.close(); }
    this.peers.delete(id);
    const audio = this.audio.get(id);
    if (audio) { audio.pause(); audio.srcObject = null; audio.remove(); }
    this.audio.delete(id);
    this.candidates.delete(id);
    this.queues.delete(id);
    this.onRemoteScreen(id, null);
  };

  leave() {
    ++this.generation;
    this.active = false;
    if (this.sharing && this.socket.connected) this.socket.emit('screen:stop');
    this.clearScreenLocal();
    if (this.socket.connected) this.socket.emit('voice:leave');
    [...this.peers.keys()].forEach(this.remove);
    this.candidates.clear(); this.queues.clear();
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = undefined;
  }

  destroy() {
    this.leave();
    this.socket.off('signal', this.onSignal);
    this.socket.off('voice:left', this.remove);
    this.socket.off('screen:replaced', this.onReplaced);
  }
}
