"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Bot, RotateCcw, Shield, AlertTriangle } from "lucide-react";
import { useDemoPlayback, DemoScript, DemoEvent } from "@/hooks/useDemoPlayback";
import { DemoCompleteModal } from "./DemoCompleteModal";
import { DemoOWASPGrid } from "./DemoOWASPGrid";
import { DemoTimeline } from "./DemoTimeline";

interface AgentDemoEvent extends DemoEvent {
  type:
    | "agent_connected"
    | "baseline_established"
    | "test_start"
    | "attack_sent"
    | "agent_response"
    | "test_result"
    | "complete";
  owasp?: string;
  name?: string;
  vulnerable?: boolean;
  severity?: number;
  evidence?: string;
  recommendation?: string;
  payload?: string;
  response?: string;
  summary?: {
    total_tests: number;
    vulnerabilities_found: number;
  };
}

interface AgentDemoScript extends DemoScript<AgentDemoEvent> {
  meta: {
    duration_ms: number;
    tests: number;
    agent_name: string;
    agent_description: string;
  };
}

interface AgentDemoPlayerProps {
  script: AgentDemoScript;
}

type CellStatus = "not_tested" | "testing" | "passed" | "vulnerable";

export function AgentDemoPlayer({ script }: AgentDemoPlayerProps) {
  const [owaspStatuses, setOwaspStatuses] = useState<Record<string, CellStatus>>({});
  const [currentTest, setCurrentTest] = useState<{
    owasp: string;
    name: string;
    payload?: string;
    response?: string;
    result?: {
      vulnerable: boolean;
      severity: number;
      evidence?: string;
      recommendation?: string;
    };
  } | null>(null);
  const [showModal, setShowModal] = useState(false);

  const handleEvent = (event: AgentDemoEvent) => {
    switch (event.type) {
      case "test_start":
        if (event.owasp) {
          setOwaspStatuses((prev) => ({ ...prev, [event.owasp!]: "testing" }));
          setCurrentTest({
            owasp: event.owasp,
            name: event.name ?? "",
          });
        }
        break;
      case "attack_sent":
        if (event.owasp && event.payload) {
          setCurrentTest((prev) => {
            if (prev && prev.owasp === event.owasp) {
              return {
                owasp: prev.owasp,
                name: prev.name,
                payload: event.payload,
                response: prev.response,
                result: prev.result,
              };
            }
            return prev;
          });
        }
        break;
      case "agent_response":
        if (event.owasp && event.response) {
          setCurrentTest((prev) => {
            if (prev && prev.owasp === event.owasp) {
              return {
                owasp: prev.owasp,
                name: prev.name,
                payload: prev.payload,
                response: event.response,
                result: prev.result,
              };
            }
            return prev;
          });
        }
        break;
      case "test_result":
        if (event.owasp) {
          setOwaspStatuses((prev) => ({
            ...prev,
            [event.owasp!]: event.vulnerable ? "vulnerable" : "passed",
          }));
          setCurrentTest((prev) => {
            if (prev && prev.owasp === event.owasp) {
              return {
                owasp: prev.owasp,
                name: prev.name,
                payload: prev.payload,
                response: prev.response,
                result: {
                  vulnerable: event.vulnerable ?? false,
                  severity: event.severity ?? 0,
                  evidence: event.evidence,
                  recommendation: event.recommendation ?? undefined,
                },
              };
            }
            return prev;
          });
        }
        break;
      case "complete":
        break;
    }
  };

  const { progress, currentEvents, reset, currentTime } = useDemoPlayback({
    script,
    onEvent: handleEvent,
    onComplete: () => setShowModal(true),
    autoStart: true,
  });

  const handleRestart = () => {
    setOwaspStatuses({});
    setCurrentTest(null);
    reset();
    setTimeout(() => reset(), 100);
  };

  const testsCompleted = Object.values(owaspStatuses).filter(
    (s) => s === "passed" || s === "vulnerable"
  ).length;

  const vulnerabilitiesFound = Object.values(owaspStatuses).filter(
    (s) => s === "vulnerable"
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agent Security Demo</h1>
          <p className="text-muted-foreground">
            Watch an OWASP Agentic Top 10 security assessment
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
            <Bot className="w-4 h-4" />
            {script.meta.agent_name}
          </CardTitle>
        </CardHeader>
        <CardContent className="py-3">
          <p className="text-sm text-muted-foreground">
            {script.meta.agent_description}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="w-4 h-4" />
            OWASP Agentic Top 10 Coverage
          </CardTitle>
        </CardHeader>
        <CardContent className="py-3">
          <DemoOWASPGrid statuses={owaspStatuses} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Event Timeline</CardTitle>
          </CardHeader>
          <CardContent className="py-3">
            <DemoTimeline
              events={currentEvents}
              currentTime={currentTime}
              className="h-[250px]"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              Current Test Details
              {currentTest?.result?.vulnerable && (
                <Badge variant="destructive">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  Vulnerable
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="py-3">
            {currentTest ? (
              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-medium">
                    {currentTest.owasp}: {currentTest.name}
                  </p>
                </div>
                {currentTest.payload && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      Attack:
                    </p>
                    <p className="text-xs bg-muted p-2 rounded font-mono">
                      {currentTest.payload}
                    </p>
                  </div>
                )}
                {currentTest.response && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      Response:
                    </p>
                    <p className="text-xs bg-muted p-2 rounded">
                      {currentTest.response}
                    </p>
                  </div>
                )}
                {currentTest.result && (
                  <div>
                    <Badge
                      variant={
                        currentTest.result.vulnerable
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {currentTest.result.vulnerable
                        ? `Severity: ${currentTest.result.severity}/10`
                        : "Passed"}
                    </Badge>
                    {currentTest.result.evidence && (
                      <p className="text-xs mt-2 text-muted-foreground">
                        {currentTest.result.evidence}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Waiting for test to start...
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span>
            Tests: {testsCompleted}/{script.meta.tests} | Vulnerabilities:{" "}
            {vulnerabilitiesFound}
          </span>
          <span>{Math.round(progress)}% complete</span>
        </div>
        <Progress value={progress} />
      </div>

      <DemoCompleteModal
        open={showModal}
        onOpenChange={setShowModal}
        type="agent"
        onRestart={handleRestart}
      />
    </div>
  );
}
