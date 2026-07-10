"use client";

import { useState } from "react";

import { askOverviewFollowupAction } from "@/app/actions/google-ads";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { DateRange, OverviewChatMessage } from "@/types/google-ads";

export function OverviewChatPanel({
  dateRange,
  initialMessages,
}: {
  dateRange: DateRange;
  initialMessages: OverviewChatMessage[];
}) {
  const [messages, setMessages] = useState<OverviewChatMessage[]>(initialMessages);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    const trimmed = question.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setError(null);
    try {
      const res = await askOverviewFollowupAction({ start: dateRange.start, end: dateRange.end, question: trimmed });
      if (!res.ok) throw new Error(res.error);
      setMessages(res.data);
      setQuestion("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ask a follow-up</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ScrollArea className="h-64 rounded-md border">
          <div className="flex flex-col gap-3 p-3">
            {messages.length === 0 && (
              <p className="text-muted-foreground text-sm">
                Run an analysis, then ask questions about any campaign here.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: messages have no stable unique id
                key={`${m.role}-${m.createdAt}-${i}`}
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                  m.role === "user" ? "self-end bg-primary text-primary-foreground" : "self-start bg-muted",
                )}
              >
                {m.content}
              </div>
            ))}
          </div>
        </ScrollArea>

        {error && <p className="text-destructive text-sm">{error}</p>}

        <div className="flex gap-2">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Why is the Brand campaign at-risk?"
            className="min-h-10 resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          <Button type="button" onClick={() => void handleSend()} disabled={sending || !question.trim()}>
            {sending ? <Spinner className="size-4" /> : "Send"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
