import { can } from '../../../shared/roles';
import { actions } from '../lib/actions';
import { useMyRole } from '../state/room';
import { toast } from '../state/toasts';

/**
 * One entry point for "the user wants X to happen". Host/moderators act
 * directly; participants file a request for staff to approve; viewers are
 * told why nothing happened. The server enforces the same rules regardless.
 */
export function usePlaybackIntent() {
  const role = useMyRole();
  const direct = can(role, 'playback');
  const canAsk = can(role, 'request');

  const blocked = () =>
    toast('Viewers can’t change playback', { body: 'Ask the host to make you a participant if you want to send requests.' });

  return {
    role,
    direct,
    canAsk,
    canInteract: direct || canAsk,
    play: (time?: number) => (direct ? actions.play(time) : canAsk ? actions.request('play') : blocked()),
    pause: (time?: number) => (direct ? actions.pause(time) : canAsk ? actions.request('pause') : blocked()),
    seek: (time: number) => (direct ? actions.seek(time) : canAsk ? actions.request('seek', { time }) : blocked()),
    changeVideo: (videoId: string, start?: number) =>
      can(role, 'change_video')
        ? actions.changeVideo(videoId, start)
        : canAsk
          ? actions.request('change_video', { videoId, start })
          : blocked(),
  };
}
