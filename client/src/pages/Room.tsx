import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { normalizeRoomCode, ROOM_CODE_LENGTH } from '../../../shared/protocol';
import { BelowScreen } from '../components/room/BelowScreen';
import { Connecting, NamePrompt, StatusScreen } from '../components/room/Gates';
import { RoomHeader } from '../components/room/RoomHeader';
import { Screen } from '../components/room/Screen';
import { Sidebar } from '../components/room/Sidebar';
import { leaveRoom, useRoomSession } from '../hooks/useRoomSession';
import { session } from '../lib/session';
import { useRoom } from '../state/room';

export function Room() {
  const params = useParams();
  const code = normalizeRoomCode(params.code ?? '');
  const [name, setName] = useState(() => session.getName() || null);

  if (code.length !== ROOM_CODE_LENGTH) return <Navigate to="/" replace />;
  if (!name) {
    return (
      <NamePrompt
        code={code}
        onSubmit={(n) => {
          session.setName(n);
          setName(n);
        }}
      />
    );
  }
  return <RoomSession code={code} name={name} />;
}

function RoomSession({ code, name }: { code: string; name: string }) {
  const navigate = useNavigate();
  // Bumping the key remounts the session — used for "try again" / "use it here".
  const [attempt, setAttempt] = useState(0);
  return <RoomView key={attempt} code={code} name={name} onRetry={() => setAttempt((a) => a + 1)} onLeave={() => {
    leaveRoom(code);
    navigate('/');
  }} />;
}

function RoomView({ code, name, onRetry, onLeave }: { code: string; name: string; onRetry: () => void; onLeave: () => void }) {
  useRoomSession(code, name);
  const status = useRoom((s) => s.status);
  const error = useRoom((s) => s.error);
  const joinedOnce = useRoom((s) => s.youId !== null);

  if (status === 'connecting' && !joinedOnce) return <Connecting code={code} />;
  if (status === 'not_found' || status === 'removed' || status === 'full') return <StatusScreen status={status} code={code} />;
  if (status === 'replaced' || status === 'error') {
    return <StatusScreen status={status} code={code} message={error?.message} onRetry={onRetry} />;
  }

  return (
    <div className="flex h-dvh flex-col">
      <RoomHeader onLeave={onLeave} />
      {/* Mobile: one scrolling column (player, then sidebar). Desktop: two independent panes. */}
      <div className="scrollbar-thin flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <main className="scrollbar-thin shrink-0 lg:min-h-0 lg:flex-1 lg:shrink lg:overflow-y-auto">
          <div className="mx-auto max-w-[1180px] space-y-5 p-3 sm:p-5 lg:p-6">
            <Screen />
            <BelowScreen />
          </div>
        </main>
        <div className="h-[75dvh] shrink-0 border-t border-line lg:h-auto lg:w-[360px] lg:border-t-0 lg:border-l xl:w-[380px]">
          <Sidebar />
        </div>
      </div>
    </div>
  );
}
