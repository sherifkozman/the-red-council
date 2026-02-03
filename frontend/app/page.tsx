"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Target, Bot, Play, ArrowRight } from "lucide-react";

export default function LandingPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-12 space-y-4 max-w-2xl mx-auto">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center">
              <Shield className="w-8 h-8 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            The Red Council
          </h1>
          <p className="text-muted-foreground text-lg">
            LLM Adversarial Security Arena
          </p>
          <p className="text-muted-foreground">
            Test your AI systems against sophisticated attacks and discover vulnerabilities before attackers do.
          </p>
        </div>

        {/* Two-Card Choice */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* LLM Testing Card */}
          <Card className="group hover:shadow-lg transition-all duration-200 hover:-translate-y-1">
            <CardHeader>
              <div className="w-12 h-12 rounded-lg bg-red-500/10 flex items-center justify-center mb-4 group-hover:bg-red-500/20 transition-colors">
                <Target className="w-6 h-6 text-red-500" />
              </div>
              <CardTitle className="text-xl">LLM Testing</CardTitle>
              <CardDescription>
                Test LLM resilience against jailbreaks and prompt injection attacks
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                variant="outline"
                className="w-full justify-between"
                onClick={() => router.push("/llm/demo")}
              >
                <span className="flex items-center gap-2">
                  <Play className="w-4 h-4" />
                  Watch Demo
                </span>
                <ArrowRight className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-between"
                onClick={() => router.push("/llm/arena")}
              >
                <span>Start Testing</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>

          {/* Agent Testing Card */}
          <Card className="group hover:shadow-lg transition-all duration-200 hover:-translate-y-1">
            <CardHeader>
              <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center mb-4 group-hover:bg-blue-500/20 transition-colors">
                <Bot className="w-6 h-6 text-blue-500" />
              </div>
              <CardTitle className="text-xl">Agent Testing</CardTitle>
              <CardDescription>
                Test agent security against OWASP Top 10 agentic threats
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                variant="outline"
                className="w-full justify-between"
                onClick={() => router.push("/agent/demo")}
              >
                <span className="flex items-center gap-2">
                  <Play className="w-4 h-4" />
                  Watch Demo
                </span>
                <ArrowRight className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-between"
                onClick={() => router.push("/agent/connect")}
              >
                <span>Connect Agent</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
