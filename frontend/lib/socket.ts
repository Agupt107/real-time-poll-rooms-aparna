import { io, Socket } from "socket.io-client";

const baseURL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  if (typeof window === "undefined") return null;
  if (!socket) {
    socket = io(baseURL);
  }
  return socket;
}

/** Emit joinPoll so server adds this client to room poll_<pollId>; only that room gets voteUpdate. */
export function joinPollRoom(pollId: string): void {
  const s = getSocket();
  if (s) s.emit("joinPoll", pollId);
}
