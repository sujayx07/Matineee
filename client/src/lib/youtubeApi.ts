let loading: Promise<typeof YT> | null = null;

/** Loads the YouTube IFrame Player API once per page. */
export function loadYouTubeApi(): Promise<typeof YT> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    tag.onerror = () => {
      loading = null;
      reject(new Error('YouTube player failed to load'));
    };
    document.head.appendChild(tag);
  });
  return loading;
}

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
  }
}
