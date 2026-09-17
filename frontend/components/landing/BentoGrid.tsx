"use client";
import React, { useEffect, useState } from "react";
import { Terminal, Cpu, Shield, Zap, Code2, Rocket, Layout, Globe, Box, Plus } from "lucide-react";
import { motion } from "framer-motion";


const TerminalGraphic = () => {
  return (
    <div className="w-full h-full flex flex-col gap-4 font-mono text-sm text-neutral-600">
      {/* Command Bar */}
      <div className="flex-none border-2 border-black p-2 rounded-lg bg-white/50 flex flex-col justify-center gap-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
        <div className="flex items-center gap-2 px-1">
          <span className="text-[#FFA500] font-bold">{">"}</span>
          <span className="text-neutral-600">cat src/lib.rs</span>
        </div>
        {/* Progress Bar */}
        <div className="h-3 w-full bg-transparent rounded-full overflow-hidden border-2 border-black p-[1px] opacity-60">
          <div className="h-full w-full bg-neutral-200 rounded-full overflow-hidden relative">
            <div className="h-full bg-neutral-400 w-full" />
          </div>
        </div>
      </div>

      {/* Code Window */}
      <div className="flex-grow border-2 border-black border-t-[6px] p-4 rounded-xl bg-white/80 relative overflow-hidden flex flex-col shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <div className="absolute top-3 right-3 flex gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full border border-black/10" />
          <div className="w-1.5 h-1.5 rounded-full border border-black/10" />
        </div>

        <div className="space-y-1 pt-1 opacity-95 text-xs">
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ delay: 0.1 }}>
            <span className="text-purple-600">use</span> <span className="text-black">stacy_sdk::contract;</span>
          </motion.div>

          <div className="pt-2">
            <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ delay: 0.2 }}>
              <span className="text-yellow-600">#[contract]</span>
            </motion.div>
            <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ delay: 0.3 }}>
              <span className="text-purple-600">pub struct</span> <span className="text-blue-600">Counter;</span>
            </motion.div>
          </div>

          <div className="pt-2">
            <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ delay: 0.4 }}>
              <span className="text-yellow-600">#[contractimpl]</span>
            </motion.div>
            <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ delay: 0.5 }}>
              <span className="text-purple-600">impl</span> <span className="text-blue-600">Counter</span> {"{"}
            </motion.div>

            {/* Methods */}
            <div className="pl-4 border-l border-black/10 space-y-2 mt-1">

              {/* Increment */}
              <div>
                <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ delay: 0.6 }}>
                  <span className="text-purple-600">pub fn</span> <span className="text-blue-600">increment</span>(env: Env, count: u32) -{">"} u32 {"{"}
                </motion.div>
                <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ delay: 0.7 }} className="pl-4">
                  <span className="text-black">count + 1</span>
                </motion.div>
                <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ delay: 0.8 }}>
                  {"}"}
                </motion.div>
              </div>

              {/* Decrement */}
              <div>
                <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ delay: 0.9 }}>
                  <span className="text-purple-600">pub fn</span> <span className="text-blue-600">decrement</span>(env: Env, count: u32) -{">"} u32 {"{"}
                </motion.div>
                <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ delay: 1.0 }} className="pl-4">
                  <span className="text-black">count - 1</span>
                </motion.div>
                <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ delay: 1.1 }}>
                  {"}"}
                </motion.div>
              </div >

              {/* Get Count */}
              < div >
                <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ delay: 1.2 }}>
                  <span className="text-purple-600">pub fn</span> <span className="text-blue-600">get_count</span>(env: Env) -{">"} u32 {"{"}
                </motion.div>
                <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ delay: 1.3 }} className="pl-4">
                  <span className="text-black">env.storage().get(COUNTER)</span>
                </motion.div>
                <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ delay: 1.4 }}>
                  {"}"}
                </motion.div>
              </div >

              {/* Reset */}
              < div >
                <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ delay: 1.5 }} className="mt-2">
                  <span className="text-purple-600">pub fn</span> <span className="text-blue-600">reset</span>(env: Env) {"{"}
                </motion.div>
                <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ delay: 1.6 }} className="pl-4">
                  <span className="text-black">env.storage().set(COUNTER, 0)</span>
                </motion.div>
                <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ delay: 1.7 }}>
                  {"}"}
                </motion.div>
              </div >

            </div >

            <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ delay: 1.5 }} className="mt-1">
              {"}"}
            </motion.div>
          </div >
        </div >
      </div >
    </div >
  )
}

