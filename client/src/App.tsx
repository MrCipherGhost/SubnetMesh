import { useEffect, useRef, useState, type FormEvent } from 'react';
import { socket } from './lib/socket';
import { showDesktopNotice } from './notify';
import { ScreenStage } from './ScreenStage';
import { ToastStack, useToasts } from './Toasts';
import { WebRTCManager } from './webrtc/WebRTCManager';

type Message = { id: string; name: string; text: string; time: number };
type Member = { id: string; name: string; voice: boolean; screen?: boolean };
type ChannelInfo = { name: string; locked: boolean };
type Session = { name: string; room: string; password?: string };
const defaultChannels: ChannelInfo[] = [
  { name: 'general', locked: false },
  { name: 'engineering', locked: false },
  { name: 'random', locked: false },
];

export default function App() {
  const [name, setName] = useState('');
  const [room, setRoom] = useState('general');
  const [joined, setJoined] = useState(false);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [channels, setChannels] = useState<ChannelInfo[]>(defaultChannels);
  const [text, setText] = useState('');
  const [voice, setVoice] = useState(false);
  const [muted, setMuted] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [localScreen, setLocalScreen] = useState<MediaStream | null>(null);
  const [remoteScreens, setRemoteScreens] = useState<Record<string, MediaStream>>({});
  const [screenExpanded, setScreenExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [newChannel, setNewChannel] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [passwordPrompt, setPasswordPrompt] = useState<{ room: string } | null>(null);
  const [joinPassword, setJoinPassword] = useState('');
  const manager = useRef<WebRTCManager | null>(null);
  const session = useRef<Session | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const membersRef = useRef<Member[]>([]);
  const channelsRef = useRef<ChannelInfo[]>(defaultChannels);
  const joinedRef = useRef(false);
  const skipMemberToast = useRef(true);
  const { toasts, push, dismiss } = useToasts();

  useEffect(() => { joinedRef.current = joined; }, [joined]);
  useEffect(() => {
    if (localScreen || Object.keys(remoteScreens).length > 0) setScreenExpanded(true);
    else setScreenExpanded(false);
  }, [localScreen, remoteScreens]);

  useEffect(() => {
    const rtc = new WebRTCManager(socket, setError);
    rtc.setScreenHandlers(
      (peerId, stream) => {
        setRemoteScreens(current => {
          if (!stream) {
            if (!(peerId in current)) return current;
            const next = { ...current };
            delete next[peerId];
            return next;
          }
          return { ...current, [peerId]: stream };
        });
      },
      stream => {
        setLocalScreen(stream);
        setSharing(Boolean(stream));
      },
    );
    manager.current = rtc;
    const onConnect = () => {
      setConnected(true);
      if (session.current) {
        skipMemberToast.current = true;
        socket.timeout(5000).emitWithAck('room:join', session.current)
          .then(result => {
            if (result.error) { setError(result.error); setJoined(false); }
            else {
              setMessages(result.messages);
              setJoined(true);
              if (result.channels) setChannels(result.channels);
              push('Reconnected to channel', 'ok');
            }
          }).catch(() => { setError('Could not rejoin room.'); setJoined(false); });
      } else {
        push('Connected to server', 'ok');
      }
    };
    const onDisconnect = () => {
      setConnected(false); setJoined(false); setVoice(false); setMuted(false); setSharing(false);
      setBusy(false); setMembers([]); setLocalScreen(null); setRemoteScreens({});
      membersRef.current = []; rtc.leave();
      push('Disconnected from server', 'warn');
    };
    const onMessage = (message: Message) => {
      setMessages(current => [...current, message].slice(-200));
      if (!joinedRef.current || message.name === session.current?.name) return;
      const preview = message.text.length > 48 ? `${message.text.slice(0, 48)}…` : message.text;
      push(`${message.name}: ${preview}`, 'info');
      showDesktopNotice(`${message.name} · #${session.current?.room ?? 'channel'}`, message.text);
    };
    const onMembers = (next: Member[]) => {
      const prev = membersRef.current;
      if (joinedRef.current && !skipMemberToast.current) {
        for (const member of next) {
          const before = prev.find(m => m.id === member.id);
          if (!before) push(`${member.name} joined the channel`, 'info');
          else if (!before.voice && member.voice) push(`${member.name} joined voice`, 'ok');
          else if (before.voice && !member.voice) push(`${member.name} left voice`, 'info');
          else if (!before.screen && member.screen) push(`${member.name} started screen share`, 'ok');
          else if (before.screen && !member.screen) {
            push(`${member.name} stopped screen share`, 'info');
            setRemoteScreens(current => {
              if (!(member.id in current)) return current;
              const next = { ...current };
              delete next[member.id];
              return next;
            });
          }
        }
        for (const member of prev) {
          if (!next.some(m => m.id === member.id)) push(`${member.name} left the channel`, 'info');
        }
      }
      skipMemberToast.current = false;
      membersRef.current = next;
      setMembers(next);
    };
    const onError = () => { setError('Cannot connect to the local server.'); push('Cannot reach local server', 'warn'); };
    const onChannels = (list: ChannelInfo[]) => {
      const prev = channelsRef.current;
      if (prev.length > 0) {
        for (const channel of list) {
          if (!prev.some(c => c.name === channel.name)) {
            push(`Channel #${channel.name} created${channel.locked ? ' (locked)' : ''}`, 'ok');
          }
        }
      }
      channelsRef.current = list;
      setChannels(list);
    };
    const onScreenReplaced = (data: { by?: string }) => {
      const who = typeof data?.by === 'string' && data.by.trim() ? data.by.trim() : 'someone else';
      push(`Your screen share was replaced by ${who}`, 'warn');
    };
    socket.on('connect', onConnect); socket.on('disconnect', onDisconnect);
    socket.on('chat:message', onMessage); socket.on('room:members', onMembers); socket.on('connect_error', onError);
    socket.on('channels:list', onChannels);
    socket.on('screen:replaced', onScreenReplaced);
    socket.connect();
    return () => {
      rtc.destroy(); manager.current = null;
      socket.off('connect', onConnect); socket.off('disconnect', onDisconnect);
      socket.off('chat:message', onMessage); socket.off('room:members', onMembers); socket.off('connect_error', onError);
      socket.off('channels:list', onChannels);
      socket.off('screen:replaced', onScreenReplaced);
      socket.disconnect();
    };
  }, [push]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function joinRoom(nextRoom: string, password?: string) {
    if (!name.trim() || !connected || busy) return;
    manager.current?.leave(); setVoice(false); setMuted(false); setSharing(false);
    setLocalScreen(null); setRemoteScreens({}); setBusy(true); setError('');
    skipMemberToast.current = true;
    try {
      const identity: Session = { name: name.trim(), room: nextRoom, password: password || undefined };
      const result = await socket.timeout(5000).emitWithAck('room:join', identity);
      if (result.error) throw new Error(result.error);
      session.current = identity;
      setRoom(nextRoom); setMessages(result.messages); setJoined(true);
      if (result.channels) setChannels(result.channels);
      setPasswordPrompt(null); setJoinPassword('');
      push(`Joined #${nextRoom}`, 'ok');
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        void Notification.requestPermission();
      }
    } catch (error) { setError(String(error)); }
    finally { setBusy(false); }
  }

  function selectChannel(channel: ChannelInfo) {
    if (!name.trim() || !connected || busy) return;
    if (channel.locked) {
      if (session.current?.room === channel.name && session.current.password) {
        void joinRoom(channel.name, session.current.password);
        return;
      }
      setPasswordPrompt({ room: channel.name });
      setJoinPassword('');
      setError('');
      return;
    }
    void joinRoom(channel.name);
  }

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    if (!passwordPrompt) return;
    await joinRoom(passwordPrompt.room, joinPassword);
  }

  async function createNewChannel(event: FormEvent) {
    event.preventDefault();
    if (!connected || busy || !newChannel.trim()) return;
    setBusy(true); setError('');
    try {
      const result = await socket.timeout(5000).emitWithAck('channel:create', {
        name: newChannel.trim(),
        password: newPassword.trim(),
      });
      if (result.error) throw new Error(result.error);
      if (result.channels) setChannels(result.channels);
      const created = result.channel?.name ?? newChannel.trim().toLowerCase();
      const password = newPassword.trim();
      setNewChannel(''); setNewPassword(''); setShowCreate(false);
      if (name.trim()) await joinRoom(created, password || undefined);
      else setRoom(created);
    } catch (error) { setError(String(error)); }
    finally { setBusy(false); }
  }

  async function toggleVoice() {
    if (voice) {
      manager.current?.leave(); setVoice(false); setMuted(false); setSharing(false);
      setLocalScreen(null); setRemoteScreens({});
      push('Left voice', 'info');
      return;
    }
    setBusy(true); setError('');
    try {
      if (await manager.current?.join()) {
        setVoice(true); setMuted(false);
        push('Joined voice', 'ok');
      }
    }
    catch (error) { setError(String(error)); }
    finally { setBusy(false); }
  }

  async function toggleScreen() {
    if (!voice || busy) return;
    setBusy(true); setError('');
    try {
      if (sharing) {
        await manager.current?.stopScreen();
        push('Stopped screen share', 'info');
      } else {
        await manager.current?.startScreen();
        push('Sharing your screen', 'ok');
      }
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError')) {
        push('Screen share cancelled', 'info');
      } else {
        setError(String(error));
      }
    } finally {
      setBusy(false);
    }
  }

  const remoteShareEntries = Object.entries(remoteScreens);
  const screenMember = members.find(m => m.screen);
  const remoteLabel = screenMember?.name
    ?? (remoteShareEntries[0] ? members.find(m => m.id === remoteShareEntries[0][0])?.name : undefined)
    ?? 'Someone';
  const activeScreen = localScreen ?? remoteShareEntries[0]?.[1] ?? null;
  const screenIsSelf = Boolean(localScreen);

  return <div className="app">
    <ToastStack toasts={toasts} onDismiss={dismiss} />
    <aside><h1>SM</h1><p className="sub">LAN voice. No cloud.</p>
      <label>Callsign<input value={name} maxLength={40} disabled={joined} onChange={e => setName(e.target.value)} placeholder="Your name" /></label>
      <h2>Channels</h2>
      <div className="channel-list">
        {channels.map(channel =>
          <button
            key={channel.name}
            className={room === channel.name && joined ? 'channel selected' : 'channel'}
            disabled={!connected || busy || !name.trim()}
            onClick={() => selectChannel(channel)}
          >
            <span># {channel.name}</span>
            {channel.locked && <span className="lock" title="Password protected">pwd</span>}
          </button>)}
      </div>
      <button type="button" className="create-toggle" disabled={!connected || busy} onClick={() => setShowCreate(v => !v)}>
        {showCreate ? 'Cancel' : 'New channel'}
      </button>
      {showCreate && (
        <form className="create-channel" onSubmit={event => void createNewChannel(event)}>
          <label>Name<input value={newChannel} maxLength={24} onChange={e => setNewChannel(e.target.value)} placeholder="squad-chat" /></label>
          <label>Password <span className="optional">(optional)</span>
            <input type="password" value={newPassword} maxLength={64} onChange={e => setNewPassword(e.target.value)} placeholder="Leave blank for open" autoComplete="new-password" />
          </label>
          <button disabled={!connected || busy || !newChannel.trim()}>Create</button>
        </form>
      )}
      <p className="status">{connected ? '● Server connected' : '○ Connecting…'}</p>
    </aside>
    <main><header><div><h2># {room}{channels.find(c => c.name === room)?.locked ? ' · locked' : ''}</h2><span>{members.length} members · Local network chat</span></div>
      {joined && <div className="controls"><button disabled={busy || !connected} onClick={() => void toggleVoice()}>{busy ? 'Please wait…' : voice ? 'Leave voice' : 'Join voice'}</button>
      {voice && <>
        <button onClick={() => { manager.current?.mute(!muted); setMuted(!muted); push(muted ? 'Unmuted' : 'Muted', 'info'); }}>{muted ? 'Unmute' : 'Mute'}</button>
        <button disabled={busy} onClick={() => void toggleScreen()}>{sharing ? 'Stop share' : 'Share screen'}</button>
        <button onClick={() => manager.current?.enableAudio()}>Enable audio</button>
      </>}</div>}
    </header>
    {error && <div role="alert" className="error">{error}<button onClick={() => setError('')}>Dismiss</button></div>}
    {passwordPrompt && (
      <form className="password-prompt" onSubmit={event => void submitPassword(event)}>
        <span>Password for #{passwordPrompt.room}</span>
        <input
          type="password"
          value={joinPassword}
          maxLength={64}
          autoFocus
          placeholder="Channel password"
          autoComplete="current-password"
          onChange={e => setJoinPassword(e.target.value)}
        />
        <button disabled={busy || !joinPassword.trim()}>Join</button>
        <button type="button" onClick={() => { setPasswordPrompt(null); setJoinPassword(''); }}>Cancel</button>
      </form>
    )}
    <ScreenStage
      stream={activeScreen}
      label={remoteLabel}
      self={screenIsSelf}
      onStop={() => void toggleScreen()}
      expanded={screenExpanded}
      onExpanded={setScreenExpanded}
    />
    {!screenExpanded && (
      <>
        <section className="messages" aria-label="Messages" aria-live="polite">
          {!joined ? <div className="welcome"><h2>Drop into a channel</h2><p>Enter your callsign and pick a channel to start.</p></div> : messages.length === 0 ? <p className="sub">No messages yet. Say hello!</p> : messages.map(message =>
            <article key={message.id}><div className="avatar">{message.name[0]?.toUpperCase()}</div><div><strong>{message.name}</strong><time>{new Date(message.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><p>{message.text}</p></div></article>)}<div ref={end}/>
        </section>
        <form className="composer" onSubmit={event => { event.preventDefault(); if (text.trim() && joined && connected) { socket.emit('chat:send', text); setText(''); } }}>
          <input aria-label="Message" placeholder={`Message #${room}`} maxLength={4000} disabled={!joined || !connected} value={text} onChange={e => setText(e.target.value)}/><button disabled={!joined || !connected || !text.trim()}>Send</button>
        </form>
      </>
    )}
    </main>
    <aside className="rail">
      <section className="people">
        <h2>People</h2>
        {members.map(member => <p key={member.id}><span className="dot">{member.voice ? '●' : '○'}</span> {member.name}{member.id === socket.id ? ' (you)' : ''}<small>{member.screen ? 'Sharing screen' : member.voice ? 'In voice' : 'Text chat'}</small></p>)}
        <p className="sub">Voice supports up to six people. One screen share at a time — a new share replaces the current one. Only the sharer can stop it.</p>
      </section>
    </aside>
  </div>;
}
