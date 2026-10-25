import { z } from "zod/v4";

export const assistantLocale = z.enum(["en", "ne", "hi"]);
export type AssistantLocale = z.infer<typeof assistantLocale>;
export const createConversation = z
  .object({
    locale: assistantLocale,
    consent: z.literal(true),
  })
  .strict();
export const assistantTurn = z
  .object({
    conversationId: z.string().uuid(),
    requestId: z.string().uuid(),
    text: z.string().trim().min(1).max(3000),
  })
  .strict();
export const assistantDecision = z
  .object({
    actionId: z.string().uuid(),
    decision: z.enum(["confirm", "reject"]),
  })
  .strict();
export const communication = z
  .object({
    audience: z.enum(["support", "professional", "client"]),
    appointmentId: z.string().uuid().optional(),
    body: z.string().trim().min(10).max(2000),
  })
  .strict()
  .refine((v) => v.audience === "support" || !!v.appointmentId, {
    message:
      "Choose a related appointment for a professional or client message.",
  });
export const leadBrief = z
  .object({
    query: z.string().trim().min(5).max(500),
    platform: z.enum(["public_web", "instagram", "facebook", "linkedin"]),
  })
  .strict();
export const bookingProposal = z
  .object({
    serviceId: z.string().uuid(),
    startsAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type ActionKind =
  | "BOOKING_REQUEST"
  | "CANCEL_APPOINTMENT"
  | "REQUEST_HUMAN"
  | "MESSAGE_DRAFT"
  | "LEAD_RESEARCH";
export type Trace = {
  agent: string;
  tool: string;
  status: "completed" | "failed";
};
export type AssistantAction = {
  id: string;
  kind: ActionKind;
  summary: string;
  status: string;
  payload: Record<string, unknown>;
  result?: unknown;
};
export type AssistantMessage = { role: "user" | "assistant"; content: string };
export type AssistantContext = {
  roles: string[];
  appointments: Record<string, unknown>[];
  orders: Record<string, unknown>[];
};
export const isSupportTeam = (roles: string[]) =>
  roles.some((r) => ["SUPPORT", "SECURITY_ADMIN"].includes(r));

export const agentTeam = [
  {
    id: "concierge",
    name: "Concierge",
    purpose: "Understands the request and coordinates specialists.",
  },
  {
    id: "booking",
    name: "Booking assistant",
    purpose:
      "Finds professionals and real available times; prepares reservations for confirmation.",
  },
  {
    id: "tracking",
    name: "Tracking assistant",
    purpose: "Checks the signed-in person's appointments and orders.",
  },
  {
    id: "communications",
    name: "Communications assistant",
    purpose: "Drafts messages and prepares human support handoffs.",
  },
  {
    id: "operations",
    name: "Operations assistant",
    purpose: "Helps authorized staff review operational queues.",
  },
  {
    id: "leads",
    name: "Lead research assistant",
    purpose:
      "Prepares public business/professional research briefs for staff review.",
  },
  {
    id: "voice",
    name: "Voice interface",
    purpose:
      "Shares the chat workflow through browser dictation and read-aloud; phone connection is separate.",
  },
] as const;

export function urgentSupport(text: string): boolean {
  return /\b(suicid(?:e|al)|kill myself|end my life|harm myself|hurt myself|overdos(?:e|ed)|cannot stay safe|can't stay safe)\b|आत्महत्या|खुदकुशी|आफूलाई मार|आफैलाई मार|खुद को मार/u.test(
    text,
  );
}
export function urgentReply(locale: AssistantLocale): string {
  return {
    en: "If you may hurt yourself or someone is in immediate danger, contact local emergency services or go to the nearest emergency department now. If possible, stay with a trusted person. Chatbud AI cannot provide emergency care. You can also request a Chatbud support handoff, but it is not an emergency response service.",
    ne: "आफूलाई हानि पुर्‍याउने जोखिम छ वा कोही तत्काल खतरामा छन् भने स्थानीय आपतकालीन सेवामा सम्पर्क गर्नुहोस् वा नजिकको अस्पतालको आपतकालीन विभागमा जानुहोस्। सम्भव भए विश्वासिलो व्यक्तिसँग बस्नुहोस्। Chatbud AI ले आपतकालीन उपचार दिन सक्दैन। Chatbud सहयोग टोलीलाई अनुरोध पठाउन सक्नुहुन्छ, तर यो आपतकालीन सेवा होइन।",
    hi: "यदि आप खुद को नुकसान पहुँचा सकते हैं या कोई तत्काल खतरे में है, तो स्थानीय आपातकालीन सेवा से संपर्क करें या नज़दीकी अस्पताल के आपातकालीन विभाग में जाएँ। संभव हो तो किसी भरोसेमंद व्यक्ति के साथ रहें। Chatbud AI आपातकालीन देखभाल नहीं देता। आप Chatbud सहायता टीम से मदद माँग सकते हैं, लेकिन यह आपातकालीन सेवा नहीं है।",
  }[locale];
}
