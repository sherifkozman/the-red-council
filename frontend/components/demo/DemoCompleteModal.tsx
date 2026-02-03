"use client";

import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Target, Bot, FileText, ArrowRight, RotateCcw } from "lucide-react";

interface DemoCompleteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "llm" | "agent";
  onRestart: () => void;
}

export function DemoCompleteModal({
  open,
  onOpenChange,
  type,
  onRestart,
}: DemoCompleteModalProps) {
  const router = useRouter();

  const isLLM = type === "llm";
  const Icon = isLLM ? Target : Bot;

  const handleViewReport = () => {
    router.push("/reports?demo=true");
    onOpenChange(false);
  };

  const handleTryItYourself = () => {
    const path = isLLM ? "/llm/arena" : "/agent/connect";
    router.push(`${path}?from_demo=true`);
    onOpenChange(false);
  };

  const handleRestart = () => {
    onRestart();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon className="w-6 h-6 text-primary" />
          </div>
          <DialogTitle className="text-xl">Demo Complete!</DialogTitle>
          <DialogDescription>
            {isLLM
              ? "You've seen how The Red Council tests LLM security."
              : "You've seen how The Red Council tests AI agent security."}
            <br />
            Ready to test your own systems?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-4">
          <Button
            variant="outline"
            className="w-full justify-between h-auto py-3"
            onClick={handleViewReport}
          >
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-muted-foreground" />
              <div className="text-left">
                <div className="font-medium">View Full Report</div>
                <div className="text-xs text-muted-foreground">
                  See detailed analysis of this demo{" "}
                  {isLLM ? "battle" : "campaign"}
                </div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4" />
          </Button>

          <Button
            className="w-full justify-between h-auto py-3"
            onClick={handleTryItYourself}
          >
            <div className="flex items-center gap-3">
              <Icon className="w-5 h-5" />
              <div className="text-left">
                <div className="font-medium">Try It Yourself</div>
                <div className="text-xs opacity-80">
                  {isLLM
                    ? "Test your own LLM with custom prompts"
                    : "Connect and test your own AI agent"}
                </div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>

        <div className="mt-4 pt-4 border-t">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={handleRestart}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Watch Again
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