// 2. Isometric Layers (Middle Top)
const LayersGraphic = () => {
  return (
    <div className="w-full h-full flex items-center justify-center p-4">
      <svg viewBox="0 0 200 220" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full max-w-[280px]">
        <defs>
          <pattern id="grid-pattern" x="0" y="0" width="4" height="4" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.5" fill="#666" fillOpacity="0.5" />
          </pattern>
          <filter id="noise-texture">
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
        </defs>

        {/* Main Group Centered */}
        <g transform="translate(100, 110)">

          {/* --- BOTTOM LAYER --- */}
          <g transform="translate(0, 60)">
            {/* Layer Shape */}
            <path d="M-70 0 L0 30 L70 0 L0 -30 Z" stroke="#1A1A1A" strokeOpacity="1" strokeWidth="1" fill="#F5F5F0" fillOpacity="0.9" />
            {/* Black Dot */}
            <circle cx="-30" cy="0" r="4" fill="#1A1A1A" stroke="#F5F5F0" strokeWidth="1" />
            {/* Grey Dots */}
            <circle cx="10" cy="10" r="3" fill="#1A1A1A" fillOpacity="0.3" />
            <circle cx="30" cy="5" r="3" fill="#1A1A1A" fillOpacity="0.3" />
          </g>

          {/* --- MIDDLE LAYER --- */}
          <g transform="translate(0, 0)">
            {/* Layer Shape */}
            <path d="M-70 0 L0 30 L70 0 L0 -30 Z" stroke="#1A1A1A" strokeOpacity="1" strokeWidth="1" fill="#EAE7DD" fillOpacity="0.9" />
            {/* Orange Dots */}
            <circle cx="0" cy="5" r="4" fill="#D98E28" />
            <circle cx="20" cy="15" r="4" fill="#D98E28" />
            {/* Connection between orange dots */}
            <path d="M0 5 L20 15" stroke="#D98E28" strokeWidth="2" />
            {/* Grey Dot */}
            <circle cx="40" cy="-5" r="3" fill="#1A1A1A" fillOpacity="0.3" />
          </g>

          {/* --- TOP LAYER --- */}
          <g transform="translate(0, -60)">
            {/* Layer Shape */}
            <path d="M-70 0 L0 30 L70 0 L0 -30 Z" stroke="#1A1A1A" strokeOpacity="1" strokeWidth="1" fill="url(#grid-pattern)" />
            {/* Blue Dot */}
            <circle cx="-30" cy="5" r="4" fill="#3B82F6" />
          </g>


          <path
            d="M-30 -55 
                           C -30 -25, 0 -25, 0 5
                           L 20 15
                           C 20 45, -30 35, -30 60"
            stroke="#1A1A1A"
            strokeWidth="1.5"
            fill="none"
            strokeDasharray="4 2"
            className="opacity-40"
          />



        </g>
      </svg>
    </div>
  )
}

// 3. Language Blocks (Right Top)
const LanguagesGraphic = () => {
  return (
    <div className="relative w-full h-full p-4 overflow-hidden">
      {/* Grid Background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#333_1px,transparent_1px),linear-gradient(to_bottom,#333_1px,transparent_1px)] bg-[size:20px_20px] opacity-10" />

      <div className="grid grid-cols-2 gap-4 h-full content-center relative z-10">
        {/* Block 1 */}
        <div className="bg-white text-black font-bold font-mono text-xs p-2 text-center border-2 border-black transform hover:-translate-y-1 transition-transform shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          JS
        </div>
        {/* Block 2 */}
        <div className="bg-white text-black font-bold font-mono text-xs p-2 text-center border-2 border-black transform hover:-translate-y-1 transition-transform translate-y-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          RUST
        </div>
        {/* Block 3 */}
        <div className="bg-white text-black font-bold font-mono text-xs p-2 text-center border-2 border-black transform hover:-translate-y-1 transition-transform col-span-2 w-2/3 mx-auto shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          WASM
        </div>
      </div>
    </div>
  )
}

