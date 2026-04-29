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
        if (isMounted) setError(e.message ?? "Error obteniendo token");
      });

    return () => {
      isMounted = false;
    };
  }, [roomId]);

  if (error) return <div className="p-4 text-red-600 h-full flex items-center justify-center bg-white rounded-xl border border-red-100">{error}</div>;
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
