import express, { Router, Request, Response } from "express";
import { z } from "zod";
import { Server as SocketIOServer } from "socket.io";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { hashIp } from "../utils/hash";

// require() used so ts-node resolves the package (ESM exports can fail with moduleResolution: "node")
const rateLimit = require("express-rate-limit") as (options: Record<string, unknown>) => express.RequestHandler;

// Rate limiting: prevents rapid repeated voting attempts (e.g. scripts hammering the vote endpoint).
// Limitation: applies per IP; does not stop a single extra vote from a different IP or after clearing storage.
const voteRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: "Too many vote attempts. Try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

type PollWithOptions = Prisma.PollGetPayload<{ include: { options: true } }>;

function paramString(
  params: Record<string, string | string[] | undefined>,
  key: string
): string {
  const v = params[key];
  return typeof v === "string" ? v : Array.isArray(v) ? v[0] ?? "" : "";
}

const createPollSchema = z.object({
  question: z.string().min(1, "Question is required"),
  options: z.array(z.string().min(1)).min(2, "At least 2 options are required"),
});

const voteSchema = z.object({
  optionId: z.string().uuid(),
  fingerprint: z.string().min(1, "Fingerprint is required"),
});

export function createPollRouter(io: SocketIOServer): Router {
  const router = Router();

  router.post("/", async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = createPollSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten().fieldErrors });
        return;
      }
      const { question, options } = parsed.data;

      const poll = await prisma.poll.create({
        data: {
          question,
          options: {
            create: options.map((text) => ({ text })),
          },
        },
        include: {
          options: true,
        },
      });

      const baseUrl =
        process.env.FRONTEND_URL ?? process.env.APP_URL ?? "http://localhost:3000";
      const shareableLink = `${baseUrl.replace(/\/$/, "")}/poll/${poll.id}`;

      res.status(201).json({ ...poll, shareableLink });
    } catch (err) {
      res.status(500).json({ error: "Failed to create poll" });
    }
  });

  router.get("/:id", async (req: Request, res: Response): Promise<void> => {
    try {
      const id = paramString(req.params, "id");
      const poll = await prisma.poll.findUnique({
        where: { id },
        include: { options: true },
      });

      if (!poll) {
        res.status(404).json({ error: "Poll not found" });
        return;
      }

      res.json(poll);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch poll" });
    }
  });

  // One vote per browser: fingerprint (voterId) is required; DB has @@unique([pollId, fingerprint]).
  // Prevents: duplicate votes from the same browser/device (same localStorage).
  // Limitation: user can clear localStorage or use incognito/another device to vote again.
  //
  // One vote per IP: we store hashedIp; DB has @@unique([pollId, hashedIp]).
  // Prevents: multiple votes from the same IP (e.g. one network).
  // Limitation: VPN/proxy changes IP; NAT can make many users share one IP (only one vote per poll for that IP).
  router.post("/:id/vote", voteRateLimiter, async (req: Request, res: Response): Promise<void> => {
    try {
      const pollId = paramString(req.params, "id");
      if (!pollId) {
        res.status(400).json({ error: "Invalid poll ID" });
        return;
      }
      const parsed = voteSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten().fieldErrors });
        return;
      }
      const { optionId, fingerprint } = parsed.data;

      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? "";
      const hashedIp = hashIp(ip);

      const poll: PollWithOptions | null = await prisma.poll.findUnique({
        where: { id: pollId },
        include: { options: true },
      });

      if (!poll) {
        res.status(404).json({ error: "Poll not found" });
        return;
      }

      const optionBelongsToPoll = poll.options.some((o) => o.id === optionId);
      if (!optionBelongsToPoll) {
        res.status(400).json({ error: "Option does not belong to this poll" });
        return;
      }

      await prisma.$transaction(async (tx) => {
        await tx.vote.create({
          data: {
            pollId,
            optionId,
            hashedIp,
            fingerprint,
          },
        });
        await tx.option.update({
          where: { id: optionId },
          data: { voteCount: { increment: 1 } },
        });
      });

      const updatedPoll = await prisma.poll.findUniqueOrThrow({
        where: { id: pollId },
        include: { options: true },
      });

      // Emit to room so only users viewing this poll get updates (real-time, no polling).
      io.to(`poll_${pollId}`).emit("voteUpdate", updatedPoll);
      res.json(updatedPoll);
    } catch (err) {
      const prismaErr = err as { code?: string };
      if (prismaErr.code === "P2002") {
        res.status(409).json({ error: "Already voted" });
        return;
      }
      res.status(500).json({ error: "Failed to record vote" });
    }
  });

  return router;
}
