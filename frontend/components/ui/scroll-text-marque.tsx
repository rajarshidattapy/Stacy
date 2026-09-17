'use client';
import { useRef } from 'react';
import {
    motion,
    useScroll,
    useSpring,
    useTransform,
    useMotionValue,
    useVelocity,
    useAnimationFrame
} from 'framer-motion';
import { cn } from '@/lib/utils';

// Formatting function to ensure consistent spacing
const wrap = (min: number, max: number, v: number) => {
    const rangeSize = max - min;
    return ((((v - min) % rangeSize) + rangeSize) % rangeSize) + min;
};

interface ScrollBaseAnimationProps {
    children: string;
    baseVelocity: number;
    clasname?: string;
    delay?: number; // Not typically used in velocity scroll but included for prop compatibility
}

export default function ScrollBaseAnimation({
    children,
    baseVelocity = 100,
    clasname,
    delay = 0
}: ScrollBaseAnimationProps) {
    const baseX = useMotionValue(0);
    const { scrollY } = useScroll();
    const scrollVelocity = useVelocity(scrollY);
    const smoothVelocity = useSpring(scrollVelocity, {
        damping: 50,
        stiffness: 400
    });
    const velocityFactor = useTransform(smoothVelocity, [0, 1000], [0, 5], {
        clamp: false
    });

    /**
     * This is a magic number for the transform range.
     * You might need to adjust this based on the length of the new text.
     */
    const x = useTransform(baseX, (v) => `${wrap(-20, -45, v)}%`);

    const directionFactor = useRef<number>(1);
    useAnimationFrame((t, delta) => {
        let moveBy = directionFactor.current * baseVelocity * (delta / 1000);

        /**
         * This is what changes the direction of the scroll once we
         * switch scrolling directions.
         */
        if (velocityFactor.get() < 0) {
            directionFactor.current = -1;
        } else if (velocityFactor.get() > 0) {
            directionFactor.current = 1;
        }

        moveBy += directionFactor.current * moveBy * velocityFactor.get();

        baseX.set(baseX.get() + moveBy);
    });

    /**
     * The number of times to repeat the child text should be dynamic based on
     * screen size, but for simplicity we repeat it 4 times. 
     */
    return (
        <div className="overflow-hidden whitespace-nowrap flex flex-nowrap">
            <motion.div
                className={cn("flex flex-nowrap text-nowrap gap-4", clasname)} // Applying clasname here
                style={{ x }}
            >
                <span className="block mr-8">{children}</span>
                <span className="block mr-8">{children}</span>
                <span className="block mr-8">{children}</span>
                <span className="block mr-8">{children}</span>
                <span className="block mr-8">{children}</span>
                <span className="block mr-8">{children}</span>
                <span className="block mr-8">{children}</span>
                <span className="block mr-8">{children}</span>
            </motion.div>
        </div>
    );
}