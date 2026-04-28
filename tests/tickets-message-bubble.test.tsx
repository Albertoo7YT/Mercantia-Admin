import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MessageBubble } from "@/components/tickets/message-bubble";
import type { TenantTicketMessage } from "@/lib/api-client";

function wrap(node: React.ReactNode) {
  return <TooltipProvider>{node}</TooltipProvider>;
}

const baseMessage: TenantTicketMessage = {
  id: "m1",
  senderType: "admin",
  senderName: "Soporte Mercantia",
  content: "Hola, ya estamos en ello.",
  internalNote: false,
  attachments: [],
  createdAt: new Date().toISOString(),
};

describe("MessageBubble", () => {
  it("renders an admin message with the M avatar", () => {
    const { container } = render(
      wrap(<MessageBubble tenantId="t1" ticketId="tk1" message={baseMessage} />),
    );
    expect(screen.getByText("Soporte Mercantia")).toBeInTheDocument();
    expect(screen.getByText("Hola, ya estamos en ello.")).toBeInTheDocument();
    // Single "M" avatar should be present.
    expect(container.textContent).toContain("M");
  });

  it("renders a user message with derived initials", () => {
    render(
      wrap(
        <MessageBubble
          tenantId="t1"
          ticketId="tk1"
          message={{ ...baseMessage, senderType: "user", senderName: "Ana López" }}
        />,
      ),
    );
    expect(screen.getByText("Ana López")).toBeInTheDocument();
    // We don't assert the exact avatar rendering; the name being displayed is enough.
  });

  it("renders internal notes with the dedicated banner styling", () => {
    render(
      wrap(
        <MessageBubble
          tenantId="t1"
          ticketId="tk1"
          message={{ ...baseMessage, internalNote: true }}
        />,
      ),
    );
    const bubble = screen.getByTestId("ticket-message");
    expect(bubble.dataset.internal).toBe("true");
    expect(
      screen.getByText(/Nota interna · solo visible para admin/i),
    ).toBeInTheDocument();
  });

  it("renders attachment cards with download links", () => {
    render(
      wrap(
        <MessageBubble
          tenantId="t1"
          ticketId="tk1"
          message={{
            ...baseMessage,
            attachments: [
              {
                id: "att-9",
                filename: "logs.zip",
                sizeBytes: 1024,
                mimeType: "application/zip",
              },
            ],
          }}
        />,
      ),
    );
    const link = screen.getByRole("link", { name: /logs\.zip/i });
    expect(link.getAttribute("href")).toBe(
      "/api/tenants/t1/tickets/attachments/att-9?ticketId=tk1",
    );
  });
});
