"use client";
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X } from "lucide-react";

type FAQItem = {
    question: string;
    answer: string;
};

const faqs: FAQItem[] = [
    {
        question: "Do I need to install Rust or the Stellar CLI?",
        answer:
            "No. Stacy is a complete zero-setup environment that handles Rust, Soroban CLI, and all dependencies in the cloud.",
    },
    {
        question: "How does the AI know about the latest Soroban updates?",
        answer:
            "Stella RAG is trained on official and up-to-date Stellar documentation, ensuring accurate and current guidance.",
    },
    {
        question: "Is my code secure?",
        answer:
            "Yes. Every project runs in its own isolated Docker sandbox. You can safely compile, test, and push directly to your GitHub repository.",
    },
    {
        question: "Can I generate client-side code?",
        answer:
            "Absolutely. Stacy automatically generates TypeScript bindings so you can integrate contracts into your frontend immediately.",
    },
];

const FAQRow = ({
    item,
    isOpen,
    onClick,
}: {
    item: FAQItem;
    isOpen: boolean;
    onClick: () => void;
}) => {
    return (
        <div className="border-t-2 border-black last:border-b-2">
            <button
                onClick={onClick}
                className="w-full flex items-center justify-between py-10 text-left group hover:bg-black/5 transition-colors px-2"
            >
                <span className="text-black text-xl md:text-2xl font-bold tracking-tight transition-colors">
                    {item.question}
                </span>

                {/* Icon */}
                <span className="text-black transition-transform duration-300">
                    {isOpen ? <X size={28} strokeWidth={2.5} /> : <Plus size={28} strokeWidth={2.5} />}
                </span>
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="overflow-hidden"
                    >
                        <p className="text-black/70 text-lg md:text-xl leading-relaxed max-w-3xl pb-10 px-2 font-medium">
                            {item.answer}
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default function FAQ() {
    const [openIndex, setOpenIndex] = useState<number | null>(0);

    return (
        <section className="text-white px-6 py-40 border-t border-white/5">
            <div className="max-w-[90rem] mx-auto">
                {/* Title */}
                <h2 className="text-6xl md:text-7xl font-bold mb-24 tracking-tighter text-black uppercase text-center">
                    FAQ
                </h2>

                {/* List */}
                <div className="flex flex-col">
                    {faqs.map((item, i) => (
                        <FAQRow
                            key={i}
                            item={item}
                            isOpen={openIndex === i}
                            onClick={() => setOpenIndex(openIndex === i ? null : i)}
                        />
                    ))}
                </div>
            </div>
        </section>
    );
}