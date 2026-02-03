"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Shield,
  Swords,
  Target,
  Gavel,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDemoPlayback, DemoScript, DemoEvent } from "@/hooks/useDemoPlayback";
import { useTypingAnimation } from "@/hooks/useTypingAnimation";
import { DemoCompleteModal } from "./DemoCompleteModal";

interface LLMDemoEvent extends DemoEvent {
  type:
    | "round_start"
    | "attacker_message"
    | "target_response"
    | "judge_verdict"
    | "defender_action"
    | "complete";
  round?: number;
  text?: string;
  score?: number;
  analysis?: string;
  breach_detected?: boolean;
  hardened_prompt?: string;
  outcome?: string;
}

interface LLMDemoScript extends DemoScript<LLMDemoEvent> {
  meta: {
    duration_ms: number;
    rounds: number;
    secret: string;
    system_prompt: string;
  };
}

interface LLMDemoPlayerProps {
  script: LLMDemoScript;
}

interface RoundState {
  round: number;
  attackerMessage: string | null;
  targetResponse: string | null;
  judgeVerdict: {
    score: number;
    analysis: string;
    breach_detected: boolean;
  } | null;
}

export function LLMDemoPlayer({ script }: LLMDemoPlayerProps) {
  const [rounds, setRounds] = useState<RoundState[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [hardenedPrompt, setHardenedPrompt] = useState<string | null>(null);

  const handleEvent = (event: LLMDemoEvent) => {
    switch (event.type) {
      case "round_start":
        setCurrentRound(event.round ?? 0);
        setRounds((prev) => [
          ...prev,
          {
            round: event.round ?? 0,
            attackerMessage: null,
            targetResponse: null,
            judgeVerdict: null,
          },
        ]);
        break;
      case "attacker_message":
        setRounds((prev) =>
          prev.map((r) =>
            r.round === event.round
              ? { ...r, attackerMessage: event.text ?? null }
              : r
          )
        );
        break;
      case "target_response":
        setRounds((prev) =>
          prev.map((r) =>
            r.round === event.round
              ? { ...r, targetResponse: event.text ?? null }
              : r
          )
        );
        break;
      case "judge_verdict":
        setRounds((prev) =>
          prev.map((r) =>
            r.round === event.round
              ? {
                  ...r,
                  judgeVerdict: {
                    score: event.score ?? 0,
                    analysis: event.analysis ?? "",
                    breach_detected: event.breach_detected ?? false,
                  },
                }
              : r
          )
        );
        break;
      case "defender_action":
        setHardenedPrompt(event.hardened_prompt ?? null);
        break;
      case "complete":
        break;
    }
  };

  const { progress, reset } = useDemoPlayback({
    script,
    onEvent: handleEvent,
    onComplete: () => setShowModal(true),
    autoStart: true,
  });

  const handleRestart = () => {
    setRounds([]);
    setCurrentRound(0);
    setHardenedPrompt(null);
    reset();
    setTimeout(() => reset(), 100);
  };

  const currentRoundData = rounds.find((r) => r.round === currentRound);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">LLM Security Demo</h1>
          <p className="text-muted-foreground">
            Watch an adversarial attack unfold in real-time
          </p>
        </div>
        <Button variant="outline" onClick={handleRestart}>
          <RotateCcw className="w-4 h-4 mr-2" />
          Start Over
        </Button>
      </div>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="w-4 h-4" />
            System Prompt
            {hardenedPrompt && (
              <Badge variant="secondary" className="ml-2">
                Hardened
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="py-3">
          <p className="text-sm font-mono text-muted-foreground">
            {hardenedPrompt || script.meta.system_prompt}
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-red-500/20">
          <CardHeader className="py-3 bg-red-500/5">
            <CardTitle className="text-sm flex items-center gap-2 text-red-600 dark:text-red-400">
              <Swords className="w-4 h-4" />
              Attacker
            </CardTitle>
          </CardHeader>
          <CardContent className="py-4 min-h-[120px]">
            {currentRoundData?.attackerMessage ? (
              <TypingText text={currentRoundData.attackerMessage} />
            ) : (
              <span className="text-muted-foreground italic">
                Preparing attack...
              </span>
            )}
          </CardContent>
        </Card>

        <Card className="border-blue-500/20">
          <CardHeader className="py-3 bg-blue-500/5">
            <CardTitle className="text-sm flex items-center gap-2 text-blue-600 dark:text-blue-400">
              <Target className="w-4 h-4" />
              Target LLM
            </CardTitle>
          </CardHeader>
          <CardContent className="py-4 min-h-[120px]">
            {currentRoundData?.targetResponse ? (
              <TypingText text={currentRoundData.targetResponse} />
            ) : currentRoundData?.attackerMessage ? (
              <span className="text-muted-foreground italic">Thinking...</span>
            ) : (
              <span className="text-muted-foreground italic">
                Awaiting input...
              </span>
            )}
          </CardContent>
        </Card>
      </div>

      {currentRoundData?.judgeVerdict && (
        <Card
          className={cn(
            "border-2",
            currentRoundData.judgeVerdict.breach_detected
              ? "border-red-500 bg-red-500/5"
              : "border-green-500/30"
          )}
        >
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Gavel className="w-4 h-4" />
              Judge Verdict
              <Badge
                variant={
                  currentRoundData.judgeVerdict.breach_detected
                    ? "destructive"
                    : "secondary"
                }
              >
                Score: {currentRoundData.judgeVerdict.score}/10
              </Badge>
              {currentRoundData.judgeVerdict.breach_detected && (
                <Badge variant="destructive" className="ml-2">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  BREACH DETECTED
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="py-3">
            <p className="text-sm">{currentRoundData.judgeVerdict.analysis}</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span>
            Round: {currentRound}/{script.meta.rounds}
          </span>
          <span>{Math.round(progress)}% complete</span>
        </div>
        <Progress value={progress} />
      </div>

      {rounds.length > 1 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Round History</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {rounds
                  .filter((r) => r.round < currentRound)
                  .map((round) => (
                    <div
                      key={round.round}
                      className="p-2 rounded bg-muted/50 text-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Round {round.round}</span>
                        {round.judgeVerdict && (
                          <Badge
                            variant={
                              round.judgeVerdict.breach_detected
                                ? "destructive"
                                : "outline"
                            }
                            className="text-xs"
                          >
                            {round.judgeVerdict.breach_detected
                              ? "Breach"
                              : `Score: ${round.judgeVerdict.score}`}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      <DemoCompleteModal
        open={showModal}
        onOpenChange={setShowModal}
        type="llm"
        onRestart={handleRestart}
      />
    </div>
  );
}

function TypingText({ text }: { text: string }) {
  const { displayedText, isTyping } = useTypingAnimation({
    text,
    speed: 20,
  });

  return (
    <p className="text-sm whitespace-pre-wrap">
      {displayedText}
      {isTyping && <span className="animate-pulse">|</span>}
    </p>
  );
}
