export function Hero() {
    return (
        <>
            <div className="w-full h-[53vh]" aria-hidden="true" />

            {/* Absolute video background - moves with the parent container */}
            <video
                autoPlay
                muted
                loop
                playsInline
                className="absolute inset-0 w-full h-full object-cover pointer-events-none -z-10"
                style={{ objectPosition: "0% 25%" }}
            >
                <source src="/video.mp4" type="video/mp4" />
            </video>

            {/* Gradient overlay to blend video with page background */}
            <div className="absolute bottom-0 left-0 w-full h-40 bg-gradient-to-t from-[#fbe1b1] via-[#fbe1b1]/60 to-transparent z-0 pointer-events-none" />

            {/* Text Overlay 1 */}
            <div
                className="absolute text-center z-10 pointer-events-none mix-blend-normal"
                style={{
                    left: '52.5%',
                    top: '38.5%',
                    width: 'auto',
                    whiteSpace: 'nowrap',
                    transform: 'translate(-50%, -50%)',
                    fontFamily: "Adelphe Fructidor Regular",
                    fontSize: '85px',
                    lineHeight: '87px',
                    letterSpacing: '-2px',
                    color: '#7D5656',
                }}
            >
                Build. Break. Deploy
            </div>

            {/* Text Overlay 2 */}
            <div
                className="absolute text-center z-10 pointer-events-none mix-blend-normal"
                style={{
                    left: '57.8%',
                    top: '47%',
                    width: 'auto',
                    whiteSpace: 'nowrap',
                    transform: 'translate(-50%, -50%)',
                    fontFamily: "Adelphe Fructidor Regular",
                    fontSize: '52px',
                    lineHeight: '54px',
                    letterSpacing: '0px',
                    color: '#7D5656',
                    fontWeight: 500,
                }}
            >
                effortlessly on Stellar
            </div>
        </>
    );
}