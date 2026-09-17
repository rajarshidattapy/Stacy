"use client";
import React, { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

const items = [
    { img: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=800&q=80" },
    { img: "https://i.pinimg.com/1200x/db/e5/70/dbe5704daf759bfac2b1ab571b522486.jpg" },
    { img: "https://www.shutterstock.com/image-photo/ai-coding-assistant-programming-support-600nw-2646179527.jpg" },
    { img: "https://cdn.sanity.io/images/e2r40yh6/production-i18n/523d64dc7b8ef7e4aa43fc590b53e2bab47acccd-4200x3508.png?w=506&auto=format&dpr=2" },
];

const container = {
    hidden: {},
    show: {
        transition: {
            staggerChildren: 0.2,
        },
    },
};

const card = {
    hidden: { opacity: 0, scale: 0.8 },
    show: {
        opacity: 1,
        scale: 1,
        transition: {
            type: "spring" as const,
            stiffness: 50,
            damping: 20,
            duration: 1
        },
    },
};

export default function ScrollRevealGallery() {
    const ref = useRef(null);
    const { scrollYProgress } = useScroll({
        target: ref,
        offset: ["start end", "end start"], // Track from when section enters bottom to when it leaves top
    });

    const yEven = useTransform(scrollYProgress, [0, 1], [0, -250]);
    const yOdd = useTransform(scrollYProgress, [0, 1], [0, 150]);

    return (
        <section ref={ref} className="min-h-screen text-white flex flex-col items-center justify-center px-4 py-40 overflow-hidden">
            <motion.div
                className="flex gap-8 md:gap-16 items-center justify-center flex-wrap"
                variants={container}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-100px" }}
            >
                {items.map((item, i) => {
                    const isOdd = i % 2 !== 0;
                    const y = isOdd ? yOdd : yEven;

                    return (
                        <motion.div
                            key={i}
                            variants={card}
                            style={{ y }}
                            className={`flex flex-col items-center relative group ${isOdd ? "mt-12 md:mt-16" : "-mt-6 md:-mt-8"}`}
                        >
                            {/* Image Container - PROPER CIRCLE */}
                            <div className="relative overflow-hidden rounded-full shadow-2xl transition-all duration-500 bg-[#E5D7C4] border border-white/10 group-hover:border-[#00ff9d]/50 group-hover:shadow-[0_0_40px_rgba(0,255,157,0.3)] w-72 h-72 md:w-96 md:h-96">
                                <motion.img
                                    src={item.img}
                                    alt=""
                                    className="w-full h-full object-cover filter brightness-[0.8] grayscale-[30%] group-hover:grayscale-0 group-hover:brightness-100 transition-all duration-500"
                                    whileHover={{ scale: 1.1 }}
                                />
                                {/* ADDED MASK OVERLAY EFFECT */}
                                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/60 opacity-60 group-hover:opacity-40 transition-opacity duration-300" />
                            </div>
                        </motion.div>
                    );
                })}
            </motion.div>

            {/* Description */}
            <motion.div
                className="max-w-2xl text-center mt-32 relative z-10 px-6"
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 0.8, y: 0 }}
                transition={{ delay: 0.6, duration: 0.8 }}
                viewport={{ once: true }}
            >
            </motion.div>
        </section>
    );
}