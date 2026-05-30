// Wraps the MJPEG <img> in an aspect-ratio container. Because the dev server
// proxies /video to the drone, the browser treats this as same-origin and
// the session cookie is sent automatically — no token-in-URL hack required.
export function VideoPanel() {
  return (
    <div className="overflow-hidden rounded-lg bg-black">
      <div className="grid aspect-video place-items-center">
        <img src="/video" alt="camera" className="h-full w-full object-contain" />
      </div>
    </div>
  );
}
