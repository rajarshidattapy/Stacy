"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useWallet } from "@/hooks/useWallet";
import { LiquidMetalButton } from "@/components/liquid-metal-button";
import { useSupabaseSession } from "@/hooks/useSupabaseSession";
import { useRouter } from "next/navigation";

export function Navbar() {
    const [scrolled, setScrolled] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const { address, status, connect, disconnect } = useWallet();
    const { session, user, loading } = useSupabaseSession();
    const router = useRouter();
    const isConnected = status === "connected" && address;
    const isConnecting = status === "connecting";

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 20);
        };
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    const handleWalletClick = async () => {
        if (isConnected) {
            disconnect();
        } else {
            await connect();
        }
    };

    const handlePrimaryCta = () => {
        if (!loading && !session) {
            router.push("/auth/login?next=/");
            return;
        }
        // Authenticated users can go straight to wallet connect
        handleWalletClick();
    };

    const formatAddress = (addr: string) => {
        return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
    };

    const avatarUrl = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;
    const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || "User";
    const userInitial = displayName?.charAt(0)?.toUpperCase() || "U";

    const renderLabel = () => {
        if (loading) return "Loading...";
        if (!session) return "Connect Option";

        return (
            <span className="flex items-center gap-2 text-white">
                <span className="relative h-7 w-7 overflow-hidden rounded-full border border-white/30 bg-white/10">
                    {avatarUrl ? (
                        <Image
                            src={avatarUrl}
                            alt={`${displayName} avatar`}
                            fill
                            className="object-cover"
                            sizes="28px"
                        />
                    ) : (
                        <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-white/80">
                            {userInitial}
                        </span>
                    )}
                </span>
                <span className="text-sm font-semibold leading-tight">
                    {isConnecting
                        ? "Connecting..."
                        : isConnected
                        ? formatAddress(address!)
                        : "Connect wallet"}
                </span>
            </span>
        );
    };

    return (
        <nav className="fixed z-50 w-full px-2 pt-7 top-0 left-0 right-0">
            <div
                className={cn(
                    "mx-auto px-4 sm:px-6 transition-all duration-500 ease-out lg:px-5",
                    scrolled
                        ? "max-w-4xl rounded-full border border-white/20 bg-white/10 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] ring-1 ring-white/10"
                        : "max-w-6xl rounded-full border border-white/20 bg-white/10 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.08)] ring-1 ring-white/10"
                )}
            >
                <div className="relative flex items-center justify-between py-3 lg:py-4">
                    {/* Logo Section */}
                    <Link href="/" className="flex items-center gap-2">
                        <Image
                            src="/logo.webp"
                            alt="Stacy Logo"
                            width={32}
                            height={32}
                            className="h-8 w-8 object-contain"
                            onError={(e) => {
                                e.currentTarget.style.display = 'none';
                            }}
                        />
                        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-clip-text text-transparent relative">
                            <span className="relative inline-block bg-gradient-to-r from-white/90 via-primary/80 to-white/70 bg-clip-text text-transparent">
                                Stacy
                                <span className="absolute -inset-1 bg-gradient-to-r from-white/60 via-transparent to-white/40 opacity-30 blur-xl pointer-events-none animate-pulse" aria-hidden="true" />
                            </span>
                        </h1>
                    </Link>

                    {/* Desktop Navigation - Connect Wallet */}
                    <div className="hidden md:flex items-center gap-3">
                        <LiquidMetalButton
                            label={renderLabel()}
                            onClick={handlePrimaryCta}
                            width={190}
                        />
                    </div>

                    {/* Mobile Menu Button */}
                    <button
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        className="md:hidden p-2 rounded-lg hover:bg-white/10 transition-colors text-white"
                        aria-label="Toggle menu"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {mobileMenuOpen ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                            )}
                        </svg>
                    </button>
                </div>
            </div>

            {/* Mobile Menu */}
            {mobileMenuOpen && (
                <>
                    <div
                        className="md:hidden fixed inset-0 bg-black/50 backdrop-blur-sm top-[72px]"
                        onClick={() => setMobileMenuOpen(false)}
                    />
                    <div className="md:hidden fixed top-[72px] left-2 right-2 bg-white/10 backdrop-blur-2xl rounded-2xl border border-white/20 shadow-2xl p-4 space-y-2 z-50 ring-1 ring-white/10 flex justify-center">
                        <LiquidMetalButton
                            label={renderLabel()}
                            onClick={() => {
                                handlePrimaryCta();
                                setMobileMenuOpen(false);
                            }}
                            width={280}
                        />
                    </div>
                </>
            )}
        </nav>
    );
}
