"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  getPoll,
  vote as voteApi,
  getOrCreateFingerprint,
  type Poll,
} from "@/lib/api";
import { getSocket, joinPollRoom } from "@/lib/socket";

export default function PollPage() {
  const params = useParams();
  const pollId = typeof params.id === "string" ? params.id : params.id?.[0] ?? "";

  const [poll, setPoll] = useState<Poll | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [votingOptionId, setVotingOptionId] = useState<string | null>(null);

  const fetchPoll = useCallback(async () => {
    if (!pollId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getPoll(pollId);
      setPoll(data);
    } catch {
      setError("Poll not found.");
    } finally {
      setLoading(false);
    }
  }, [pollId]);

  useEffect(() => {
    fetchPoll();
  }, [fetchPoll]);

  // Real-time updates: connect to socket, join room poll_<pollId>, listen for voteUpdate.
  // When anyone votes, server emits to this room so we get new poll data without refetch or polling.
  // Clean up listener on unmount to avoid leaks and duplicate handlers.
  useEffect(() => {
    if (!pollId || !poll) return;
    const socket = getSocket();
    if (!socket) return;
    joinPollRoom(pollId);
    const onVoteUpdate = (updatedPoll: Poll) => {
      setPoll(updatedPoll);
    };
    socket.on("voteUpdate", onVoteUpdate);
    return () => {
      socket.off("voteUpdate", onVoteUpdate);
    };
  }, [pollId, poll?.id]);

  // Call POST vote API only; do not refetch poll—socket voteUpdate will update UI for everyone.
  const handleVote = async (optionId: string) => {
    if (!pollId || hasVoted || votingOptionId) return;
    setVotingOptionId(optionId);
    const fingerprint = getOrCreateFingerprint();
    try {
      const updated = await voteApi(pollId, { optionId, fingerprint });
      setPoll(updated);
      setHasVoted(true);
      // No refetch: voter sees this response; others get same data via socket voteUpdate.
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? "Failed to vote.";
      setError(message);
    } finally {
      setVotingOptionId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <p className="text-zinc-600 dark:text-zinc-400">Loading poll…</p>
      </div>
    );
  }

  if (error && !poll) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <div className="mx-auto max-w-xl px-4 py-12">
          <p className="mb-4 text-red-600 dark:text-red-400">{error}</p>
          <Link
            href="/"
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    );
  }

  if (!poll) return null;

  const totalVotes = poll.options.reduce((sum, o) => sum + o.voteCount, 0);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-xl px-4 py-12">
        <nav className="mb-8">
          <Link
            href="/"
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            ← Home
          </Link>
        </nav>

        <h1 className="mb-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          {poll.question}
        </h1>
        <p className="mb-8 text-sm text-zinc-500 dark:text-zinc-400">
          {totalVotes} vote{totalVotes !== 1 ? "s" : ""} total
        </p>

        {error && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <ul className="space-y-3">
          {poll.options.map((option) => {
            const pct =
              totalVotes > 0 ? (option.voteCount / totalVotes) * 100 : 0;
            const isVoting = votingOptionId === option.id;
            const canVote = !hasVoted && !isVoting;

            return (
              <li
                key={option.id}
                className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
              >
                <div className="relative">
                  <div
                    className="absolute inset-y-0 left-0 bg-zinc-200 dark:bg-zinc-700"
                    style={{ width: `${pct}%` }}
                    aria-hidden
                  />
                  <div className="relative flex items-center justify-between gap-4 px-4 py-3">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {option.text}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-zinc-500 dark:text-zinc-400">
                        {option.voteCount} vote
                        {option.voteCount !== 1 ? "s" : ""}
                        {totalVotes > 0 && (
                          <span className="ml-1">({pct.toFixed(0)}%)</span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleVote(option.id)}
                        disabled={!canVote}
                        className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                      >
                        {isVoting ? "Voting…" : hasVoted ? "Voted" : "Vote"}
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <p className="mt-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Results update in real time.
        </p>
      </div>
    </div>
  );
}
