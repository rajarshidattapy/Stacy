import { Marquee } from "@/components/ui/marquee"
import Image from "next/image"

const companies = [
    {
        name: "Stellar",
        url: "/stellar.png",
    },
    {
        name: "RiseIn",
        url: "/risein.png",
    },
    {
        name: "Github",
        url: "/github.png",
    },
    {
        name: "Vercel",
        url: "/vercel.png",
    },
]

export function Logos() {
    return (
        <section id="logos" className="w-full py-10 overflow-hidden">
            <Marquee className="max-w-full [--duration:12s]">
                {companies.map((company, idx) => (
                    <div
                        key={idx}
                        className="flex items-center justify-center mx-16 h-24 w-60"
                    >
                        <Image
                            width={240}
                            height={100}
                            src={company.url || "/placeholder.svg"}
                            className="object-contain h-full w-full brightness-0 opacity-80 hover:opacity-100 transition-opacity duration-300"
                            alt={company.name}
                        />
                    </div>
                ))}
            </Marquee>
        </section>
    )
}