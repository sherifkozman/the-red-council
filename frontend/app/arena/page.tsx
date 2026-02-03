// Redirect old /arena to new /llm/arena
import { redirect } from "next/navigation";

export default function ArenaRedirect() {
  redirect("/llm/arena");
}
