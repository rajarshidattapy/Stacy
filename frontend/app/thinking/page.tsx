import ThinkingPage from "@/components/thinking/ThinkingPage";
import { Suspense } from "react";

export default function Thinking() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-[#030712] text-white flex items-center justify-center">Loading...</div>}>
            <ThinkingPage />
        </Suspense>
    );
}