// 4. Ticket/Shield (Middle Bottom)
const SecurityGraphic = () => {
  return (
    <div className="w-full h-full flex items-center justify-center relative p-6">
      {/* Ticket Shape */}
      <div className="relative bg-[#EAE7DD] border-2 border-black w-48 h-24 flex items-center justify-center overflow-hidden transform hover:scale-105 transition-transform duration-300 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <div className="absolute -left-1.5 top-0 bottom-0 w-3 flex flex-col justify-between py-1">
          {[...Array(8)].map((_, i) => <div key={i} className="w-2.5 h-2.5 rounded-full bg-[#fbe1b1] border border-black" />)}
        </div>
        <div className="absolute -right-1.5 top-0 bottom-0 w-3 flex flex-col justify-between py-1">
          {[...Array(8)].map((_, i) => <div key={i} className="w-2.5 h-2.5 rounded-full bg-[#fbe1b1] border border-black" />)}
        </div>

        <span className="font-mono font-bold text-[#D98E28]/80 text-2xl tracking-[0.2em] rotate-[-5deg]">SECURE</span>
      </div>
    </div>
  )
}

// 5. Puzzle Pieces (Right Bottom)
const IntegrationGraphic = () => {
  return (
    <div className="w-full h-full flex items-center justify-center p-4">
      <svg width="200" height="200" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full max-w-[200px] max-h-[200px]">
        <defs>
          {/* Pattern 1: Grid/Dots for Floating Piece */}
          <pattern id="grid-dots" x="0" y="0" width="4" height="4" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.5" fill="#666" />
          </pattern>

          {/* Pattern 2: Gradient Lines for Bottom Left */}
          <linearGradient id="gradient-lines" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#1A1A1A" stopOpacity="0.1" />
            <stop offset="50%" stopColor="#1A1A1A" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#1A1A1A" stopOpacity="0.1" />
          </linearGradient>

          {/* Pattern 3: Noise/Speckle for Bottom Right */}
          <filter id="noise">
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <pattern id="grain" width="100" height="100" patternUnits="userSpaceOnUse">
            <rect width="100" height="100" fill="#EAE7DD" fillOpacity="0.2" />
            <rect width="100" height="100" filter="url(#noise)" opacity="0.3" />
          </pattern>
        </defs>

        {/* Group centered */}
        <g transform="translate(25, 25) scale(0.75)">

          {/* Top Left: Outline Only */}
          {/* Shape: Square with cutout right and cutout bottom */}
          <path d="M0 0 H100 V35 A15 15 0 0 0 100 65 V100 H65 A15 15 0 0 0 35 100 H0 V0 Z" stroke="#1A1A1A" strokeWidth="1" strokeOpacity="0.6" fill="none" />

          {/* Bottom Left: Gradient Filled */}
          {/* Shape: Square with tab top, tab right */}
          <path d="M0 100 H35 A15 15 0 0 1 65 100 H100 V135 A15 15 0 0 1 100 165 V200 H0 V100 Z" fill="url(#gradient-lines)" stroke="#1A1A1A" strokeWidth="1" strokeOpacity="0.6" />
          {/* Add vertical lines texture effect manually approx */}
          <path d="M20 100 V200 M30 100 V200 M40 100 V200 M50 100 V200 M60 100 V200 M70 100 V200 M80 100 V200" stroke="#1A1A1A" strokeOpacity="0.1" strokeWidth="2" />

          {/* Bottom Right: Grain/Speckle */}
          {/* Shape: Square with cutout left, tab top */}
          <path d="M100 200 V165 A15 15 0 0 0 100 135 V100 H135 A15 15 0 0 1 165 100 H200 V200 H100 Z" fill="url(#grain)" stroke="#1A1A1A" strokeWidth="1" strokeOpacity="0.6" />

          {/* Floating Piece: Top Right (Rotated) */}
          {/* Shape: Matches spacing of others */}
          <g transform="translate(130, -20) rotate(15)">
            {/* Cutout bottom and left to match puzzle logic? 
                            The image shows a standard puzzle piece shape.
                            Let's draw a generic "out-out-in-in" piece.
                        */}
            <path d="M0 0 H35 A15 15 0 0 1 65 0 H100 V35 A15 15 0 0 0 100 65 V100 H65 A15 15 0 0 0 35 100 H0 V65 A15 15 0 0 1 0 35 V0 Z" fill="#EAE7DD" fillOpacity="1" />
            <path d="M0 0 H35 A15 15 0 0 1 65 0 H100 V35 A15 15 0 0 0 100 65 V100 H65 A15 15 0 0 0 35 100 H0 V65 A15 15 0 0 1 0 35 V0 Z" fill="url(#grid-dots)" stroke="#1A1A1A" strokeWidth="1" strokeOpacity="0.6" />
          </g>

        </g>
      </svg>
    </div>
  )
}


