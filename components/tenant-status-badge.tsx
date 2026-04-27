import { Badge } from "@/components/ui/badge";

type Status = "active" | "suspended" | "trial" | string;

const labels: Record<string, string> = {
  active: "Activo",
  suspended: "Suspendido",
  trial: "Prueba",
};

export function TenantStatusBadge({ status }: { status: Status }) {
  if (status === "active") {
    return <Badge variant="success">{labels.active}</Badge>;
  }
  if (status === "trial") {
    return <Badge variant="warning">{labels.trial}</Badge>;
  }
  if (status === "suspended") {
    return <Badge variant="muted">{labels.suspended}</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
}
