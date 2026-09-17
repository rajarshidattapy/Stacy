"use client";
import React, { useState } from "react";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronRight,
  Home,
  LayoutTemplate,
  Plus,
  Search,
  Settings,
} from "lucide-react";
import Link from "next/link";
import AccountsDialog from "@/components/layout/AccountsDialog";

type WalletStatus = "disconnected" | "connecting" | "connected" | "error";

interface HomeSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onToggle?: () => void;
  walletAddress?: string | null;
  walletStatus?: WalletStatus;
}

const NavItem = ({
  icon: Icon,
  label,
  active = false,
  href,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  href?: string;
  onClick?: () => void;
}) => {
  const cls = cn(
    "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13.5px] transition-colors group",
    active
      ? "bg-white/[0.07] text-white"
      : "text-zinc-400 hover:bg-white/4 hover:text-zinc-200",
  );
  const iconCls = cn(
    "shrink-0 transition-colors",
    active ? "text-white" : "text-zinc-500 group-hover:text-zinc-300",
  );

  if (href) {
    return (
      <Link href={href} className={cls}>
        <Icon size={17} className={iconCls} />
        <span className="font-medium">{label}</span>
      </Link>
    );
  }
  return (
    <button className={cls} onClick={onClick}>
      <Icon size={17} className={iconCls} />
      <span className="font-medium">{label}</span>
    </button>
  );
};

const SectionHeader = ({ label, open = true }: { label: string; open?: boolean }) => (
  <div className="flex items-center justify-between px-3 py-1.5 mt-3 mb-0.5 cursor-pointer group">
    <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 group-hover:text-zinc-400 transition-colors">
      {label}
    </span>
    {open ? (
      <ChevronDown size={13} className="text-zinc-600" />
    ) : (
      <ChevronRight size={13} className="text-zinc-600" />
    )}
  </div>
);

export function HomeSidebar({ isOpen, onClose, walletAddress, walletStatus }: HomeSidebarProps) {
  const [isAccountOpen, setIsAccountOpen] = useState(false);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed top-12 bottom-0 left-0 right-0 z-99"
        onClick={onClose}
      />

      <div
        className="fixed top-12 bottom-0 left-0 flex flex-col z-100"
        style={{ width: 248 }}
        onMouseLeave={onClose}
      >
        <div
          className="flex flex-col bg-[#0f0f0f] border border-white/[0.07]"
          style={{
            height: "100%",
            borderRadius: "0 20px 20px 0",
            boxShadow: "4px 0 24px rgba(0,0,0,0.5)",
          }}
        >
          {/* New Chat button */}
          <div className="px-3 pt-4 pb-2 shrink-0">
            <button className="w-full flex items-center justify-between bg-zinc-900/80 border border-white/8 hover:bg-zinc-800/80 text-white rounded-xl px-4 py-2.5 transition-all group">
              <span className="font-semibold text-[14px]">New Chat</span>
              <div className="flex items-center gap-1 pl-3 border-l border-white/8">
                <Plus size={13} className="text-zinc-500 group-hover:text-zinc-300 transition-colors" />
                <ChevronDown size={14} className="text-zinc-500 group-hover:text-zinc-300 transition-colors" />
              </div>
            </button>
          </div>

          {/* Nav */}
          <div
            className="flex-1 min-h-0 overflow-y-auto px-2 py-1 space-y-0.5"
            style={{ scrollbarWidth: "none" }}
          >
            <NavItem icon={Search} label="Search" />
            <NavItem icon={Home} label="Home" href="/" active />
            <NavItem icon={LayoutTemplate} label="Templates" />

            <SectionHeader label="Recent Chats" />
            <div className="px-3 py-4 text-center">
              <p className="text-[12px] text-zinc-600">No recent chats</p>
            </div>
          </div>

          {/* Account box — bottom */}
          <div className="px-3 pb-4 pt-2 shrink-0">
            <div className="border border-white/[0.07] rounded-xl overflow-hidden bg-white/2">
              <button
                onClick={() => setIsAccountOpen(true)}
                className="w-full flex items-center gap-3 px-3 py-3 hover:bg-white/4 transition-colors group"
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0 shadow-sm"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)" }}
                >
                  M
                </div>
                <div className="flex flex-col items-start min-w-0 flex-1">
                  <span className="text-[13px] font-semibold text-zinc-200 truncate w-full text-left">
                    My Account
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Settings
                  </span>
                </div>
                <Settings
                  size={14}
                  className="text-zinc-600 group-hover:text-zinc-400 transition-colors shrink-0"
                />
              </button>
            </div>
          </div>
        </div>
      </div>

      <AccountsDialog
        isOpen={isAccountOpen}
        onClose={() => setIsAccountOpen(false)}
        walletAddress={walletAddress}
        walletStatus={walletStatus}
      />
    </>
  );
}