/* ---------- Card Container ---------- */

const Card = ({
  header,
  description,
  children,
  className = "",
  delay = 0
}: {
  header: string;
  description: string;
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay }}
    viewport={{ once: true }}
    className={`flex flex-col p-4 border-2 border-black bg-[#FFA500] overflow-hidden rounded-3xl hover:-translate-y-1 transition-all duration-300 relative group shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] ${className}`}
  >
    {/* Text Section */}
    <div className="p-5 z-10 relative">
      <h3 className="text-base font-mono font-bold tracking-wider text-[#1A1A1A] uppercase mb-2">
        {header}
      </h3>
      <p className="text-sm leading-snug text-neutral-600 font-medium tracking-tight">
        {description}
      </p>
    </div>

    {/* Graphic Section */}
    <div className="flex-grow bg-[#FFF3E0] relative flex items-center justify-center overflow-hidden p-4 rounded-xl border-2 border-black shadow-inner">
      {children}
    </div>
  </motion.div>
);

/* ---------- Main Bento Grid ---------- */

export default function StacyBentoGrid() {
  return (
    <section className="min-h-screen flex flex-col items-center justify-center px-4 py-24 md:px-8 md:pt-40 md:pb-24 border-t border-white/10">
      <div className="max-w-[90%] mx-auto w-full">
        <h2 className="text-6xl md:text-7xl font-bold mb-24 tracking-tighter text-black uppercase text-center tracking-tight">
          Features
        </h2>
      </div>
      <div className="max-w-[90%] w-full grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[minmax(320px,auto)]">

        {/* 1. LEFT COLUMN - TALL (SIMPLE AND POWERFUL) */}
        <Card
          header="SIMPLE AND POWERFUL"
          description="From notebook to production, prototype, iterate, and deploy your application with Stacy."
          className="md:row-span-2"
          delay={0.1}
        >
          <TerminalGraphic />
        </Card>

        {/* 2. MIDDLE TOP - FULL FEATURES PACKED */}
        <Card
          header="FULL FEATURES PACKED"
          description="Everything you need for Soroban development: Compilation, Testing, Deployment."
          delay={0.2}
        >
          <LayersGraphic />
        </Card>

        {/* 3. RIGHT TOP - SPEAKS YOUR LANGUAGE */}
        <Card
          header="SPEAKS YOUR LANGUAGE"
          description="Clients for JS, Rust, Python, and more. Auto-generated bindings."
          delay={0.3}
        >
          <LanguagesGraphic />
        </Card>

        {/* 4. MIDDLE BOTTOM - FREE */}
        <Card
          header="OPEN SOURCE"
          description="Fully open source under MIT License. Built for the community."
          delay={0.4}
        >
          <SecurityGraphic />
        </Card>

        {/* 5. RIGHT BOTTOM - INTEGRATED */}
        <Card
          header="INTEGRATED"
          description="Embedding models, GitHub Sync, and Freighter Wallet built in."
          delay={0.5}
        >
          <IntegrationGraphic />
        </Card>

      </div>
    </section>
  );
}
