import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RoomVideoGrid } from "@/components/rooms/RoomVideoGrid";
import { livekitService } from "@/services/livekit.service";

vi.mock("@/services/livekit.service", () => ({
  livekitService: {
    getJoinToken: vi.fn(),
  },
}));

vi.mock("@livekit/components-react", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  LiveKitRoom: ({ children, token, serverUrl }: any) => (
    <div data-testid="lk-room" data-token={token} data-url={serverUrl}>
      {children}
    </div>
  ),
  VideoConference: () => <div data-testid="lk-video-conference">VideoConference</div>,
  RoomAudioRenderer: () => <div data-testid="lk-audio-renderer">RoomAudioRenderer</div>,
}));

describe("RoomVideoGrid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows connecting state initially", () => {
    vi.mocked(livekitService.getJoinToken).mockReturnValue(new Promise(() => {}));
    
    render(<RoomVideoGrid roomId="room1" />);
    
    expect(screen.getByText("Conectando vídeo…")).toBeInTheDocument();
  });

  it("renders LiveKitRoom with token on success", async () => {
    vi.mocked(livekitService.getJoinToken).mockResolvedValue({
      token: "fake-token",
      url: "wss://fake-url",
      room_name: "room1",
    });

    render(<RoomVideoGrid roomId="room1" />);

    await waitFor(() => {
      const room = screen.getByTestId("lk-room");
      expect(room).toBeInTheDocument();
      expect(room).toHaveAttribute("data-token", "fake-token");
      expect(room).toHaveAttribute("data-url", "wss://fake-url");
      expect(screen.getByTestId("lk-video-conference")).toBeInTheDocument();
      expect(screen.getByTestId("lk-audio-renderer")).toBeInTheDocument();
    });
  });

  it("shows error on failure", async () => {
    vi.mocked(livekitService.getJoinToken).mockRejectedValue(new Error("Token failed"));

    render(<RoomVideoGrid roomId="room1" />);

    await waitFor(() => {
      expect(screen.getByText("Token failed")).toBeInTheDocument();
    });
  });
});
