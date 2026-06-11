import { useRef, useEffect, useState } from "react"

export default function StickyBlurReveal({
    text = "This text unblurs and fades in word by word as you scroll",
    color = "#ffffff",
    fontFamily = "JetBrains Mono, monospace",
    fontWeight = 400,
    fontSize = 24,
    lineHeight = 1.5,
    fullRevealDistance = 500,
    initialBlur = 4,
    initialOpacity = 0.05,
    letterSpacing = 0,
    // Optional explicit scroll container selector; defaults to nearest [data-scroll-container]
    scrollContainerSelector = "[data-scroll-container]",
}) {
    const wrapperRef = useRef(null)
    const [scrollProgress, setScrollProgress] = useState(0)
    const [isVisible, setIsVisible] = useState(false)

    useEffect(() => {
        const wrapper = wrapperRef.current
        if (!wrapper) return

        // Find the scrolling ancestor
        const scrollEl = wrapper.closest(scrollContainerSelector) ?? window

        const update = () => {
            const rect = wrapper.getBoundingClientRect()
            // Determine how far we've scrolled into the wrapper.
            // rect.top is relative to the viewport; as the user scrolls down,
            // rect.top decreases. When rect.top reaches 0, the sticky child
            // pins. Continued scrolling causes rect.top to go negative.
            const scrolledIn = -rect.top
            setScrollProgress(Math.max(0, Math.min(1, scrolledIn / fullRevealDistance)))
            setIsVisible(rect.bottom > 0 && rect.top < window.innerHeight)
        }

        update()
        scrollEl.addEventListener("scroll", update, { passive: true })
        window.addEventListener("resize", update, { passive: true })
        return () => {
            scrollEl.removeEventListener("scroll", update)
            window.removeEventListener("resize", update)
        }
    }, [fullRevealDistance, scrollContainerSelector])

    const words = (text || "").split(" ")

    return (
        // Wrapper drives the scroll range; its height = reveal distance + some padding
        <div
            ref={wrapperRef}
            style={{ height: fullRevealDistance + 120, position: "relative" }}
        >
            <div
                style={{
                    position: "sticky",
                    top: 0,
                    width: "100%",
                    color,
                    fontFamily,
                    fontWeight,
                    fontSize: `${fontSize}px`,
                    lineHeight,
                    opacity: isVisible ? 1 : 0,
                    letterSpacing: `${letterSpacing}px`,
                    textAlign: "center",
                    boxSizing: "border-box",
                    padding: "2rem 1rem",
                    transition: "opacity 0.4s ease",
                }}
            >
                {words.map((word, index) => {
                    const wordProgress =
                        (scrollProgress - index / words.length) * words.length
                    const progress = Math.max(0, Math.min(1, wordProgress))
                    const blurAmount = initialBlur * (1 - progress)
                    const opacity =
                        initialOpacity + (1 - initialOpacity) * progress
                    return (
                        <span
                            key={index}
                            style={{
                                display: "inline-block",
                                marginRight: "0.3em",
                                filter: `blur(${blurAmount}px)`,
                                opacity,
                                transition:
                                    "filter 0.25s ease-out, opacity 0.25s ease-out",
                            }}
                        >
                            {word}
                        </span>
                    )
                })}
            </div>
        </div>
    )
}
