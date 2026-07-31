import { useEffect, useState } from "react";
import { LiveKitRoom, VideoConference, RoomAudioRenderer } from "@livekit/components-react";
import "@livekit/components-styles";
import { livekitService } from "../../services/livekit.service";

export function RoomVideoGrid({ roomId }: { roomId: string }) {
  const [conn, setConn] = useState<{ token: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    
    livekitService.getJoinToken(roomId)
      .then((res) => {
        if (isMounted) setConn({ token: res.token, url: res.url });
      })
      .catch((e) => {
        // Extract detail from Axios error response when available
        const detail =
          e?.response?.data?.detail ??
          e?.message ??
          "Error obteniendo token de vídeo";
        if (isMounted) setError(detail);
      });

    return () => {
      isMounted = false;
    };
  }, [roomId]);

  if (error) return (
    <div className="p-6 h-full flex flex-col items-center justify-center bg-gray-900 rounded-xl text-center gap-3">
      <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
      </svg>
      <p className="text-gray-400 text-sm font-medium">Video no disponible</p>
      <p className="text-gray-600 text-xs max-w-xs">{error}</p>
    </div>
  );
  if (!conn) return (
    <div className="flex items-center justify-center h-full bg-gray-50 rounded-xl" role="status">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mr-3"></div>
      <span className="text-gray-500">Conectando vídeo…</span>
    </div>
  );

  return (
    <LiveKitRoom
      token={conn.token}
      serverUrl={conn.url}
      connect={true}
      video={true}
      audio={true}
      data-lk-theme="default"
      style={{ height: "100%", minHeight: "60vh", borderRadius: "0.75rem", overflow: "hidden" }}
    >
      <VideoConference />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}
