"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronRight, Check, Send } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Chain = "stellar" | "evm" | "solana";
type TemplateId = "hello-world" | "audited-library";
type Mode = "agentic" | "manual";

interface ChatMessage {
  role: "ai" | "user";
  text: string;
}

const STAGES = [
  { id: 1, title: "Select Template", description: "Choose a contract template or start blank" },
  { id: 2, title: "Choose Chain", description: "Select the target blockchain network" },
  { id: 3, title: "Generate PRD", description: "Chat with AI to build your specification" },
  { id: 4, title: "Choose Mode", description: "Manual or AI-assisted development" },
  { id: 5, title: "Start Coding", description: "Launch the IDE" },
] as const;

// ---------------------------------------------------------------------------
// Mock PRD conversation script
// ---------------------------------------------------------------------------

const MOCK_SCRIPT: { aiQuestion: string; prdAppend: string }[] = [
  {
    aiQuestion:
      "Who are the end users of this contract — individual wallets, other smart contracts, or both?",
    prdAppend: "",
  },
  {
    aiQuestion:
      "Should users be able to cancel or reverse transactions, or are all transfers final once submitted?",
    prdAppend:
      "## Overview\nA Stellar smart contract enabling structured payment flows between multiple parties.\n\n**Users:** Individual wallets and external contracts.\n",
  },
  {
    aiQuestion:
      "Do you need any access-control roles — e.g. an admin or owner who can pause or configure the contract?",
    prdAppend: "**Finality:** All transfers are final once submitted. No reversal mechanism.\n",
  },
  {
    aiQuestion:
      "Should the contract emit events for every state change so off-chain systems can track activity?",
    prdAppend:
      "**Access control:** Single owner role with ability to pause contract and update fee parameters.\n",
  },
  {
    aiQuestion:
      "I have everything I need. Here's your full PRD — review it on the right. Tell me if you'd like any changes, or click **Looks good, proceed** when you're satisfied.",
    prdAppend:
      "**Events:** Emit events on every state-changing call for off-chain indexing.\n\n## Functions\n- `initialize(owner: Address)` — sets owner, called once at deploy\n- `transfer(to: Address, amount: i128)` — moves funds, emits `Transferred`\n- `pause()` / `unpause()` — owner-only circuit breaker\n- `set_fee(bps: u32)` — owner-only fee update\n\n## Storage\n- `owner: Address`\n- `paused: bool`\n- `fee_bps: u32`\n\n## Security\n- Integer overflow protection via Rust's checked arithmetic\n- All privileged calls gated by `require_auth(owner)`\n",
  },
];

// ---------------------------------------------------------------------------
// PRD Chat sub-component
// ---------------------------------------------------------------------------

