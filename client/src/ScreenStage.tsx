import { useEffect, useRef, useState } from 'react';

type Props = {
  stream: MediaStream | null;
  label: string;
  self?: boolean;
  onStop?: () => void;
  expanded: boolean;
  onExpanded: (value: boolean) => void;
};

export function ScreenStage({ stream, label, self, onStop, expanded, onExpanded }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const [fill, setFill] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => undefined);
    return () => { video.srcObject = null; };
  }, [stream]);

  useEffect(() => {
    if (!stream) onExpanded(false);
  }, [stream, onExpanded]);

  async function toggleFullscreen() {
    const node = stageRef.current;
    if (!node) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await node.requestFullscreen();
    } catch { /* browser may block */ }
  }

  if (!stream) return null;

  return (
    <section
      ref={stageRef}
      className={`screen-stage${expanded ? ' expanded' : ''}${fill ? ' fill' : ''}`}
      aria-label="Screen share"
    >
      <div className="screen-toolbar">
        <span>{self ? 'You are sharing' : `${label} is sharing`}</span>
        <div className="screen-actions">
          <button type="button" onClick={() => setFill(v => !v)}>{fill ? 'Fit' : 'Fill'}</button>
          <button type="button" onClick={() => onExpanded(!expanded)}>{expanded ? 'Shrink' : 'Expand'}</button>
          <button type="button" onClick={() => void toggleFullscreen()}>Fullscreen</button>
          {self && onStop && <button type="button" className="screen-stop" onClick={onStop}>Stop</button>}
        </div>
      </div>
      <div className="screen-frame">
        <video
          ref={videoRef}
          className="screen-video"
          autoPlay
          playsInline
          muted={Boolean(self)}
          onDoubleClick={() => void toggleFullscreen()}
        />
      </div>
    </section>
  );
}
