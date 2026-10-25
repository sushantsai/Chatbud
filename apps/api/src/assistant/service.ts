import { HttpException } from "@nestjs/common";
import type { LanguageModel } from "ai";
import {
  agentTeam,
  assistantTurn,
  createConversation,
  assistantDecision,
  urgentSupport,
  urgentReply,
  type ActionKind,
} from "./contracts";
import { runSupportTeam } from "./runtime";

export interface AssistantData {
  rpc(
    action: string,
    actor?: string | null,
    data?: any,
    gateway?: string,
  ): Promise<any>;
  care(action: string, actor?: string | null, data?: any): Promise<any>;
}
export function assistantStatus(env: NodeJS.ProcessEnv = process.env) {
  const configured =
    env.ENABLE_AI_ASSISTANT === "true" &&
    !!env.AI_GATEWAY_MODEL &&
    !!(env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN);
  return {
    configured,
    languages: ["en", "ne", "hi"],
    agents: agentTeam,
    channels: [
      {
        id: "web",
        name: "Web chat",
        status: configured ? "CONFIGURED" : "NEEDS_AI_CONNECTION",
        description: "Authenticated chat and confirmed support actions.",
      },
      {
        id: "voice",
        name: "Browser voice",
        status: configured ? "BROWSER_DEPENDENT" : "NEEDS_AI_CONNECTION",
        description:
          "Dictation and read-aloud where the browser supports your chosen language.",
      },
      {
        id: "phone",
        name: "Phone calls",
        status: "NOT_CONNECTED",
        description:
          "Needs a telephony provider, number, identity verification and webhook adapter.",
      },
      {
        id: "whatsapp",
        name: "WhatsApp",
        status: "NOT_CONNECTED",
        description:
          "Needs WhatsApp Business onboarding, verified webhooks and approved message templates.",
      },
      {
        id: "email",
        name: "Email",
        status: "NOT_CONNECTED",
        description:
          "Needs a sending domain, inbound mailbox adapter and delivery webhooks.",
      },
      {
        id: "instagram",
        name: "Instagram",
        status: "NOT_CONNECTED",
        description:
          "Needs a professional account, Meta permissions and verified messaging webhooks.",
      },
      {
        id: "facebook",
        name: "Facebook Messenger",
        status: "NOT_CONNECTED",
        description:
          "Needs a Facebook Page, Meta permissions and verified messaging webhooks.",
      },
    ],
    leadResearch: {
      status: "BRIEFS_ONLY",
      description:
        "Staff can queue research briefs. Search ingestion, lead CRM and outreach delivery are not connected.",
    },
  };
}
export class AssistantService {
  constructor(private data: AssistantData) {}
  call(action: string, actor: string, data: any = {}) {
    return this.data.rpc(action, actor, data, "chatbud_assist");
  }
  async create(actor: string, body: unknown) {
    const parsed = createConversation.safeParse(body);
    if (!parsed.success)
      throw new HttpException(
        "Select a supported language and agree to AI processing.",
        400,
      );
    if (!assistantStatus().configured)
      throw new HttpException(
        "The AI service is not connected yet. You can still contact Chatbud support.",
        503,
      );
    return this.call("create", actor, parsed.data);
  }
  async decide(actor: string, body: unknown) {
    const parsed = assistantDecision.safeParse(body);
    if (!parsed.success)
      throw new HttpException("Invalid action decision", 400);
    return this.call("decision", actor, parsed.data);
  }
  async turn(actor: string, body: unknown, testModel?: LanguageModel) {
    const parsed = assistantTurn.safeParse(body);
    if (!parsed.success)
      throw new HttpException(
        "Enter a message of up to 3,000 characters.",
        400,
      );
    if (!testModel && !assistantStatus().configured)
      throw new HttpException(
        "The AI service is not connected yet. Contact Chatbud support or try again later.",
        503,
      );
    const input = parsed.data;
    const run = await this.call("begin_run", actor, input);
    if (run.replay) {
      if (run.status === "SUCCEEDED") return run.response;
      throw new HttpException(
        {
          message:
            run.status === "RUNNING"
              ? "Your reply is still being prepared."
              : "The earlier reply failed. Please try again.",
          code: run.status === "RUNNING" ? "AI_RUN_RUNNING" : "AI_RUN_FAILED",
        },
        409,
      );
    }
    const scope = { conversationId: input.conversationId, runId: run.id };
    const propose = (kind: ActionKind, payload: Record<string, unknown>) =>
      this.call("propose", actor, { ...scope, kind, payload });
    try {
      let response;
      if (urgentSupport(input.text)) {
        const action = await propose("REQUEST_HUMAN", {
          summary:
            "The person requested urgent support. Please follow the established support escalation process. This ticket is not an emergency response.",
        });
        response = {
          text: urgentReply(run.locale),
          actions: [action],
          trace: [
            {
              agent: "communications",
              tool: "urgentSupportHandoff",
              status: "completed",
            },
          ],
          tokens: 0,
        };
      } else {
        const conversation = await this.call("conversation", actor, {
          conversationId: input.conversationId,
        });
        const context = await this.call("context", actor);
        response = await runSupportTeam({
          model: testModel || process.env.AI_GATEWAY_MODEL!,
          locale: run.locale,
          roles: context.roles,
          messages: conversation.messages
            .slice(-16)
            .map((m: any) => ({ role: m.role, content: m.content })),
          signal: AbortSignal.timeout(45000),
          tools: {
            catalog: () => this.data.rpc("catalog"),
            slots: (serviceId, date) =>
              this.data.care("slots", null, { serviceId, date }),
            context: () => this.call("context", actor),
            operations: () =>
              this.data.rpc("ops_dashboard", actor, {}, "chatbud_ops"),
            propose,
          },
        });
      }
      return await this.call("finish_run", actor, { ...scope, response });
    } catch {
      await this.call("fail_run", actor, scope).catch(() => {});
      throw new HttpException(
        {
          message:
            "The assistant could not complete this reply. This reply did not execute a booking or payment action. Contact support or try again.",
          code: "AI_RUN_FAILED",
        },
        503,
      );
    }
  }
}