function PrdChat({
  initialPrompt,
  onProceed,
}: {
  initialPrompt: string;
  onProceed: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "ai",
      text: `I've read your brief: "${initialPrompt}"\n\nLet me ask a few quick questions to sharpen the spec.\n\n${MOCK_SCRIPT[0].aiQuestion}`,
    },
  ]);
  const [prd, setPrd] = useState("");
  const [step, setStep] = useState(0);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [prdReady, setPrdReady] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  function handleSend() {
    const text = input.trim();
    if (!text || isTyping || prdReady) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setIsTyping(true);

    const nextStep = step + 1;
    setTimeout(() => {
      const entry = MOCK_SCRIPT[nextStep];
      if (!entry) return;
      if (entry.prdAppend) setPrd((prev) => prev + entry.prdAppend);
      setMessages((prev) => [...prev, { role: "ai", text: entry.aiQuestion }]);
      setIsTyping(false);
      setStep(nextStep);
      if (nextStep === MOCK_SCRIPT.length - 1) setPrdReady(true);
    }, 900 + Math.random() * 500);
  }

  return (
    <div className="flex gap-4 h-130">
      {/* Chat panel */}
      <div className="flex flex-col flex-1 border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Stacy AI</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={[
                  "max-w-[85%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-secondary text-foreground rounded-bl-sm",
                ].join(" ")}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-secondary px-4 py-3 rounded-2xl rounded-bl-sm flex gap-1 items-center">
                <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-border p-3 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder={prdReady ? "PRD is ready — proceed or request changes above" : "Reply to Stacy AI…"}
            disabled={isTyping}
            className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-40"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className="p-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-40 transition-opacity"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Live PRD panel */}
      <div className="flex flex-col w-80 border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Live PRD</span>
          {prdReady && (
            <span className="text-[10px] px-2 py-0.5 bg-primary/20 text-primary rounded-full font-medium">
              Ready
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {prd ? (
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">{prd}</pre>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              Your PRD will build here as we talk…
            </p>
          )}
        </div>

        {prdReady && (
          <div className="p-3 border-t border-border">
            <button
              onClick={onProceed}
              className="w-full py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold rounded-lg transition-colors"
            >
              Looks good, proceed →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ThinkingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPrompt = searchParams.get("prompt") || "Build me a smart contract";

  const [currentStage, setCurrentStage] = useState(0);
  const [chain, setChain] = useState<Chain>("stellar");
  const [templateId, setTemplateId] = useState<TemplateId>("hello-world");
  const [mode, setMode] = useState<Mode>("agentic");
  const [isLoading, setIsLoading] = useState(false);

  const stage = STAGES[currentStage];
  const progress = ((currentStage + 1) / STAGES.length) * 100;
  const isPrdStage = currentStage === 2;

  function canAdvance() {
    if (isPrdStage) return false; // advances via its own "proceed" button
    return true;
  }

  function handleNext() {
    if (!canAdvance()) return;
    if (currentStage < STAGES.length - 1) {
      setCurrentStage((s) => s + 1);
    } else {
      setIsLoading(true);
      setTimeout(() => {
        router.push("/generate?interactionMode=" + mode);
      }, 300);
    }
  }

  function handlePrevious() {
    if (currentStage > 0) setCurrentStage((s) => s - 1);
  }

  function renderStageContent() {
    switch (currentStage) {
      // Stage 0 — Template
      case 0:
        return (
          <div className="space-y-4">
            <p className="text-muted-foreground">Pick a template to get started quickly</p>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  { id: "hello-world" as TemplateId, label: "Blank template", soon: false },
                  { id: "audited-library" as TemplateId, label: "Audited library", soon: true },
                ] as const
              ).map(({ id, label, soon }) => (
                <button
                  key={id}
                  disabled={soon}
                  onClick={() => !soon && setTemplateId(id)}
                  className={[
                    "p-4 border rounded-lg transition-all text-left",
                    templateId === id
                      ? "border-primary bg-primary/10 text-primary"
                      : soon
                      ? "border-border text-muted-foreground opacity-50 cursor-not-allowed"
                      : "border-border hover:border-primary/50 text-foreground",
                  ].join(" ")}
                >
                  {label}
                  {soon && <span className="ml-1 text-[10px] opacity-60">soon</span>}
                </button>
              ))}
            </div>
          </div>
        );

      // Stage 1 — Chain
      case 1:
        return (
          <div className="space-y-4">
            <p className="text-muted-foreground">Which blockchain network do you want to use?</p>
            <div className="space-y-2">
              {(
                [
                  { id: "stellar" as Chain, label: "Stellar", soon: false },
                  { id: "evm" as Chain, label: "EVM", soon: true },
                  { id: "solana" as Chain, label: "Solana", soon: true },
                ] as const
              ).map(({ id, label, soon }) => (
                <button
                  key={id}
                  disabled={soon}
                  onClick={() => !soon && setChain(id)}
                  className={[
                    "w-full p-4 border rounded-lg transition-all text-left",
                    chain === id
                      ? "border-primary bg-primary/10 text-primary"
                      : soon
                      ? "border-border text-muted-foreground opacity-50 cursor-not-allowed"
                      : "border-border hover:border-primary/50 text-foreground",
                  ].join(" ")}
                >
                  <span>{label}</span>
                  {soon && <span className="ml-2 text-[10px] opacity-60">coming soon</span>}
                </button>
              ))}
            </div>
          </div>
        );

      // Stage 2 — PRD Chat
      case 2:
        return (
          <PrdChat
            initialPrompt={initialPrompt}
            onProceed={() => setCurrentStage(3)}
          />
        );

      // Stage 3 — Mode
      case 3:
        return (
          <div className="space-y-4">
            <p className="text-muted-foreground">How would you like to develop?</p>
            <div className="space-y-2">
              {(
                [
                  { id: "agentic" as Mode, title: "Agentic Mode", desc: "Let AI drive development end-to-end" },
                  { id: "manual" as Mode, title: "Manual Mode", desc: "Write code yourself with IDE assistance" },
                ] as const
              ).map(({ id, title, desc }) => (
                <button
                  key={id}
                  onClick={() => setMode(id)}
                  className={[
                    "w-full p-4 border rounded-lg transition-all text-left",
                    mode === id ? "border-primary bg-primary/10" : "border-border hover:border-primary/50",
                  ].join(" ")}
                >
                  <p className="font-semibold text-foreground">{title}</p>
                  <p className="text-sm text-muted-foreground">{desc}</p>
                </button>
              ))}
            </div>
          </div>
        );

      // Stage 4 — Summary
      case 4:
        return (
          <div className="space-y-4">
            <p className="text-muted-foreground">Everything looks good — ready to launch!</p>
            <div className="p-6 bg-card border border-border rounded-lg">
              <div className="space-y-3">
                {[
                  { label: "Template", value: templateId === "hello-world" ? "Blank template" : "Audited library" },
                  { label: "Chain", value: chain.charAt(0).toUpperCase() + chain.slice(1) },
                  { label: "Mode", value: mode === "agentic" ? "Agentic" : "Manual" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-primary" />
                    <span className="text-sm">
                      {label}: <span className="font-medium text-foreground">{value}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground flex">
      {/* Stepper Sidebar */}
      <div className="w-64 shrink-0 border-r border-border p-8">
        <div className="mb-8">
          <h1 className="text-lg font-bold text-primary mb-2">Stacy</h1>
          <p className="text-xs text-muted-foreground">Setup Wizard</p>
        </div>

        <div className="space-y-4">
          {STAGES.map((s, idx) => (
            <div key={s.id} className="flex gap-4">
              <div className="flex flex-col items-center">
                <button
                  onClick={() => idx <= currentStage && setCurrentStage(idx)}
                  className={[
                    "w-8 h-8 rounded-full flex items-center justify-center font-semibold text-xs transition-all",
                    idx < currentStage
                      ? "bg-primary text-primary-foreground"
                      : idx === currentStage
                      ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background"
                      : "bg-secondary text-foreground",
                  ].join(" ")}
                >
                  {idx < currentStage ? <Check className="w-4 h-4" /> : idx + 1}
                </button>
                {idx < STAGES.length - 1 && (
                  <div className={`w-0.5 h-8 my-1 ${idx < currentStage ? "bg-primary" : "bg-border"}`} />
                )}
              </div>

              <div className={`pt-1 text-sm ${idx === currentStage ? "text-foreground" : "text-muted-foreground"}`}>
                <p className={`font-semibold ${idx <= currentStage ? "text-foreground" : ""}`}>{s.title}</p>
                <p className="text-xs text-muted-foreground">{s.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Show the user's original prompt as context */}
        <div className="mt-8 pt-6 border-t border-border">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-2">Your prompt</p>
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">{initialPrompt}</p>
        </div>
      </div>

      {/* Main Content */}
      <div className={`flex-1 flex flex-col ${isPrdStage ? "p-8" : "items-center justify-center px-8 py-12"}`}>
        <div className={isPrdStage ? "w-full flex flex-col" : "w-full max-w-2xl"}>
          {/* Progress bar */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-3xl font-bold">{stage.title}</h2>
              <span className="text-sm text-muted-foreground">
                {currentStage + 1} / {STAGES.length}
              </span>
            </div>
            <div className="w-full h-1 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Stage content */}
          <div className={isPrdStage ? "" : "mb-12"}>
            {renderStageContent()}
          </div>

          {/* Nav buttons — hidden on PRD stage (it has its own proceed) */}
          {!isPrdStage && (
            <div className="flex gap-4 justify-between mt-8">
              <button
                onClick={handlePrevious}
                disabled={currentStage === 0}
                className="px-6 py-3 border border-border hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed text-foreground rounded-lg transition-colors"
              >
                Previous
              </button>
              <button
                onClick={handleNext}
                disabled={isLoading || !canAdvance()}
                className="px-8 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-semibold transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {currentStage === STAGES.length - 1 ? "Launch IDE" : "Next"}
                {!isLoading && <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
