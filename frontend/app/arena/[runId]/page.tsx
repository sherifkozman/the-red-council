// Redirect old /arena/[runId] to new /llm/arena/[runId]
import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ runId: string }>;
}

export default async function ArenaRunRedirect({ params }: PageProps) {
  const { runId } = await params;
  redirect(`/llm/arena/${runId}`);
}
