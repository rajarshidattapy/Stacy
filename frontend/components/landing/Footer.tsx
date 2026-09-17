'use client';
import React, { FormEvent, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { Modak } from "next/font/google";

const font = Modak({
    weight: "400",
    subsets: ["latin"],
});

// import useNewsLetter, { ClientData } from '@/lab/hooks/useNewsLetter'
import Link from 'next/link';
import ScrollBaseAnimation from '@/components/ui/scroll-text-marque';

const Footer = () => {
    const container = useRef<HTMLDivElement>(null);
    // const [Send, cilentData] = useNewsLetter()
    const [openPopup, setOpenPopUp] = useState(false);
    const ref = useRef(null);
    const isInView = useInView(ref);

    const variants = {
        visible: (i: any) => ({
            translateY: 0,
            transition: {
                type: 'spring' as const,
                stiffness: 100,
                damping: 12,
                duration: 0.4,
                delay: i * 0.08,
            },
        }),
        hidden: { translateY: 200 },
    };

    const handleNewsLetterData = (e: FormEvent) => {
        e.preventDefault();
        console.log(e);
        e.preventDefault();
        const target = e.target as HTMLFormElement;
        const formData = new FormData(target);

        const clientEmail = formData.get('newsletter_email')!;

        // const data: ClientData = {
        //   email: clientEmail.toString(),
        // }

        // Send(data)
        setOpenPopUp(true);
        target.reset();
        if (setOpenPopUp) {
            setTimeout(() => {
                setOpenPopUp(false);
            }, 2000);
        }
    };

    return (
        <>
            <div className='h-[500px] grid place-content-center'>
                <ScrollBaseAnimation
                    delay={500}
                    baseVelocity={-3}
                    clasname='font-bold tracking-[-0.07em] leading-[90%] text-[#87e64b] text-10xl md:text-8xl'
                >
                    Follow us on X!
                </ScrollBaseAnimation>
                <ScrollBaseAnimation
                    delay={500}
                    baseVelocity={3}
                    clasname='font-bold tracking-[-0.07em] leading-[90%] text-#87e64b text-10xl md:text-8xl'
                >
                    Share it if you like it
                </ScrollBaseAnimation>
            </div>

            {/* <Toast.Provider>
        <Toast.Provider swipeDirection="right">
          <Toast.Root
            className="ToastRoot"
            open={openPopup}
            onOpenChange={setOpenPopUp}
          >
            <Toast.Title className="ToastTitle">
              We Received Your Message, Thanks
            </Toast.Title>
            <Toast.Action
              className="ToastAction"
              asChild
              altText="Goto schedule to undo"
            >
              <button className="bg-white text-black px-3 py-1 rounded-lg">
                ok
              </button>
            </Toast.Action>
          </Toast.Root>
          <Toast.Viewport className="ToastViewport" />
        </Toast.Provider>
        <Toast.Viewport />
      </Toast.Provider> */}

            <div
                className='relative h-full sm:pt-14 pt-8 text-[black] overflow-hidden'
                ref={container}
            >
                <div className='sm:container  px-4 mx-auto'>
                    <div className='md:flex justify-between w-full'>
                        <div>
                            <h1 className='md:text-4xl text-2xl font-semibold'>
                                Let&lsquo;s do great work together
                            </h1>
                            <div className='pt-2 pb-6 md:w-99  '>
                                <p className='md:text-2xl text-xl  py-4'>
                                    Sign up for our updates
                                </p>
                                <div className=' hover-button relative bg-black flex justify-between items-center border-2 overflow-hidden  border-black rounded-full  text-white hover:text-black md:text-2xl'>
                                    <form
                                        onSubmit={(e) => handleNewsLetterData(e)}
                                        className='relative z-2 grid grid-cols-6  w-full h-full'
                                    >
                                        <input
                                            type='email'
                                            name='newsletter_email'
                                            suppressHydrationWarning
                                            className='border-none bg-transparent  py-3 px-6  col-span-5'
                                            placeholder='Your Email * '
                                        />{' '}
                                        <button
                                            type='submit'
                                            className='cursor-pointer w-full hover:bg-primaryColor bg-white text-white h-full cols-span-1'
                                        >
                                            <svg
                                                width='15'
                                                height='15'
                                                viewBox='0 0 15 15'
                                                fill='none'
                                                className='w-full h-[80%] '
                                                xmlns='http://www.w3.org/2000/svg'
                                            >
                                                <path
                                                    d='M8.14645 3.14645C8.34171 2.95118 8.65829 2.95118 8.85355 3.14645L12.8536 7.14645C13.0488 7.34171 13.0488 7.65829 12.8536 7.85355L8.85355 11.8536C8.65829 12.0488 8.34171 12.0488 8.14645 11.8536C7.95118 11.6583 7.95118 11.3417 8.14645 11.1464L11.2929 8H2.5C2.22386 8 2 7.77614 2 7.5C2 7.22386 2.22386 7 2.5 7H11.2929L8.14645 3.85355C7.95118 3.65829 7.95118 3.34171 8.14645 3.14645Z'
                                                    fill='#000'
                                                    fillRule='evenodd'
                                                    clipRule='evenodd'
                                                ></path>
                                            </svg>
                                        </button>
                                    </form>
                                </div>
                            </div>
                        </div>
                        <div className='flex gap-10'>
                            <ul>
                                <li className='text-2xl pb-2 text-black font-semibold'>
                                    SITEMAP
                                </li>
                                <li className='text-xl font-medium'>
                                    <Link href='/'>Home</Link>
                                </li>
                                <li className='text-xl font-medium'>
                                    <Link href='/about'>About us</Link>
                                </li>
                                <li className='text-xl font-medium'>
                                    <Link href='/services'>Our Services</Link>
                                </li>

                                <li className='text-xl font-medium'>
                                    <Link href='/projects'>Projects</Link>
                                </li>
                            </ul>
                            <ul>
                                <li className='text-2xl pb-2 text-black font-semibold'>
                                    SOCIAL
                                </li>
                                <li className='text-xl font-medium'>
                                    <a
                                        href='https://github.com/rajarshidattapy'
                                        target='_blank'
                                        className='underline'
                                    >
                                        Github
                                    </a>
                                </li>
                                <li className='text-xl font-medium'>
                                    <a
                                        href='https://x.com/stacydotide'
                                        target='_blank'
                                        className='underline'
                                    >
                                        Twitter
                                    </a>
                                </li>
                            </ul>
                        </div>
                    </div>

                    <div className="w-full h-full flex justify-center items-end pointer-events-none select-none leading-none pb-0 pt-10">
                        <h1 ref={ref} className={`${font.className} text-[24vw] md:text-[25vw] text-[#87E64B] leading-[0.75] mix-blend-normal tracking-wide uppercase whitespace-nowrap drop-shadow-[12px_12px_0px_rgba(0,0,0,1)]`} style={{ WebkitTextStroke: '3px black' }}>
                            {['S', 't', 'a', 'c', 'y'].map((letter, i) => (
                                <motion.span
                                    key={i}
                                    custom={i}
                                    variants={variants}
                                    initial="hidden"
                                    animate={isInView ? "visible" : "hidden"}
                                    className="inline-block"
                                >
                                    {letter}
                                </motion.span>
                            ))}
                        </h1>
                    </div>

                    <div className='flex md:flex-row flex-col-reverse gap-3 justify-between py-2 text-black'>
                        <span className='font-medium'>
                            &copy; 2026 Stacy. All Rights Reserved.
                        </span>
                        <a href='#' className='font-semibold'>
                            Privacy Policy
                        </a>
                    </div>
                </div>
            </div>
        </>
    );
};

export { Footer };
