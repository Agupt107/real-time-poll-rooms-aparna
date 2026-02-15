import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { createPollRouter } from "./routes/poll.routes";

const app = express();
const httpServer = createServer(app);

const corsOrigin =
  process.env.NODE_ENV === "production" && process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL
    : "*";

// Socket.io attached to same HTTP server so WebSocket upgrade and HTTP share one port.
const io = new Server(httpServer, {
  cors: { origin: corsOrigin },
});

// Why rooms: Only viewers of a given poll get that poll's updates. Without rooms we'd have to
// broadcast to everyone and let clients filter, or maintain per-poll channel state ourselves.
// Rooms achieve scoped delivery: io.to(`poll_${pollId}`).emit(...) sends only to that room.
// How this achieves real-time: After a vote we emit "voteUpdate" to the room; all clients in
// the room receive the new poll state immediately over the WebSocket—no page refresh or polling.
// Why this is better than polling: Polling (e.g. setInterval + GET poll) wastes requests, adds
// latency (up to the interval delay), and increases server load. WebSockets push updates instantly
// and only when something changes.
io.on("connection", (socket) => {
  socket.on("joinPoll", (pollId: string) => {
    if (typeof pollId === "string" && pollId) {
      socket.join(`poll_${pollId}`);
    }
  });
});

app.use(cors({ origin: corsOrigin }));
app.use(express.json());

app.use("/api/polls", createPollRouter(io));

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT ?? 3001;

httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
