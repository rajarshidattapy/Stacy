import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { IntentBox } from "@/components/landing/IntentBox";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Logos } from "@/components/landing/Marquee";
import ScrollRevealGallery from "@/components/landing/ScrollRevealGallery";
import StacyBentoGrid from "@/components/landing/BentoGrid";
import FAQ from "@/components/landing/Faq";
import { Footer } from "@/components/landing/Footer";
import { ReactLenis } from 'lenis/react';



export default function LandingPage() {
  return (
    <ReactLenis root>
      <main className="flex flex-col w-full min-h-screen bg-[#fbe1b1] text-[#354230]">
        <Navbar />
        <div className="relative z-10 flex flex-col items-center w-full min-h-screen px-6 pt-[10vh] pb-20 overflow-hidden">
          <Hero />
          <IntentBox />
        </div>
        <Logos />
        {/* <ScrollRevealGallery /> */}
        <StacyBentoGrid />
        <HowItWorks />
        <FAQ />
        <Footer />
      </main>
    </ReactLenis>
  );
}