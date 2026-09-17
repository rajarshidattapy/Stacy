"use client";

import { useState } from "react";
import { X, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";

interface WalletGuidePopupProps {
  isOpen: boolean;
  onClose: () => void;
}

const steps = [
  {
    title: "Install Freighter Wallet",
    description: "Visit the Chrome Web Store to install Freighter wallet extension",
    action: (
      <a
        href="https://chromewebstore.google.com/detail/freighter/bcacfldlkkdogcmkkibnjlakofdplcbk?hl=en"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-4 py-2 bg-[#4ee06a] hover:bg-[#4ee06a] text-white rounded-lg transition-colors text-sm font-medium"
      >
        Go to Chrome Web Store
        <ExternalLink className="w-4 h-4" />
      </a>
    ),
    image: null,
  },
  {
    title: "Add to Chrome",
    description: "Click on 'Add to Chrome' button to install the extension",
    action: null,
    image: "/mouse.png",
  },
  {
    title: "Connect Your Wallet",
    description: "Wallet is added! Now click on 'Connect Wallet' button to start coding",
    action: null,
    image: "/added.png",
  },
  {
    title: "Start Coding!",
    description: "You're all set! Start building amazing Stellar smart contracts",
    action: null,
    image: "/gotit.png",
  },
];

export function WalletGuidePopup({ isOpen, onClose }: WalletGuidePopupProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onClose();
      setCurrentStep(0);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleClose = () => {
    onClose();
    setCurrentStep(0);
  };

  if (!isOpen) return null;

  const step = steps[currentStep];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={handleClose}
          />

          {/* Popup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg z-50"
          >
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-zinc-100">
                    Wallet Setup Guide
                  </span>
                  <span className="text-xs text-zinc-500">
                    Step {currentStep + 1} of {steps.length}
                  </span>
                </div>
                <button
                  onClick={handleClose}
                  className="text-zinc-400 hover:text-zinc-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Progress Bar */}
              <div className="h-1 bg-zinc-800">
                <motion.div
                  className="h-full bg-[#4ee06a]"
                  initial={{ width: 0 }}
                  animate={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>

              {/* Content */}
              <div className="p-6 space-y-4">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-4"
                >
                  <h3 className="text-lg font-semibold text-zinc-100">
                    {step.title}
                  </h3>
                  <p className="text-sm text-zinc-400">{step.description}</p>

                  {/* Action Button */}
                  {step.action && (
                    <div className="pt-2">
                      {step.action}
                    </div>
                  )}

                  {/* Image */}
                  {step.image && (
                    <div className="relative w-full h-64 bg-zinc-800 rounded-lg overflow-hidden">
                      <Image
                        src={step.image}
                        alt={step.title}
                        fill
                        className="object-contain"
                        priority
                      />
                    </div>
                  )}
                </motion.div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between p-4 border-t border-zinc-800">
                <button
                  onClick={handlePrev}
                  disabled={currentStep === 0}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>

                <div className="flex gap-1">
                  {steps.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentStep(index)}
                      className={`w-2 h-2 rounded-full transition-colors ${
                        index === currentStep
                          ? "bg-[#4ee06a]"
                          : "bg-zinc-700 hover:bg-zinc-600"
                      }`}
                    />
                  ))}
                </div>

                <button
                  onClick={handleNext}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[#4ee06a] hover:bg-[#4ee06a] text-white rounded-lg transition-colors"
                >
                  {currentStep === steps.length - 1 ? "Got it!" : "Next"}
                  {currentStep < steps.length - 1 && <ChevronRight className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
