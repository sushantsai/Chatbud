"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bot,
  Check,
  MessageCircle,
  Mic,
  MicOff,
  Plus,
  Send,
  Volume2,
} from "lucide-react";
import { useApp } from "./app";
import { SignInPrompt, Urgent, nepalTime } from "./ui";

type Locale = "en" | "ne" | "hi";
type Action = {
  id: string;
  kind: string;
  summary: string;
  status: string;
  payload: any;
  result?: any;
};
type Conversation = {
  id: string;
  locale: Locale;
  status: string;
  ticketId?: string;
  messages: { id: string; role: "user" | "assistant"; content: string }[];
  actions: Action[];
};
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: any) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
};
const copy = {
  en: {
    title: "A little help, whenever you need it.",
    intro:
      "Find care, check a booking or order, and get help with your next step.",
    start: "Start AI chat",
    send: "Send",
    message: "Your message",
    placeholder: "What would you like help with?",
    newChat: "New chat",
    consent:
      "I agree to have this conversation stored by Chatbud and processed by its AI provider for support. I can use human support instead.",
    confirm: "Confirm action",
    reject: "Dismiss",
    thinking: "Your AI assistant is preparing a reply…",
    human: "Continue with human support",
    suggestions: [
      "Help me find a dietitian",
      "Check my appointments and orders",
      "Help me write a message to my professional",
      "I would like human support",
    ],
  },
  ne: {
    title: "तपाईंलाई आवश्यक पर्दा, सानो सहयोग।",
    intro:
      "उपयुक्त सेवा खोज्नुहोस्, बुकिङ वा अर्डर हेर्नुहोस् र अर्को कदमका लागि सहयोग लिनुहोस्।",
    start: "AI कुराकानी सुरु गर्नुहोस्",
    send: "पठाउनुहोस्",
    message: "तपाईंको सन्देश",
    placeholder: "तपाईंलाई के सहयोग चाहिएको छ?",
    newChat: "नयाँ कुराकानी",
    consent:
      "सहयोगका लागि यो कुराकानी Chatbud मा भण्डारण र यसको AI प्रदायकबाट प्रशोधन गर्न म सहमत छु। यसको सट्टा मानव सहयोग रोज्न सक्छु।",
    confirm: "कार्य पुष्टि गर्नुहोस्",
    reject: "हटाउनुहोस्",
    thinking: "AI सहायकले जवाफ तयार गर्दैछ…",
    human: "मानव सहयोग लिनुहोस्",
    suggestions: [
      "मलाई डाइटिसियन खोज्न मद्दत गर्नुहोस्",
      "मेरो बुकिङ र अर्डर हेर्नुहोस्",
      "मेरो विशेषज्ञलाई सन्देश लेख्न मद्दत गर्नुहोस्",
      "मलाई मानव सहयोग चाहिन्छ",
    ],
  },
  hi: {
    title: "जब ज़रूरत हो, थोड़ी मदद।",
    intro: "सही सेवा खोजें, बुकिंग या ऑर्डर देखें और अगले कदम के लिए मदद लें।",
    start: "AI चैट शुरू करें",
    send: "भेजें",
    message: "आपका संदेश",
    placeholder: "आपको किस बारे में मदद चाहिए?",
    newChat: "नई बातचीत",
    consent:
      "मैं सहायता के लिए इस बातचीत को Chatbud में संग्रहीत करने और उसके AI प्रदाता से संसाधित कराने के लिए सहमत हूँ। मैं मानव सहायता भी चुन सकता/सकती हूँ।",
    confirm: "कार्रवाई की पुष्टि करें",
    reject: "हटाएँ",
    thinking: "AI सहायक जवाब तैयार कर रहा है…",
    human: "मानव सहायता लें",
    suggestions: [
      "डायटीशियन खोजने में मदद करें",
      "मेरी बुकिंग और ऑर्डर देखें",
      "मेरे विशेषज्ञ को संदेश लिखने में मदद करें",
      "मुझे मानव सहायता चाहिए",
    ],
  },
};
const languageNames = { en: "English", ne: "नेपाली", hi: "हिन्दी" };
const voiceLocales = { en: "en-US", ne: "ne-NP", hi: "hi-IN" };
function actionResult(action: Action) {
  if (action.status === "EXPIRED")
    return "This action has expired. Ask for a new proposal.";
  if (action.status === "REJECTED") return "Dismissed. No action performed.";
  if (action.status !== "EXECUTED") return null;
  if (action.kind === "BOOKING_REQUEST")
    return "Request created. It is awaiting professional confirmation; no payment was collected.";
  if (action.kind === "REQUEST_HUMAN")
    return `Support request ${action.result?.reference || ""} received. Follow it in Help. This is not an emergency response service.`;
  if (action.kind === "MESSAGE_DRAFT")
    return "Draft saved. No message has been sent.";
  if (action.kind === "LEAD_RESEARCH")
    return "Brief saved. Research is waiting for a search connector; no search or outreach has run.";
  return "Appointment cancelled. Payment and refund status remain separate.";
}
export function AssistantDesk() {
  const { mode, token, api, openAuth } = useApp();
  const [locale, setLocale] = useState<Locale>("en");
  const [status, setStatus] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [text, setText] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [trace, setTrace] = useState<any[]>([]);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const mounted = useRef(false);
  const recognition = useRef<Recognition | null>(null);
  const lastRequest = useRef<{
    text: string;
    id: string;
    conversationId: string;
  } | null>(null);
  const spoken = useRef(false);
  const messageEnd = useRef<HTMLDivElement>(null);
  useEffect(() => {
    messageEnd.current?.scrollIntoView({ block: "nearest" });
  }, [conversation?.messages.length, busy]);
  const c = copy[locale];
  useEffect(() => {
    mounted.current = true;
    const win = window as any;
    setVoiceSupported(!!(win.SpeechRecognition || win.webkitSpeechRecognition));
    api("ai/status")
      .then((s) => {
        if (mounted.current) setStatus(s);
      })
      .catch(() => {
        if (mounted.current)
          setError("Support service is temporarily unavailable.");
      });
    if (mode === "live" && token)
      api("ai/conversations")
        .then((d) => {
          if (mounted.current) setHistory(d.conversations);
        })
        .catch((e) => {
          if (mounted.current) setError(e.message);
        });
    return () => {
      mounted.current = false;
      recognition.current?.abort();
      if (spoken.current) window.speechSynthesis?.cancel();
    };
  }, [mode, token]);
  async function perform(task: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      // A definite model failure can be retried with a fresh request ID.
      // Keep the ID on network uncertainty so a completed turn is not duplicated.
      if ((e as { code?: string }).code === "AI_RUN_FAILED")
        lastRequest.current = null;
      if (mounted.current)
        setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function load(id: string) {
    const data = await api(
      `ai/conversation?conversationId=${encodeURIComponent(id)}`,
    );
    if (mounted.current) {
      setConversation(data);
      setLocale(data.locale);
      setText("");
    }
  }
  function speak(content: string) {
    if (!window.speechSynthesis) {
      setError("Read-aloud is not supported in this browser.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(content);
    utterance.lang = voiceLocales[locale];
    const voice = window.speechSynthesis
      .getVoices()
      .find((v) => v.lang.toLowerCase().startsWith(locale));
    if (voice) utterance.voice = voice;
    spoken.current = true;
    window.speechSynthesis.speak(utterance);
  }
  function dictate() {
    if (listening) {
      recognition.current?.abort();
      setListening(false);
      return;
    }
    const win = window as any;
    const Constructor = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!Constructor) return;
    const instance: Recognition = new Constructor();
    instance.lang = voiceLocales[locale];
    instance.continuous = false;
    instance.interimResults = false;
    instance.onresult = (event) => {
      if (!mounted.current) return;
      const transcript = Array.from(event.results as ArrayLike<any>)
        .map((r: any) => r[0].transcript)
        .join(" ");
      setText((value) => `${value} ${transcript}`.trim().slice(0, 3000));
    };
    instance.onerror = () => {
      if (mounted.current) {
        setListening(false);
        setError(
          "Voice input is unavailable. Check microphone permission or type your message.",
        );
      }
    };
    instance.onend = () => {
      if (mounted.current) setListening(false);
    };
    recognition.current = instance;
    try {
      instance.start();
      setListening(true);
    } catch {
      setListening(false);
      setError("The microphone could not be started.");
    }
  }
  return (
    <div className="assistant-desk" lang={locale}>
      <section className="panel assistant-intro">
        <div className="assistant-heading">
          <span className="assistant-emblem">
            <Bot size={27} />
          </span>
          <div>
            <span className="eyebrow">CHATBUD ASSIST</span>
            <h2>{c.title}</h2>
            <p>{c.intro}</p>
          </div>
        </div>
        <div className="assistant-toolbar">
          <div>
            <label htmlFor="assistant-language">Language</label>
            <select
              id="assistant-language"
              value={locale}
              disabled={busy || !!conversation}
              onChange={(e) => setLocale(e.target.value as Locale)}
            >
              {Object.entries(languageNames).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <Link className="text-button" href="/help">
            {c.human}
          </Link>
        </div>
        <p className="assistant-disclosure">
          You’re speaking with an AI assistant. It can help with support and
          scheduling, but it does not provide clinical advice. You confirm
          changes before they happen.
        </p>
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {mode !== "live" ? (
        <section className="panel">
          <h2>Use Live database mode</h2>
          <p className="section-copy">
            AI support uses your signed-in account. Switch to Live database in
            the development toolbar to continue.
          </p>
        </section>
      ) : !token ? (
        <SignInPrompt open={openAuth}>
          Sign in for private AI support, booking help, and order tracking.
        </SignInPrompt>
      ) : !status ? (
        <p role="status">Checking the assistant connection…</p>
      ) : (
        <div className="assistant-layout">
          <aside className="panel assistant-history">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => {
                setConversation(null);
                setConsent(false);
                setText("");
                setTrace([]);
                recognition.current?.abort();
              }}
            >
              <Plus size={16} />
              {c.newChat}
            </button>
            <h3>Your conversations</h3>
            {history.length === 0 ? (
              <p>No conversations yet.</p>
            ) : (
              history.map((item) => (
                <button
                  key={item.id}
                  className={
                    conversation?.id === item.id
                      ? "assistant-history-item selected"
                      : "assistant-history-item"
                  }
                  disabled={busy}
                  onClick={() =>
                    perform(async () => {
                      await load(item.id);
                      setTrace([]);
                    })
                  }
                >
                  <MessageCircle size={15} />
                  <span>
                    {languageNames[item.locale as Locale]}
                    <small>{nepalTime(item.updatedAt)}</small>
                  </span>
                </button>
              ))
            )}
          </aside>
          <section
            className="panel assistant-chat"
            aria-label="AI support conversation"
          >
            {!conversation ? (
              <div className="assistant-start">
                <span className="assistant-emblem">
                  <MessageCircle size={30} />
                </span>
                <h2>
                  {status.configured
                    ? "Let’s find your next step."
                    : "AI support is being connected."}
                </h2>
                <p>
                  {status.configured
                    ? "Your conversation is private to your account. We share a summary with the support team only when you request a handoff."
                    : "Web chat is ready for setup. An administrator needs to configure the AI connection before conversations can start. Human support remains available."}
                </p>
                <div className="assistant-suggestions">
                  {c.suggestions.map((s) => (
                    <span key={s}>{s}</span>
                  ))}
                </div>
                {status.configured && (
                  <>
                    <label className="assistant-consent">
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                      />
                      <span>{c.consent}</span>
                    </label>
                    <button
                      className="button"
                      disabled={!consent || busy}
                      onClick={() =>
                        perform(async () => {
                          const made = await api("ai/conversations", "POST", {
                            locale,
                            consent: true,
                          });
                          if (!mounted.current) return;
                          setConversation(made);
                          const data = await api("ai/conversations");
                          if (mounted.current) setHistory(data.conversations);
                        })
                      }
                    >
                      {c.start}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <>
                <div
                  className="assistant-messages"
                  role="log"
                  aria-label="Conversation messages"
                  aria-live="polite"
                >
                  {conversation.messages.length === 0 && (
                    <div className="assistant-suggestions">
                      {c.suggestions.map((s) => (
                        <button
                          key={s}
                          disabled={busy}
                          onClick={() => setText(s)}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  {conversation.messages.map((m) => (
                    <article
                      className={`assistant-message ${m.role}`}
                      key={m.id}
                    >
                      <small>{m.role === "user" ? "You" : "Chatbud AI"}</small>
                      <p>{m.content}</p>
                      {m.role === "assistant" && (
                        <button
                          className="text-button"
                          aria-label="Read reply aloud"
                          onClick={() => speak(m.content)}
                        >
                          <Volume2 size={15} />
                          Read aloud
                        </button>
                      )}
                    </article>
                  ))}
                  <div ref={messageEnd} />
                  {busy && (
                    <p className="assistant-thinking" role="status">
                      {c.thinking}
                    </p>
                  )}
                </div>
                {trace.length > 0 && (
                  <details className="assistant-trace">
                    <summary>AI specialists involved</summary>
                    <ul>
                      {trace.map((t, i) => (
                        <li key={i}>
                          {(
                            {
                              booking: "Booking assistant",
                              tracking: "Tracking assistant",
                              communications: "Communications assistant",
                              operations: "Operations assistant",
                              leads: "Lead research assistant",
                            } as Record<string, string>
                          )[t.agent] || "AI assistant"}{" "}
                          ·{" "}
                          {t.status === "completed"
                            ? "completed a check"
                            : "could not complete a check"}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {conversation.actions.map((action) => (
                  <section className="assistant-action" key={action.id}>
                    <span className="eyebrow">
                      {action.kind === "MESSAGE_DRAFT"
                        ? "DRAFT FOR YOUR REVIEW"
                        : "REVIEW BEFORE CONTINUING"}
                    </span>
                    <p>{action.summary}</p>
                    {action.payload.body && (
                      <blockquote>{action.payload.body}</blockquote>
                    )}
                    {action.payload.query && (
                      <blockquote>{action.payload.query}</blockquote>
                    )}
                    {actionResult(action) ? (
                      <p role="status">
                        <Check size={15} />
                        {actionResult(action)}
                      </p>
                    ) : (
                      <div className="request-actions">
                        <button
                          className="button"
                          disabled={busy || conversation.status !== "OPEN"}
                          onClick={() =>
                            perform(async () => {
                              await api("ai/actions", "POST", {
                                actionId: action.id,
                                decision: "confirm",
                              });
                              await load(conversation.id);
                            })
                          }
                        >
                          {action.kind === "MESSAGE_DRAFT"
                            ? "Save draft"
                            : action.kind === "LEAD_RESEARCH"
                              ? "Save research brief"
                              : c.confirm}
                        </button>
                        <button
                          className="text-button"
                          disabled={busy || conversation.status !== "OPEN"}
                          onClick={() =>
                            perform(async () => {
                              await api("ai/actions", "POST", {
                                actionId: action.id,
                                decision: "reject",
                              });
                              await load(conversation.id);
                            })
                          }
                        >
                          {c.reject}
                        </button>
                      </div>
                    )}
                  </section>
                ))}
                {conversation.status === "OPEN" ? (
                  <form
                    className="assistant-composer"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const message = text.trim();
                      if (!message || !status.configured) return;
                      recognition.current?.abort();
                      perform(async () => {
                        const prior = lastRequest.current;
                        const requestId =
                          prior?.conversationId === conversation.id &&
                          prior.text === message
                            ? prior.id
                            : crypto.randomUUID();
                        lastRequest.current = {
                          text: message,
                          id: requestId,
                          conversationId: conversation.id,
                        };
                        const reply = await api("ai/chat", "POST", {
                          conversationId: conversation.id,
                          requestId,
                          text: message,
                        });
                        if (!mounted.current) return;
                        setTrace(reply.trace || []);
                        setConversation((current) =>
                          current
                            ? {
                                ...current,
                                messages: [
                                  ...current.messages,
                                  {
                                    id: requestId,
                                    role: "user",
                                    content: message,
                                  },
                                  {
                                    id: `${requestId}-reply`,
                                    role: "assistant",
                                    content: reply.text,
                                  },
                                ],
                                actions: [...current.actions, ...reply.actions],
                              }
                            : current,
                        );
                        setText("");
                        await load(conversation.id);
                      });
                    }}
                  >
                    <label htmlFor="assistant-message">{c.message}</label>
                    <textarea
                      id="assistant-message"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      maxLength={3000}
                      rows={3}
                      disabled={busy || !status.configured}
                      placeholder={c.placeholder}
                    />
                    <div className="assistant-compose-actions">
                      <button
                        type="button"
                        className="button secondary"
                        disabled={!voiceSupported || busy || !status.configured}
                        aria-pressed={listening}
                        onClick={dictate}
                      >
                        {listening ? <MicOff size={17} /> : <Mic size={17} />}{" "}
                        {listening ? "Stop microphone" : "Use microphone"}
                      </button>
                      <button
                        className="button"
                        disabled={busy || !text.trim() || !status.configured}
                      >
                        <Send size={16} />
                        {c.send}
                      </button>
                    </div>
                    <p className="form-note">
                      Voice input uses your browser’s speech service and may
                      send audio to its provider. Review the transcript before
                      sending. Voice and language availability vary by browser.
                    </p>
                  </form>
                ) : (
                  <div className="assistant-handoff">
                    <h3>Your request is with Chatbud support.</h3>
                    <p>
                      Follow the ticket and replies in Help. This conversation
                      is paused to avoid conflicting answers.
                    </p>
                    <Link className="button" href="/help">
                      {c.human}
                    </Link>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
      <Urgent />
    </div>
  );
}

export function AgentWorkspace() {
  const { api, mode, token } = useApp();
  const [data, setData] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (mode !== "live" || !token) return;
    let active = true;
    api("ai/team")
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [mode, token]);
  if (mode !== "live")
    return (
      <p className="empty-inline">
        The AI team workspace uses live account permissions.
      </p>
    );
  if (error)
    return (
      <p className="error" role="alert">
        {error}
      </p>
    );
  if (!data) return <p role="status">Loading the AI support workspace…</p>;
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <h2>One support team. Shared context.</h2>
          <span className="status">
            {data.configured ? "AI configured" : "AI connection required"}
          </span>
        </div>
        <p className="section-copy">
          Specialists share a conversation, checked actions and a human handoff.
          Client and professional records remain protected by their account
          permissions.
        </p>
        <div className="assistant-metrics">
          <span>
            <strong>{data.counts.conversations}</strong> Conversations
          </span>
          <span>
            <strong>{data.counts.handoffs}</strong> Human handoffs
          </span>
          <span>
            <strong>{data.counts.pendingActions}</strong> Actions awaiting
            confirmation
          </span>
        </div>
      </section>
      <div className="assistant-agent-grid">
        {data.agents.map((a: any) => (
          <section className="panel" key={a.id}>
            <Bot size={22} />
            <h3>{a.name}</h3>
            <p>{a.purpose}</p>
          </section>
        ))}
      </div>
      <section className="panel">
        <h2>Channels and connections</h2>
        <p className="section-copy">
          English, Nepali and Hindi. External channels need verified accounts
          and channel-specific delivery adapters. A listed channel is not an
          active connection.
        </p>
        <div className="assistant-channels">
          {data.channels.map((channel: any) => (
            <article key={channel.id}>
              <div>
                <strong>{channel.name}</strong>
                <p>{channel.description}</p>
              </div>
              <span className="status">
                {channel.status.replaceAll("_", " ").toLowerCase()}
              </span>
            </article>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2>Lead research briefs</h2>
        <p className="section-copy">
          Ask the assistant to prepare a brief for public business partnerships
          or professional recruitment. Briefs wait for a search connector; no
          social-media search, mailbox scanning or outreach runs automatically.
        </p>
        {data.research.length === 0 ? (
          <p className="empty-inline">No research briefs queued.</p>
        ) : (
          data.research.map((r: any) => (
            <div className="record" key={r.id}>
              <div>
                <strong>{r.query}</strong>
                <p>
                  {r.platform} · {nepalTime(r.createdAt)}
                </p>
              </div>
              <span className="status">{r.status.replaceAll("_", " ")}</span>
            </div>
          ))
        )}
      </section>
      <section className="panel">
        <h2>Human handoff queue</h2>
        <p className="section-copy">
          The existing support inbox holds the ticket and messages after a
          handoff. This view shows conversation metadata, without exposing
          private AI transcripts to every staff account.
        </p>
        {data.conversations
          .filter((r: any) => r.ticketId)
          .map((r: any) => (
            <div className="record" key={r.id}>
              <strong>{languageNames[r.locale as Locale]} conversation</strong>
              <span className="status">{r.status.replaceAll("_", " ")}</span>
              <Link href="/admin/support">Open support inbox</Link>
            </div>
          ))}
        <Link href="/admin/support" className="text-button">
          View all support tickets
        </Link>
      </section>
      <AssistantDesk />
    </>
  );
}
