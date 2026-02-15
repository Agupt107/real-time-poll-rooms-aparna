import axios, { AxiosInstance } from "axios";

const baseURL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

export const api: AxiosInstance = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
});

export interface Option {
  id: string;
  text: string;
  voteCount: number;
  pollId: string;
}

export interface Poll {
  id: string;
  question: string;
  createdAt: string;
  options: Option[];
}

export interface CreatePollBody {
  question: string;
  options: string[];
}

export interface VoteBody {
  optionId: string;
  fingerprint: string;
}

export interface CreatePollResponse extends Poll {
  shareableLink: string;
}

export async function createPoll(body: CreatePollBody): Promise<CreatePollResponse> {
  const { data } = await api.post<CreatePollResponse>("/api/polls", body);
  return data;
}

export async function getPoll(id: string): Promise<Poll> {
  const { data } = await api.get<Poll>(`/api/polls/${id}`);
  return data;
}

export async function vote(
  pollId: string,
  body: VoteBody
): Promise<Poll> {
  const { data } = await api.post<Poll>(`/api/polls/${pollId}/vote`, body);
  return data;
}

export function getOrCreateFingerprint(): string {
  if (typeof window === "undefined") return "";
  const key = "poll_fingerprint";
  let value = localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(key, value);
  }
  return value;
}
